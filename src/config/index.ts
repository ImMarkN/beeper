import "dotenv/config";

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

// biome-ignore lint/complexity/noStaticOnlyClass: <we dont need an instance for "config">
export default class Config {
	static getTwilioAccountSid(): string {
		return required("TWILIO_ACCOUNT_SID");
	}

	static getTwilioAuthToken(): string {
		return required("TWILIO_AUTH_TOKEN");
	}

	static getThreeRingsApiKey(): string {
		return required("THREE_RINGS_API_KEY");
	}

	static getWebhookUrl(): string {
		return required("WEBHOOK_URL");
	}
}
