# Local development

Requires Node 22. Run `npm install`, then `npm run dev` from the repository root.

The launcher checks ports, creates/loads an ignored `.env` with a private random JWT secret, and starts exactly one listener on each port:

- Central API: http://localhost:4300/health
- Central admin: http://localhost:4301/apps/admin/
- Agent: http://localhost:4302/apps/agent/
- Public website: http://localhost:4303/apps/dummy-site/
- Website administrator: http://localhost:4303/apps/dummy-site/admin.html
- Private host service: loopback port 4304, accessed through the website's `/host-api` proxy.

Stop with Ctrl-C; all child services stop together. Unrelated applications and Desktop Commander are untouched. Individual commands are `dev:api`, `dev:admin`, `dev:agent`, `dev:site` and `dev:host`. Do not start these alongside `npm run dev`.

## Setup

Create the first central administrator, then an agent. Sign into **Site administration** on the website with the local-only host password `LocalSite!2026`. Install support, add FAQs, and approve the pending site centrally. Approval activates the widget automatically for every visitor, including new browsers.

Existing central demo accounts, if present, remain `admin@msd.local` / `LocalDemo!2026` and `agent@msd.local` / `LocalAgent!2026`. These are local demonstration credentials only.

If your site was installed using the earlier browser simulator, use central review to replace its installation credential, then enter the replacement once in the protected host reconnect form. The host now stores it privately in `services/host/data/installation.json`; local/session storage no longer holds it. Losing a browser tab no longer loses installation ownership: sign into the host again. The host credential file and central store are ignored by Git and blocked by Vite.

## Checks

`npm test` runs eighteen automated scenarios with isolated temporary data and no network listeners. `npm run build` builds the widget and four HTML entries (admin, agent, public website and website administration). `npm run codebreak` runs both.

The current full browser harness starts from empty isolated data. Choose fresh temporary directories, then run:

```sh
CHAT_MSD_DATA=/tmp/msd-new-run/central \
HOST_INSTALLATION_FILE=/tmp/msd-new-run/installation.json \
npm run dev
```

In another terminal, obtain the API's PID from the listener on port 4300 and run:

```sh
MSD_API_PID=<API PID> node scripts/browser-host-installer.mjs
```

It creates fixture accounts/site, checks protected setup, installation, pre-approval hiding, decline/reason/resubmit, central override/approval, two-way chat, a separate visitor, host logout/relogin, suspension/restore and actual API pause/recovery. SIGCONT cleanup always resumes the API. Do not run this fixture harness against production or a populated development store.

`node scripts/browser-recovery.mjs` tests central credential rotation and authenticated host reconnect on an already-installed demo. It deliberately rotates the demo credential and saves the replacement through the host service. `node scripts/socket-check.mjs` tests real-time delivery and unauthorized room rejection. `node scripts/browser-passwords.mjs` tests password recovery/session revocation using a dedicated agent. These scripts assume the documented central demo accounts. Earlier `browser-check.mjs`/`browser-edges.mjs` are legacy continuation harnesses tied to old browser sessions; use the fresh host-installer harness for current end-to-end verification.

## Configuration and recovery

See `.env.example`, [HOST_INSTALLER.md](HOST_INSTALLER.md) and [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md). The host production wrapper requires explicit host/central origins, HTTPS for the host, and `HOST_ADMIN_PASSWORD_HASH`; it refuses the development-password fallback in production. The central production API requires a strong JWT secret and a separate bootstrap secret.

Both private stores use process locks. Normal shutdown releases them. After a crash, verify the recorded owner PID is no longer using a store before manually removing its stale lock. Development defaults to JSON. The separate production simulation uses transactional SQLite with migration, backup/restore, retention and HTTPS; see [PRODUCTION_SIMULATION.md](PRODUCTION_SIMULATION.md). Both modes require a single API process.
