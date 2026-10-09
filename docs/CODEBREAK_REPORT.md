# Code-break report — 5 October 2026

## Baseline

The original tests started a real listener during ESM import; reproduced as EPERM on port 4300 inside the execution sandbox (same import-side-effect defect that caused EADDRINUSE in the previous handover). Moved listening to `start.js`; `buildServer()` never binds a port. Isolated test stores by process, with test environment set before module loading. Original tests and widget build passed afterward.

## Pass 1 — runtime, workflow and permissions

Found and fixed public repeat-registration credential disclosure, unauthenticated socket agent roles, arbitrary conversation joins/writes, token leakage in conversation/site payloads, missing agent workflow endpoints, absent local FAQ version checks and insufficient site-state transition checks. Added authenticated conversation capability tokens, expiring staff JWTs, role enforcement, request-key deduplication, assignment/capacity/availability, local FAQ conflicts, central overrides and audit routes.

Added a complete injected workflow scenario covering registration, private setup, hidden pre-approval content, decline/reason/resubmit, central FAQ precedence, approval, agent permissions, duplicate conversation/message requests, claim-before-reply, capacity, suspension/restoration, closure and audit records.

The browser run exposed a CORS issue missed by API injection: preflight did not allow PATCH/PUT/DELETE. Added explicit methods and a regression assertion. Browser approval and two-way messaging then passed.

## Pass 2 — concurrency, storage and reconnect

Found and fixed concurrent administrator bootstrap, ambiguous empty broadcast selection, unnormalized website origins, overlapping widget synchronization, and unstable development JWTs across restarts. Bundled the Socket.IO client into the standalone widget. Store writes now use atomic replacement with rollback; malformed JSON stops startup. Test processes never reset the development store.

Added tests for bootstrap races, validation, normalized registration conflicts, CORS, empty/invalid broadcast targets, local FAQ optimistic concurrency/deletion and rate limiting. Live socket checks verify visitor delivery, forged-role rejection, invalid visitor capabilities and room isolation.

The browser tool's network interception did not actually stop API traffic; it was not accepted as outage evidence. Replaced it with SIGSTOP/SIGCONT of the actual local API process, with guaranteed resume cleanup. Cached approved FAQ visibility, disabled live chat and automatic central resync passed with the API unavailable.

## Pass 3 — visual review, resource use and documentation

Inspected screenshots of all three apps. Fixed low-contrast inbox names against the approved light ticket-list surface and an agent timeout banner persisting after recovery. Avoided rewriting unchanged widget messages on every poll, retained closed-conversation Send gating, disabled inappropriate administrator Claim/availability controls, and denied development data/secret paths in Vite.

Documented the installation contract, state machine, API, roles, cache semantics, run commands, environment variables, single-process persistence decision and production limits. The original visual reference is untouched; shared console styles are extracted from it.

## Verification status

- Automated API suite: six passing scenarios with workflow, state, security, race and input assertions.
- Production build: standalone widget and all three frontend entries pass.
- Browser free run: approval, central FAQ override, visitor creation, agent claim/reply, visitor reply, suspension/hiding, restore, actual API pause, cached FAQ fallback and central resync passed.
- Live Socket.IO test: passed; no private message delivered to an unauthorized site subscriber.
- Final repeat runs and final process cleanup: see the appended final result below.

## Remaining limitations

- The dummy installation UI is a local simulator. A real CMS/website plugin needs authenticated server-side setup and secure persistence of installation credentials. Token rotation/recovery and staff password reset are not yet implemented.
- JSON persistence supports one API process. Large histories, multiple workers, database migrations, backups, retention, centralized rate limits and production monitoring are outside this local MVP.
- Agents are created by central administration; performance visibility is active/capacity/closed totals, not a full analytics suite.
- Visitors remain unknown. Prototype order, customer verification, file, escalation and external self-service tools are not connected to an authoritative provider.
- Offline FAQ fallback requires a previously cached approval. A suspension issued while the client is disconnected cannot be known until reconnection. Offline page reload also depends on the host serving/caching its own assets.
- The widget polls every three seconds and the agent console every five seconds as reconciliation fallbacks; production scale should tune these intervals and retention.
- Local browser verification uses seeded demo accounts and the existing installation session. It is not a hermetic CI browser fixture.

## Final result

Three complete browser free runs passed after repairs. Evidence is stored in `docs/evidence/free-run-1.log`, `free-run-2.log` and `free-run-3.log`; final test/build output is in `docs/evidence/test-build.log`. Screenshots in the same folder show admin review, the agent inbox and the live widget. No known critical/high defect remains in the verified local simulation scope; the production limitations above remain explicit.

Final edge checks passed: duplicate widget initialization stays hidden, reload preserves the conversation ID and history, and Vite returns 403 for the private development store. Added a sixth automated scenario proving one/all-site broadcasts, approved empty FAQs, FAQ deletion, ownership transfer, away-agent rejection and old-owner reply rejection.

