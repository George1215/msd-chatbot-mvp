# Authenticated website-side installer

The generic Node host service owns the installation credential and talks to the central API on behalf of the website administrator. The public website receives only `{siteKey, api}`. Visitors cannot read setup data or mutate FAQs/settings, and do not receive an installation credential.

## Local use

`npm run dev` starts the central API (4300), two staff frontends (4301–4302), the website frontend (4303), and a loopback-only host service (4304).

- Public website: http://localhost:4303/apps/dummy-site/
- Site administration: http://localhost:4303/apps/dummy-site/admin.html
- Local development host-admin password: `LocalSite!2026`

The public page no longer contains installation controls. Sign into site administration and choose Install support widget. The host service persists a private credential before contacting central, registers the site as pending, and saves its public key. FAQs and title can be managed before approval. Every visitor's browser obtains the same public configuration directly from the host service; installation does not depend on the installer's browser storage.

If this website already exists from the earlier browser simulator, central administration must replace its installation credential. Enter the key and replacement once in the protected **Reconnect an existing installation** form. The host verifies the website origin and saves the credential privately; the form is then cleared. Existing site approval and content are preserved.

## Integration API

The package `@chat-msd/host-installer` exports `buildHostServer(options)`, an import-safe Fastify server factory. Options:

- `siteUrl`: exact public website origin (HTTP for local development, HTTPS for production).
- `apiOrigin`: central API origin.
- `credentialFile`: private installation-file path outside publicly served directories.
- `adminPasswordHash`: bcrypt hash of the host administrator password.
- `sessionMs`: optional session lifetime, default eight hours.
- `transport`: optional injected central transport for tests; normally use the built-in fetch client.

Start the service behind your website's same-origin reverse proxy. Forward only `/host-api/` and preserve the original Host header (including a non-default port). The service checks Host against the configured website, requires exact Origin on write requests, and requires a session CSRF token on authenticated mutations. Do not enable wildcard CORS or expose the private credential directory through a static server.

The included host login is a single-administrator example. A CMS adapter can substitute the host platform's established administrator authentication/authorization while retaining the private registration and proxy operations. No CMS-specific plugin package is supplied.

## Routes

All routes are under `/host-api`:

| Route | Purpose |
| --- | --- |
| GET `/widget` | Public site key and central origin, no credentials |
| POST `/login` | Password → HttpOnly session cookie and CSRF token |
| GET `/session` | Authenticated CSRF-token recovery after reload |
| POST `/logout` | Revokes the current host session |
| GET `/setup` | Authenticated site state and FAQ content |
| POST `/install` | Authenticated automatic registration; name and adminEmail |
| POST `/reconnect` | Authenticated replacement siteKey/installToken, saved privately |
| PATCH `/settings` | Authenticated title update |
| POST `/resubmit` | Authenticated declined-site resubmission |
| POST `/faqs` | Authenticated question/answer creation |
| PUT `/faqs/:id` | Authenticated edit, current version required |
| DELETE `/faqs/:id` | Authenticated delete, current version required |

Mutations require `Origin` matching `siteUrl`; authenticated mutations also require `x-csrf-token` from login/session. Cookie sessions expire after eight hours, use HttpOnly and SameSite=Strict, and add Secure on HTTPS. Sessions are memory-only and require re-login after host service restart. The installation credential survives restart.

## Private state and registration retry

The default private file is `services/host/data/installation.json`. It has mode 0600, its newly created parent directory has mode 0700, writes use atomic replacement, and a process lock excludes competing owners. It is ignored by Git and denied by Vite. The credential must be recoverable by the host service, so it is stored privately there; central stores only its digest.

Before initial registration the host generates and persists a random 256-bit credential. It submits that as `registrationToken`. If the central response is lost, a retry proves ownership using the same token, returning the existing site key without creating a duplicate. Requests without matching proof still receive 409 for an existing site. A configuration-origin mismatch fails rather than silently reusing an installation for another website.

## Configuration and deployment boundary

See `.env.example`. The production service requires a configured bcrypt password hash. Use HTTPS and a private server directory with appropriate backups; production database and backup/restore procedures are still separate work. The development password must never be used in a shared deployment. The host service binds to loopback and is intended to sit behind your website's proxy.

This is a generic server-side integration, not a WordPress/Drupal/etc. package. Its local JSON installation file and in-memory single-admin sessions are intentionally small; a host platform can replace those adapters with its own protected configuration and session facilities.
