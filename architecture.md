# Architecture

The `beeper` system is a serverless alerting pipeline built using Google Cloud Functions, Firestore, and Twilio. It acts as a bridge between the BikeTrac tracking system and on-call volunteers.

## System Components

- **Twilio SMS Webhook**: Receives inbound SMS from BikeTrac and triggers the Cloud Function.
- **Google Cloud Function (`receiveMessage`)**: A Node.js (TypeScript) function that processes the alert logic.
- **Three Rings API**: The external source of truth for volunteer rotas and contact details.
- **Google Cloud Firestore**: A persistent NoSQL store used to maintain state across execution environments.

## Logic Flow

1. **Webhook Trigger**: Twilio sends a POST request to the function.
2. **Authentication**: The function verifies the Twilio cryptographic signature to ensure the request is legitimate.
3. **Idempotency Check**: The function uses the Twilio `MessageSid` to ensure the same alert is not processed multiple times in the event of a webhook retry.
4. **State Recovery**: The function retrieves the last successful `cachedRota` and any existing `firstFailureTimestamp` from Firestore.
5. **Rota Management**:
   - The function attempts to fetch the live rota from Three Rings.
   - **On Success**: The Firestore cache is updated with the fresh rota, and any failure tracking is reset.
   - **On Failure**: The system falls back to the `cachedRota`.
6. **Sequential Failure Monitoring**: If Three Rings remains unreachable or returns empty data for more than **one hour**, the system logs a critical error for infrastructure monitoring.
7. **Volunteer Lookup**:
   - The system identifies volunteers currently assigned to the **Controller** and **Duty Trustee** shifts.
   - It fetches the telephone numbers for these volunteers from the Three Rings directory.
8. **Alert Dispatch**: The original SMS message is forwarded to all identified volunteers using the Twilio API.

## Resilience Design

Cloud Functions are ephemeral. By utilizing Firestore rather than local memory for caching:
- **Cold Starts**: New function instances can immediately access the last known good rota if Three Rings is down.
- **Durability**: Failure tracking persists across scaling events, ensuring the 1-hour alert threshold is accurate.