Browser runtime-error checks returned no JavaScript errors. Closed all three verification browser sessions and stopped the four project listeners. Final port inspection found no listeners on 4300–4303; unrelated applications were not stopped. No remote push was performed.

Scope of browser repetitions: installation, local FAQ creation and pre-approval invisibility were checked in the initial UI setup. The three saved successful browser passes reuse that installation and conversation; they recheck the operational journey through chat, governance and actual outage/recovery. Registration/decline/resubmission and fresh-conversation cases are additionally repeated in the automated API suite. This distinction is intentional in the evidence; the saved continuation harness does not recreate a fresh installation on every pass.

## Continuation — installation credential recovery

Implemented central-admin credential rotation with a mandatory audit reason and one-time replacement output. Previous credentials stop authorizing local setup and edits immediately. The installer can reconnect to an existing site and recover its settings/FAQ access without duplicate registration or changing approval state. Reconnect verifies the website origin and clears submitted credential fields after success.

Installation credentials are now SHA-256 digests at rest with timing-safe comparisons. Startup migrates existing plaintext records atomically while preserving their valid credentials. Listings, bootstrap, setup and audit history omit both credentials and stored digests. API responses explicitly disable caching.

Eight automated tests pass, including two new migration/recovery scenarios with permission, invalidation, data-preservation, no-store and secret-exposure assertions. All builds pass. Browser verification passed central rotation, fresh-session reconnect, reload and dismissal of the one-time credential. The existing development store was checked: no plaintext installation credentials remain. Evidence is in `docs/evidence/installation-recovery-*`.

This supersedes the earlier token-rotation/recovery limitation. Authenticated host-side installation, staff password reset and production persistence/operations remain future work. The local demo remains a simulator and stores its privileged credential in session storage; production host plugins must store it privately server-side.

## Continuation — staff password recovery and session revocation

Implemented known-password changes for administrators and agents, administrator-issued agent reset codes with administrator reauthentication/audit reason, and an offline sole-administrator recovery command. Codes use 256-bit randomness, are stored only as digests, expire after 15 minutes, supersede previous codes and are single-use even under concurrent requests. Passwords that bcrypt would truncate are rejected. Credential updates and their audit events are saved together.

Added authentication-version checks to every staff HTTP guard and socket handshake. Password completion invalidates all previous user tokens and disconnects that user's active sockets; other users remain signed in. Socket sessions also terminate at JWT expiry. Protected-client requests return to sign-in after session invalidation. Reset digests/internal auth state are omitted from staff lists and audit responses.

The offline recovery command owns the same store as the API. Added a filesystem ownership lock to prevent either process overwriting the other's in-memory state. The command refuses a running/locked store; graceful shutdown releases ownership. Crash-stale locks require operator verification before removal. This is deliberately single-process protection, not a database migration.

Eleven automated scenarios pass, including new tests for password changes, stale HTTP tokens, reauthentication, expiration, replaced codes, single-use concurrency, secret omission, unrelated-session preservation and offline recovery lock enforcement. All frontend/widget builds pass.

Browser verification passed administrator issuance, code redemption in a separate session, automatic logout of the already-open agent console, rejected old HTTP/socket credentials, self-service password change and successful new-password sign-in. The first browser attempt encountered the expected page navigation during password change; the test harness was corrected to verify the new page after navigation. The rerun passed. Existing live chat delivery and socket isolation also passed after the authentication change. No demo administrator/agent password was changed; dedicated verification agents were used.

Evidence: `docs/evidence/password-recovery-tests.log`, `password-recovery-browser.log`, and `password-recovery-agent.png`. See `docs/ACCOUNT_RECOVERY.md` for operator procedures. This supersedes earlier statements that staff password reset is unimplemented. Authenticated host-side installation and production database/backup/deployment work remain unfinished.

Latest cleanup confirmed no listeners on ports 4300–4303 and no remaining development store lock. Verification browser sessions were closed. Changes remain local; nothing was pushed.

## Continuation — authenticated generic host installer

Replaced browser-only installation setup with a reusable Node host service and a separate authenticated website-administration page. The host stores installation credentials privately (0600 file, atomic replacement, exclusive ownership) and proxies only scoped setup/settings/FAQ/resubmit operations. The public website retrieves only the site key and central origin and no longer depends on the installer's local/session storage. Old simulator credential-storage keys are removed on page load.

Added HttpOnly/SameSite sessions, Secure cookies for HTTPS, expiry/logout, login throttling, exact Host/Origin checks, CSRF tokens for authenticated writes and no-store responses. Production startup requires configured host credentials, explicit origins and HTTPS. The development host service is loopback-only on port 4304, proxied at `/host-api` by the website.

Added retry-safe registration: persist a host-generated random credential before calling central; the central service accepts repeat registration only with matching ownership proof. A lost response can be retried after process restart without creating another site or revealing someone else's credentials. Reconnect checks website ownership and persists a replacement credential on the host.

Fifteen automated scenarios pass. New tests cover unauthorized reads/writes, Host/Origin/CSRF rejection, secure and expired cookies, login rate limiting, mode-0600 storage, public response filtering, host restart, registration-response loss, retry idempotency and cross-website reconnect rejection. All four frontend entries and the widget build.

