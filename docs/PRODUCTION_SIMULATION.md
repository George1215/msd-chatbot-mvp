# Local production simulation

This is a **local rehearsal**, not an internet deployment. It runs the actual API and host service with `NODE_ENV=production`, durable SQLite transactions, compiled frontend/widget bundles, and one HTTPS origin. No development server is used. The existing demonstration database is untouched.

## Start and verify

Requires Node 22.18 or newer, npm, and OpenSSL on macOS/Linux.

```sh
npm ci
npm run prod:local
```

Open `https://localhost:4443/apps/admin/`. The local self-signed certificate causes a browser trust warning; use a dedicated local browser profile or explicitly trust this certificate for testing. Do not disable certificate verification globally. The Node smoke tests trust only the generated local certificate.

Routes:

- `/apps/admin/`: central administration, reports, operations summary.
- `/apps/agent/`: agent workspace.
- `/apps/dummy-site/`: public demonstration website.
- `/apps/dummy-site/admin.html`: protected website administration.
- `/chat-msd-widget.js`: standalone widget bundle.
- `/health`: liveness; `/ready`: database readiness.

The HTTPS edge listens on loopback port 4443; API and host services use loopback ports 4400 and 4404. The launcher checks all ports before starting and shuts down its children together.

Private runtime files live in the ignored `.test-artifacts/production/` directory, separate from `services/api/data/` and `services/host/data/`. `config.json` contains generated passwords/secrets, including `adminPassword`, `agentPassword`, and `hostPassword`. Treat that file and backups as sensitive. Nothing uses the documented development passwords.

In another terminal:

```sh
npm run prod:smoke
npm run prod:browser
```

The smoke command creates the simulation administrator (`simulation-admin@example.test`) and agent (`simulation-agent@example.test`), installs/approves the host, adds an FAQ, exchanges a real WebSocket reply, closes the conversation, and verifies authorization/reporting. It can be repeated and preserves prior records. It is intended only for this local simulation. The browser command requires the `agent-browser` CLI via npx; `AGENT_BROWSER_CLI` can point to an already installed CLI JavaScript entry. Screenshots stay in the private simulation directory.

For a complete disposable rehearsal, stop the persistent simulation with Ctrl-C and run:

```sh
npm run verify:production
```

This creates isolated temporary data, runs the smoke journey, stops the stack, backs up the database **and** host credentials/configuration/certificate, verifies checksums and database integrity, restores into an empty directory, restarts, and repeats the smoke journey against retained records. Successful fixtures are removed; failures retain diagnostic files. It requires the compiled build and free simulation ports. CI runs builds, both storage test suites, and this rehearsal.

## Persistence and migrations

Production requires SQLite. Development defaults to the existing JSON store, with `STORE_BACKEND=sqlite` available for testing. Six SQLite tables hold individually addressable records, and `PRAGMA user_version` tracks the migration. Each mutation uses an explicit transaction, differential row writes, WAL journaling, and full synchronous durability. Tests cover rollback after a partially executed transaction, migration retry, and restart persistence.

On first SQLite startup, the legacy JSON file in the same data directory is imported in a transaction. Invalid data aborts startup. The source is preserved unchanged; after migration it is no longer the active database and must not be mistaken for a current backup. Do not switch an existing SQLite installation back to the stale JSON file.

The application currently keeps a working copy in memory. **Run exactly one API process per database on local disk**, with one host process per installation. Do not use network filesystems, multiple API workers, or horizontal replicas. Filesystem ownership locks prevent competing processes and offline maintenance. After an abrupt crash, verify that the recorded owner is gone before removing a stale lock. A database with shared transactional reads plus a shared socket/session layer is required before horizontal scaling.

## Backup and restore

Stop the simulation first. Destinations must be new/empty; restore refuses to overwrite an existing installation.

```sh
npm run prod:backup -- backup .test-artifacts/production .test-artifacts/backup-01
npm run prod:backup -- verify .test-artifacts/backup-01
npm run prod:backup -- restore .test-artifacts/backup-01 .test-artifacts/restored
SIMULATION_DIR=.test-artifacts/restored npm run prod:local
```

The bundle contains the SQLite database, checksums/counts, host installation credential, signing/bootstrap/password configuration, and local TLS key/certificate. Files are private (0600) and directories are 0700. Checksums detect accidental corruption; they do not authenticate a backup from an untrusted source. Backups are not encrypted by these scripts: keep them on encrypted storage and restrict access.

Standalone offline database maintenance is also available:

```sh
npm run db -- migrate /absolute/data-directory
npm run db -- backup /absolute/data-directory /absolute/new-backup-directory
npm run db -- verify /absolute/new-backup-directory
npm run db -- restore /absolute/new-backup-directory /absolute/empty-restore-directory
```

A real deployment must choose an off-machine backup destination and schedule. A local rehearsal cannot prove disaster recovery of a server that has not been selected. Copying only `store.sqlite` while the API is running is not a supported backup procedure because WAL may contain committed data.

## Retention, reports and monitoring

Production runs retention at startup and daily. Default configuration removes closed conversations and their messages after 90 days of inactivity and audit records after 365 days. Active conversations, users, sites, and FAQs are retained. `RETENTION_CONVERSATION_DAYS` and `RETENTION_AUDIT_DAYS` must be positive integers. These defaults are simulation settings, not a legal retention determination; choose the organization's policy before launch. Historical backups need their own expiry policy.

`/ready` returns 503 when its database probe fails. `/api/admin/operations` requires a central administrator and reports uptime, request/error counts, average response time, and record counts. Metrics reset on restart. The admin dashboard displays service status and a 30-day report. `/api/admin/reports?days=30` accepts 1–365 days and reports retained conversations by status, site, and agent. Retention limits historical coverage.

The API writes structured logs to stdout with credential-header redaction. The launcher stops the other services if one exits. External uptime alert delivery and durable log aggregation require the eventual hosting/monitoring destination; neither is silently simulated as a real alert provider.

## Before an actual launch

This rehearsal does not deploy, push, configure DNS, or purchase services. No production host has been selected. The Node HTTPS edge is loopback-only and provided for the simulation. When a destination is selected, configure its supported HTTPS reverse proxy, trusted proxy range, process supervision, persistent local disk, certificate renewal, encrypted off-machine backups, log collection, monitoring alerts, secrets, and organizational retention policy. Start with fresh real accounts; do not promote simulation accounts or demo records.

The generic host installer is the supported integration. A CMS-specific package and external customer/order APIs require a chosen platform and authoritative provider; they are not missing prerequisites for testing the generic application locally.

Implementation references: [Node SQLite API](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html). SQLite provides transaction and backup primitives; application process ownership is enforced separately.
