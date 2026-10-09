# API

JSON request/response bodies. Errors return `{error}` with 400 validation, 401 authentication, 403 permission, 404 missing resource, 409 conflict, or 429 rate limit. Staff requests use `Authorization: Bearer <JWT>` (8-hour expiry). Local setup uses `x-install-token`; legacy local FAQ creation and resubmit pass `installToken` in the JSON body. Visitor requests use `x-visitor-token`.

| Method/path | Authorization and behavior |
| --- | --- |
| GET `/health` | Public health |
| POST `/api/auth/bootstrap-admin` | First account only; name, email, password; production bootstrap header required |
| POST `/api/auth/change-password` | Staff JWT; currentPassword and newPassword; revokes all sessions for that user |
| POST `/api/admin/agents/:id/password-reset` | Central-admin JWT plus currentPassword and audit reason; returns single-use resetToken and expiresAt |
| POST `/api/auth/reset-password` | Email, resetToken and newPassword; consumes a valid code and revokes the target user's old sessions |
| POST `/api/auth/login` | Email/password → token and safe user |
| POST `/api/sites/register` | Name, HTTP(S) URL, optional platform/adminEmail/registrationToken → pending site key and install token; matching registrationToken permits safe retry |
| GET `/api/sites/:siteKey/bootstrap` | Public status/settings; FAQs only when approved |
| GET `/api/sites/:siteKey/setup` | Local token; private site review and FAQs |
| PATCH `/api/sites/:siteKey/settings` | Local token; title |
| POST `/api/sites/:siteKey/resubmit` | Local token in body; declined → pending |
| GET `/api/sites/:siteKey/faqs` | Public if approved, otherwise local token or central admin |
| POST `/api/sites/:siteKey/faqs` | Install token, question, answer |
| PUT/DELETE `/api/sites/:siteKey/faqs/:id` | Local token; version required; central ownership conflicts |
| GET `/api/admin/sites` | Central admin; no installation tokens |
| PATCH `/api/admin/sites/:id/status` | Central admin; status, reason required for decline/suspend |
| PUT/DELETE `/api/admin/faqs/:id` | Central admin override/delete |
| POST `/api/admin/faqs/broadcast` | Central admin; question, answer, optional nonempty siteIds (omit for all) |
| POST `/api/admin/sites/:id/install-credentials` | Central admin; required reason (3–1000 characters); rotates credential and returns siteKey/installToken once |
| GET `/api/admin/audit` | Central admin; last 300 records |
| POST `/api/admin/agents` | Central admin; name, email, password (10+), capacity (1–50) |
| GET `/api/agents` | Staff; safe agent profile, availability, active/closed counts |
| PATCH `/api/agent/availability` | Staff; available boolean |
| POST `/api/conversations` | Approved siteKey, text, optional visitorName, random requestKey (20–100 chars); idempotent creation |
| GET `/api/agent/conversations` | Staff; history and safe site context |
| GET `/api/conversations/:id` | Staff or matching visitor token; conversation and messages |
| POST `/api/conversations/:id/messages` | Staff owner/admin or visitor; text and random requestKey; approved site and unclosed conversation required |
| PATCH `/api/conversations/:id` | Staff owner/admin; assignedAgentId and/or status open/pending/closed |

Socket handshake uses `{token}` for staff, `{siteKey}` for public changes, or `{siteKey,conversationId,visitorToken}` for visitor chat. Events: `site:status`, `faq:changed`, `conversation:new`, `conversation:changed`, `message:new`. Staff may join a conversation with `conversation:join`; visitors cannot join someone else's room. Message writes use HTTP, not a client-asserted socket sender role.

Write routes are limited to 60 requests per IP/path/minute per process. This local limit is not a distributed abuse-prevention service. Request bodies are capped at 32 KiB. CORS permits configured origins and approved website origins. Sensitive development store paths are denied by Vite.

API responses use `Cache-Control: no-store`. Installation tokens are stored as hashes and compared using a timing-safe digest comparison. Rotation invalidates the old credential across local setup, settings, FAQ and resubmit operations.

Staff JWTs include an authentication version checked against the current user record on every protected HTTP request and socket handshake. Password completion increments the version and disconnects existing staff sockets. Staff sockets are also disconnected at JWT expiration. Reset codes are valid for 15 minutes, replace any previous code, are stored only as SHA-256 digests, and are omitted from user/audit responses. Password updates and their audit event are saved together.

Generic host integration routes are documented separately in [HOST_INSTALLER.md](HOST_INSTALLER.md). Public registration can accept a host-generated 43-character base64url `registrationToken` (32 random bytes). The central service stores its digest as the installation credential. A repeat registration for the same origin succeeds only when that token matches; it returns the existing siteKey/status and never reveals another installation’s credential.


## Operations and reports

- `GET /health`: process liveness.
- `GET /ready`: database readiness (200 or 503).
- `GET /api/admin/operations`: central-admin-only uptime, request/error counters, mean response time, storage status and record counts. Counters reset on process restart.
- `GET /api/admin/reports?days=30`: central-admin-only retained conversations created within 1–365 days, status totals and site/agent breakdown. Retention can limit historical coverage.

Production retention and backup/recovery procedures are documented in `PRODUCTION_SIMULATION.md`.


## Conversation attachments and timeline

- `POST /api/conversations/:id/attachments`: JSON `{name,mime,data,requestKey,text?}` with base64 data, maximum 2 MiB decoded. Requires the same visitor or assigned-staff authorization and writable-site/conversation state as messages. Retries with identical request keys/payloads return the same message; changed payloads return409.
- `GET /api/conversations/:id/attachments/:attachmentId`: authenticated binary download. No bearer credentials in URLs. Responses force download and private/no-store/nosniff headers.
- Conversation views include safe attachment metadata, timeline and transfer history. Base64 payloads are omitted from all normal API/socket message views.
- FAQ writes consistently trim and enforce question3–300 / answer1–5000 characters.