A fresh browser journey ran against isolated empty data: protected login → install pending → local FAQ → hidden public widget → decline with visible reason → resubmit → central override → approve → visitor chat → agent claim/reply → visitor reply → separate unauthenticated visitor → host logout/relogin → persisted title → suspension/hide → restore → actual API SIGSTOP/SIGCONT → cached FAQs and disabled offline chat → central resync. It passed. Screenshots were inspected. Live socket delivery/isolation and credential rotation/reconnect through the new host page also passed.

This supersedes the earlier browser-simulator/server-side-installer limitation. The generic Node integration is implemented; a platform-specific CMS package, production database, backup/restore and deployment operations remain future work. The host's one-password/in-memory-session example is not a substitute for a larger site's existing administrator identity system.

The existing local demo was subsequently migrated through authenticated credential rotation and host reconnect. Its replacement credential is stored only in the ignored host installation file (mode 0600); existing site content and staff passwords were preserved. Final browser checks confirmed the public widget is visible, unauthenticated host setup returns 401, and both private data files return 403. Verification browser sessions and all five development services were stopped; both store ownership locks were released. Nothing was pushed.


## Continuation — local production simulation

Implemented an isolated production-mode runtime with compiled assets, a loopback HTTPS reverse proxy (including WebSocket upgrades), fresh private credentials and SQLite persistence. Development data is preserved. The SQLite migration retains its legacy source, rejects invalid relationships, and commits differential row changes atomically. Tests exercise failure after partial transaction execution and retry after failed migration.

Added offline database and complete simulation backup/restore tooling with checksums, database integrity checks, private file permissions and non-overwriting restores. A complete disposable rehearsal starts fresh, performs real HTTPS installation/approval/chat, stops, backs up database plus host/config/TLS secrets, restores into an empty directory, restarts and repeats the workflow while checking retained state.

Added automatic production retention for old closed conversations/messages and audit entries, `/ready`, administrator-only operations metrics and period reports, and report/status display in the administrator console. Compiled client URLs and agent navigation now use the current production origin. The production bootstrap form supports the bootstrap secret; host/API sessions and private files remain protected.

Validation: 18 tests passed against JSON and all 18 passed against SQLite; builds passed. Production HTTPS smoke and restore/restart rehearsal passed. Browser checks passed administrator login/report/navigation, host setup and HttpOnly session, and public widget controls with no browser errors. The original custom-element visibility wait was replaced with a DOM-presence wait because its visible controls are shadow-DOM descendants. Admin/host/public screenshots were inspected. npm audit reported zero vulnerabilities. CI was added but has not run on a remote service.

The result is a local production rehearsal, not a deployed production service or a multi-worker database. Real hosting, DNS/certificates, off-machine backup scheduling, external alert delivery and real organizational policies await a selected destination. No remote push or deployment occurred.


## Continuation — approved template restoration

Restored the original customer/agent/login/About markup hierarchy and exact approved stylesheet. Scoped new administration styles to prevent layout overrides. Original service controls remain visible; real ticket/FAQ/chat behavior replaces prototype records and missing providers produce explicit information states. Both original themes and responsive layouts were visually inspected.

Implemented real file/image/video/voice uploads/downloads and original media preview wrappers, live agent quick actions, transfer dialogs, timelines and saved visitor tickets. Code review and fault injection caught and fixed draft loss on uncertain retries, stale ticket selection responses, file destination races and same-file retry failures. Production CSP now permits protected blob image/media previews. FAQ bounds match across all write routes.

Verification: 23 tests passed for JSON and 23 for SQLite; five frontend entries plus widget built. Customer navigation/actions, languages/themes/mobile, ticket flows, media, offline/resume and retries passed. Agent search/tabs/actions/tools, draft preservation, maximum FAQ, protected media, capacity, transfers, resolution, administrator assignment and mobile passed. Administration/settings/FAQ/account dialogs and About were checked in browsers. A disposable HTTPS rehearsal verified attachments and state recovery through a complete backup/restore/restart. Sanitized logs and screenshots are saved under `docs/evidence/template-*`.

Original source SHA-256: `9a17a58ee1b55f7df8f626731e2b509bb3abf07a56e34248cf3dcd98820cacd8`. `approved.css` matches its style block exactly. Existing user simulation accounts/data are preserved. No remote push or deployment.

Final governance browser verification passed suspension/restoration, reason guards, installer credential rotation/reconnect/persistence, decline/resubmit/approval, password reset and change, live old-session revocation, logout and bootstrap protection. The run caught a shared-client bug: an empty JSON content type on bodyless DELETE requests caused central FAQ deletion to fail. The client now supplies that content type only when sending a body and clears stale form errors before a retry. The corrected browser run passed without browser errors, and the final production assets were rebuilt.

Cleanup: isolated development listeners on 4300–4304 and their store locks are gone; verification browsers are closed. The user's updated HTTPS simulation remains running on port 4443 for testing.
