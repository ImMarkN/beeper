import type { Request, Response } from "@google-cloud/functions-framework";
import * as functions from "@google-cloud/functions-framework";
import { Firestore } from "@google-cloud/firestore";

import twilio from "twilio";
import Config from "./config";
import { ThreeRingsHttpRepository } from "./repository/ThreeRingsHttpRepository";
import { ThreeRingsService } from "./service/three-rings";
import { RotaType, VolunteerPropertyType } from "./types";
import type { TwilioBody } from "./types/RequestBody.type";
import Utility from "./utility";
import type { RotaResponse } from "./types/RotaResponse.type";

const db = new Firestore();
const stateRef = db.collection("state").doc("beeper-status");
const FAILURE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

const receiveMessage = async (req: Request, res: Response) => {
	// 1. Webhook Authentication
	const signature = req.header("X-Twilio-Signature");
	const url = Config.getWebhookUrl();
	const authToken = Config.getTwilioAuthToken();

	if (!twilio.validateRequest(authToken, signature || "", url, req.body)) {
		console.error("Unauthorized request: Twilio signature validation failed.");
		return res.status(401).send("Unauthorized");
	}

	const body = req.body as TwilioBody;

	// 2. Idempotency Check
	// Twilio provides a unique ID for every inbound message. We use this to prevent 
	// sending duplicate alerts if Twilio retries the webhook due to a timeout.
	const messageSid = body.MessageSid || body.SmsSid;
	if (messageSid) {
		const messageRef = db.collection("processed_messages").doc(messageSid);
		try {
			// create() is atomic and will fail if the document ID already exists.
			await messageRef.create({
				processedAt: new Date().toISOString(),
			});
		} catch (error: any) {
			if (error.code === 6) { // 6 = ALREADY_EXISTS
				console.log(`Duplicate alert detected for MessageSid: ${messageSid}. Skipping.`);
				return res.status(204).send({});
			}
			console.warn("Idempotency check failed, proceeding to ensure alert delivery:", error.message);
		}
	}

	const client = twilio(
		Config.getTwilioAccountSid(),
		Config.getTwilioAuthToken(),
	);

	const threeRings = new ThreeRingsService(new ThreeRingsHttpRepository());
	const currentDateTime = Utility.getCurrentDate();

	// 3. Persistent State Recovery
	const stateDoc = await stateRef.get();
	const stateData = stateDoc.data() || {};
	let rota: RotaResponse | null = stateData.cachedRota || null;
	let firstFailureTimestamp: number | null = stateData.firstFailureTimestamp || null;

	try {
		const freshRota = await threeRings.getRotaExportForDay(currentDateTime);
		if (!freshRota || !freshRota.shifts || freshRota.shifts.length === 0) {
			throw new Error("Empty rota payload received.");
		}

		rota = freshRota;
		await stateRef.set({ cachedRota: freshRota, firstFailureTimestamp: null }, { merge: true });
	} catch (error) {
		console.error("Three Rings API failure: [Redacted PII]");
		const now = Date.now();
		if (firstFailureTimestamp === null) {
			firstFailureTimestamp = now;
			await stateRef.set({ firstFailureTimestamp }, { merge: true });
		}

		if (now - firstFailureTimestamp > FAILURE_THRESHOLD_MS) {
			console.error("CRITICAL: Three Rings API has been failing for over 1 hour.");
		}

		if (!rota) {
			return res.status(500).send({ error: "API failure and no cache available." });
		}
	}

	// 4. Best-Effort Dispatch
	try {
		const phoneNumbers = new Set<string>();
		const roles = [RotaType.CONTROLLER, RotaType.DUTY_TRUSTEE];

		for (const role of roles) {
			try {
				const volunteers = threeRings.getVolunteersForShift(rota.shifts, currentDateTime, role);
				for (const v of volunteers) {
					const details = await threeRings.getVolunteerDetails(v.id);
					const phone = threeRings.getVolunteerProperty(details.volunteer, VolunteerPropertyType.TELEPHONE);
					phoneNumbers.add(phone);
				}
			} catch (err) {
				console.warn(`Role lookup failed for ${role}: [Redacted PII]`);
			}
		}

		if (phoneNumbers.size === 0) {
			throw new Error("No volunteers identified for notification.");
		}

		for (const phoneNumber of phoneNumbers) {
			await client.messages.create({
				body: body.Body,
				from: body.From,
				to: phoneNumber,
			});
		}

		return res.status(204).send({});
	} catch (error) {
		console.error("Dispatch Error: [Redacted Details]");
		return res.status(500).send({ error: "Failed to dispatch alerts." });
	}
};

functions.http("receiveMessage", receiveMessage);

export { receiveMessage };
