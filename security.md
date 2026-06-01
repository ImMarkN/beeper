# Security Policy

This document outlines the security controls implemented in the `beeper` system to protect PII and prevent service abuse.

## Authentication & Authorization

### Webhook Validation
The `receiveMessage` endpoint is public. To prevent unauthorized triggers that could lead to SMS toll fraud or social engineering, the system implements **Twilio Request Validation**.
- The function uses the `X-Twilio-Signature` header and the `TWILIO_AUTH_TOKEN` to verify that the request originated from Twilio.
- Unsigned or invalid requests are rejected with a `401 Unauthorized` response.

## Secret Management

Sensitive credentials (`THREE_RINGS_API_KEY`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`) are required for operation.
- **Environment Variables**: Managed through the Cloud Function configuration.
- **Recommendation**: In production environments, these should be linked to **Google Cloud Secret Manager** to ensure they are encrypted at rest and not visible in plain text in the Cloud Console.

## Data Protection & Privacy (GDPR)

### PII Handling
The system handles volunteer names and phone numbers.
- **Logging**: All logs are sanitized. `console.error` blocks specifically redact sensitive error details to prevent volunteer phone numbers or API keys from being leaked into Google Cloud Logging.
- **Persistence**: Only the rota structure (shift mappings) is cached in Firestore. Volunteer contact details are fetched just-in-time and are not stored in the persistent database.

## Defensive Coding

### Input Validation
The function strictly validates the inbound request signature and presence of required identifiers (like `MessageSid`) before processing business logic.

### Idempotency
To prevent service abuse or accidental double-alerts (e.g., due to Twilio webhook retries), the system implements an idempotency layer using Firestore.
- Every unique `MessageSid` is recorded in a `processed_messages` collection upon arrival.
- Duplicate requests for the same ID are ignored with a `204 No Content` response.

### Redundancy
By implementing a Firestore-backed fallback, the system ensures that a "Denial of Service" on the Three Rings API does not result in a "Denial of Alerting" for the physical security team.