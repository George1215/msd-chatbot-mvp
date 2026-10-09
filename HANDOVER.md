# Chat MSD Bot — current handover

Updated 5 October 2026. Work only in `/Users/macbookpro/Documents/Chat MSD Bot`. Keep work local; do not push unless explicitly requested. `.ui-source/index.html` remains the untouched visual reference.

## Delivered

- Central API, admin console, agent console, public demonstration website and standalone widget.
- Registration/approval/decline/resubmit/suspend/restore; local FAQ/settings management; central FAQ override and broadcast.
- Persistent two-way chat/history, claim/transfer, agent availability/capacity, audit history and offline FAQ reconciliation.
- Role checks, versioned staff sessions, password change/reset, sole-admin offline recovery, rate limits, CORS and authenticated socket rooms.
- Installation credential hashing/rotation/recovery and shared exclusive file ownership for the private stores.
- Generic authenticated website-side installer in `packages/host-installer`, with its wrapper in `services/host`.
- Separate protected website-administration page, HttpOnly sessions, exact Host/Origin validation and CSRF protection.
- Host-private credential persistence; public visitors receive only a site key and central origin. Browser/session storage no longer holds installation credentials.
- Registration ownership proof persisted before the first request, enabling safe retry after a lost central response without duplicate sites.

## Run

`npm install`, then `npm run dev` starts the five loopback services:

- Central API: http://localhost:4300/health
- Central admin: http://localhost:4301/apps/admin/
- Agent: http://localhost:4302/apps/agent/
- Public website: http://localhost:4303/apps/dummy-site/
- Website admin: http://localhost:4303/apps/dummy-site/admin.html
- Host service: port 4304 behind `/host-api` on the website.

Local host-admin password: `LocalSite!2026`. Central demo credentials remain in `docs/LOCAL_DEVELOPMENT.md`. Production refuses the host demo-password fallback and requires explicit HTTPS host configuration and a bcrypt password hash.

The launcher refuses occupied ports and stops its child services together. Central data and the host credential file are ignored by Git and denied by Vite. Normal shutdown releases ownership locks; verify a crashed owner's PID before manually clearing a stale lock.

## Latest verification

Fifteen automated scenarios pass, including host authentication/CSRF, cookie security/expiry, login throttling, restart persistence, safe registration retry, no credential disclosure and cross-site reconnect rejection. Widget and all four frontend HTML entries build.

A fresh browser journey on isolated data passed installation, hidden pending widget, local FAQ creation, decline/reason/resubmit, central override/approval, two-way chat, a separate unauthenticated visitor, host logout/relogin, persisted settings, suspension/restore and actual central API outage/FAQ recovery. The isolated tests did not use or overwrite the existing demo records. Live socket authorization/delivery regression and server-side credential reconnect also passed.

See `docs/CODEBREAK_REPORT.md` and `docs/evidence/host-*` for evidence. Earlier browser harnesses tied to the old simulator are historical; use `scripts/browser-host-installer.mjs` with empty isolated data for current full verification. `scripts/browser-recovery.mjs` now uses the protected host administration page.

## Local production simulation (completed continuation)

The user's latest scope is **local simulation only**: no production host yet, no push or deployment. `npm run prod:local` builds and starts compiled pages/widget behind HTTPS at https://localhost:4443, with API/host services on loopback 4400/4404. It uses isolated `.test-artifacts/production/` data and fresh private credentials in `config.json`; the existing demo is unchanged.

Production mode requires transactional SQLite with versioned initialization and legacy JSON migration, WAL/full synchronous writes, rollback, and restrictive file permissions. Added offline database backup/verify/restore plus complete simulation bundles containing host credentials and runtime secrets. Restore refuses nonempty destinations. Closed-transcript/audit retention, readiness checks, administrator operations metrics and 30-day reports are implemented.

`npm run prod:smoke` populates/exercises a running simulation. `npm run verify:production` builds and performs a disposable fresh run, full private backup/verification/restore, restart and repeated live-chat journey. `npm run prod:browser` performs browser checks (requires agent-browser). CI is configured to run the two storage test suites and the production rehearsal; it has not run remotely because nothing is pushed.

