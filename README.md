# Chat MSD Bot

A local MVP for one central customer-support service and multiple website widgets. It includes central administration, an agent inbox, a demo installation workflow, site approval/governance, FAQ ownership, persistent chat, and offline FAQ fallback.

## Run

```sh
npm install
npm run dev
```

Open:

- [Administrator](http://localhost:4301/apps/admin/)
- [Agent inbox](http://localhost:4302/apps/agent/)
- [Demo website](http://localhost:4303/apps/dummy-site/)
- [Website administrator](http://localhost:4303/apps/dummy-site/admin.html)

Use the first-administrator setup on the admin sign-in screen, create an agent, sign into website administration (`LocalSite!2026` locally), install support, and approve the pending site. Approval activates the widget automatically. `npm run dev` creates a private ignored local JWT secret and refuses to start over occupied ports. Ctrl-C stops the stack.

```sh
npm test
npm run build
npm run codebreak
```

The API test suite uses injected requests and isolated data files; it never starts a listener. The standalone widget build includes its real-time client. The frontend build contains all three app entry points.

## Documentation

- [Local development and demo accounts](docs/LOCAL_DEVELOPMENT.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Widget integration contract](docs/WIDGET_INSTALLATION.md)
- [Authenticated host installer](docs/HOST_INSTALLER.md)
- [API reference](docs/API.md)
- [Staff password and administrator recovery](docs/ACCOUNT_RECOVERY.md)
- [Verification and remaining limits](docs/CODEBREAK_REPORT.md)
- [Current handover](HANDOVER.md)

The approved UI source remains untouched in `.ui-source/`. The generic Node host installer provides authenticated server-side installation and private credential storage. A separate local production simulation includes SQLite, HTTPS, backups/restore, retention and operational reports. Real hosting, customer-system/order APIs, CMS-specific adapters and multi-worker scaling require their respective destinations or requirements.

## Local production rehearsal

Run `npm run prod:local` for compiled assets over HTTPS with production authentication and isolated SQLite data. Run `npm run prod:smoke` in another terminal to populate and exercise the simulation. With the stack stopped, `npm run verify:production` performs a fresh end-to-end backup/restore/restart rehearsal. See [the production simulation guide](docs/PRODUCTION_SIMULATION.md) for credentials, browser testing, operational commands, and deployment boundaries. Nothing is pushed or deployed by these commands.


## Approved template

Customer home/chat/service screens, agent login/inbox/tools, both themes and About/credits follow the original `.ui-source/index.html`. See [template conformance and button coverage](docs/TEMPLATE_CONFORMANCE.md). New administration/recovery screens continue the same theme.
