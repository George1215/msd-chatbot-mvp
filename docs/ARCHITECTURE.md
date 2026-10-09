# Architecture

The central Fastify service owns authentication, site governance, FAQ revisions, conversations and audit history. Socket.IO delivers change notifications; authenticated HTTP commands persist messages and implement retries using idempotency keys. Clients also reconcile periodically after missed events or reconnection.

- `services/api/src/server.js`: import-safe Fastify construction, auth, site governance and central FAQ routes.
- `services/api/src/workflows.js`: local setup, agent management, chat authorization, assignment and socket authorization.
- `services/api/src/start.js`: environment loading, port binding and shutdown.
- `services/api/src/staff-auth.js`: shared staff-session validation, password change and one-time reset workflows.
- `services/api/src/store-lock.js`: exclusive local ownership of the application store; prevents offline operator/API competing writes.
- `services/api/src/store.js`: single-process state facade with JSON development storage and SQLite production storage. Corrupt storage stops startup rather than silently resetting data.
- `services/api/src/sqlite-store.js`: versioned transactional SQLite persistence and legacy import.
- `services/api/src/operations.js`: retention, database readiness, operational metrics and reports.
- `scripts/production-local.mjs` and `scripts/gateway.mjs`: isolated compiled HTTPS simulation; `verify-production.mjs` rehearses full backup/restore/restart.
- `apps/admin`: site review, FAQ governance, agent creation and workload/completion totals, audit history.
- `apps/agent`: queue, history, claim/transfer, status, replies and availability.
- `apps/dummy-site`: public widget host and separate authenticated website-administration page.
- `packages/host-installer`: generic website-side Fastify service, session/CSRF checks, private credential persistence and scoped proxy routes.
- `services/host`: loopback deployment wrapper for the installer, with production configuration checks.
- `packages/shared/src/file-lock.js`: exclusive ownership helper shared by central and host stores.
- `packages/widget`: standalone custom element with bundled Socket.IO client and shadow DOM.
- `apps/shared/approved.css`: extracted from the untouched `.ui-source/index.html`; the console reuses its shell, cards, colors, spacing and message classes. The widget uses the same dark palette and card language. Prototype-only external-service tools are not presented as working integrations.

## Trust boundaries

Central administrators receive expiring, versioned JWTs. Every protected request validates the account and its current authentication version. Password changes/reset completion revoke prior versions and disconnect that user's staff sockets; sockets also expire at the token deadline. Administrator-issued agent reset codes require reauthentication and an audit reason. The sole administrator has an offline operator recovery command (see `ACCOUNT_RECOVERY.md`). Agents use their own accounts and cannot change site governance or FAQs. An installation token authorizes one site's local setup; only its SHA-256 digest is stored centrally, and central administrators can rotate it with an audit reason; it must be held by the host application's authenticated backend in a real installation. The public widget only needs the site key. Public registration never returns another installation's token. Host registration persists a random credential before making the request and supplies it as ownership proof, so a lost response can be retried without duplication.

The website host protects administration using an HttpOnly SameSite session and same-origin/CSRF checks. Its private file contains the credential needed to call central; the public `/host-api/widget` endpoint exposes only the site key and central origin. Settings and FAQ mutations are proxied server-side. Sessions expire or clear on host restart, while installation ownership persists.

Visitors receive a random conversation bearer token. They can read and write only their conversation. Agent sender identity is derived from authentication, never supplied by the visitor. An agent must claim a conversation before replying. Transfers and reopening respect capacity/availability. All visitor identities remain `unknown`; no customer/order system is assumed.

Socket rooms require either staff JWTs, a public site key (public change notifications only), or a matching visitor conversation token. Message writes go through the same HTTP permission checks used by tests; there is no unguarded socket write path.

## State and synchronization

Pending → approved or declined. Declined → pending on local resubmission; central administration can also approve. Approved → suspended with a reason. Suspended → approved. Approval immediately enables the widget; suspension hides it and rejects message writes.

Local FAQ changes require the current version. Once central administration owns a FAQ, local updates/deletes return 409. Central changes always win; deletes are tombstones. Broadcast supports one, selected, or all sites, rejecting empty or invalid explicit selections.

Only a previously approved bootstrap is eligible for offline fallback. A received suspension replaces that cache and stays hidden offline. During total disconnection, a previously cached approval cannot know about a new suspension; cached FAQ remains visible until reconnection. Chat is disabled while offline. Bootstrap refresh replaces cached content; nothing uploads cached FAQ data.

## Persistence decision

Development retains its existing JSON store. Production mode requires SQLite: six record tables, versioned initialization/import, WAL, full synchronous durability, and atomic differential row writes. An exclusive process lock protects the in-memory working copy from competing API/operator processes. Exactly one API process owns a local database. Offline backup/restore verifies checksums, integrity and record relationships; production retention removes expired closed transcripts and audit history. The local HTTPS simulation serves compiled bundles and exercises restart from a full private backup. See `PRODUCTION_SIMULATION.md`. Horizontal scaling still requires shared transactional reads and a shared socket/session layer.