Latest checks: all 18 tests pass with JSON and again with SQLite; frontend/widget builds pass; the HTTPS smoke journey and full restored-data rehearsal pass. Browser checks verified admin login/reporting/navigation, protected host administration, secure sessions and the shadow-DOM public widget; screenshots were inspected. The browser harness needed a custom-element wait correction because the visible controls are in its shadow DOM. npm audit reported zero vulnerabilities. See `docs/PRODUCTION_SIMULATION.md` and `docs/evidence/production-*`.

## Work that requires an actual deployment destination

The requested local simulation is implemented. Before a live deployment, choose hosting/domain, install its supported reverse proxy and trusted certificates, configure process supervision, off-machine encrypted backups and expiry, external alert/log destinations, real accounts and organizational retention settings. The local edge is deliberately loopback-only and uses a self-signed certificate. Nothing here selects or purchases hosting.

Run one API process per local SQLite database. The app keeps a working copy in memory, so horizontal replication requires a separate shared-state/socket/session design. CMS-specific adapters and external customer/order APIs remain conditional on a chosen platform/provider; they are not prerequisites for the generic local simulation.

The host example uses one configured administrator password and in-memory sessions; a CMS can substitute its established authentication and protected configuration facilities. Staff reset-code delivery remains manual through a verified administrator, with no email/messaging provider configured.

Read README and `docs/HOST_INSTALLER.md`, `ACCOUNT_RECOVERY.md`, `ARCHITECTURE.md`, `API.md` and `LOCAL_DEVELOPMENT.md` before continuing. Historical handover/earlier report sections do not describe the current interface. No remote push has been performed.

The existing local demo was subsequently migrated through authenticated credential rotation and host reconnect. Its replacement credential is stored only in the ignored host installation file (mode 0600); existing site content and staff passwords were preserved. Final browser checks confirmed the public widget is visible, unauthenticated host setup returns 401, and both private data files return 403. Verification browser sessions and all five development services were stopped; both store ownership locks were released. Nothing was pushed.

Final local-production cleanup: all simulation services and verification browsers stopped, ownership locks released, and generated secrets/data excluded from non-ignored project files. Evidence saved under `docs/evidence/production-*`.


## Current continuation — restore the approved template

The user requires existing screens to follow `.ui-source/index.html`, extending its theme only for missing pages/features. Restored original customer home/chat/service pages, agent login/inbox/search/tabs/details/timeline/transfer/tools, dark/light themes, mobile behavior, and About/credits. The original source is untouched and `approved.css` remains an exact match. Additional CSS is scoped so administration pages cannot override original components.

Added real authenticated attachments (2 MiB), media preview/download, real transfer/status history, consistent FAQ limits, and robust customer retry/selection guards. Provider-dependent order/contact controls retain original labels and show honest connection-required states. MediAssist remains explicitly Phase Two. No external provider data is invented.

See `docs/TEMPLATE_CONFORMANCE.md` for the screen/control matrix. Current browser regressions are `scripts/browser-template-{customer,customer-races,agent,admin,governance}.mjs`; earlier simplified-UI selector scripts are historical. Current verification has 23 API tests passing in JSON and again in SQLite, five frontend entries plus widget building, full customer/agent/admin/governance browser checks, fault-injection checks, and the compiled HTTPS attachment/backup/restore rehearsal. Evidence is saved under `docs/evidence/template-*`.

Final governance checks caught and fixed bodyless DELETE requests carrying an empty JSON content type (central FAQ deletion) and stale form validation messages. The corrected browser run passed password recovery/change/revocation, site status decisions, installer credential rotation/reconnect, FAQ deletion, logout and bootstrap protection without browser errors. Final production assets were rebuilt with these fixes.

The user's existing production simulation is restarted at https://localhost:4443 with the same accounts/passwords/data. Keep it running for their visual test. Isolated development services and verification browsers have been stopped, and their store locks released. No deployment or push occurred.
