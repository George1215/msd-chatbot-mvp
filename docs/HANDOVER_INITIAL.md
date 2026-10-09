# Chat MSD Bot — Codex Handover

## Project location
`/Users/macbookpro/Documents/Chat MSD Bot`

## Objective
Build a reusable customer-support platform that can be installed on multiple websites while using one central support server.

The system must preserve the approved MSD chatbot UI as the visual source of truth while replacing prototype-only behavior with real backend, authentication, site registration, FAQ governance, live chat, agent workflows, admin workflows, offline FAQ fallback, and installation simulation.

## Approved architecture
- `.ui-source/` — untouched clone of the approved UI prototype from `George1215/msd-chatbot-mvp`. Treat this as the visual reference.
- `apps/admin/` — central administrator application.
- `apps/agent/` — support-agent application.
- `apps/dummy-site/` — dummy website used to simulate plugin installation and end-to-end behavior.
- `services/api/` — central Fastify API and Socket.IO real-time server.
- `packages/widget/` — reusable framework-independent website widget.
- `packages/shared/` — shared types/utilities.
- `docs/` — architecture and operational documentation.

Do not collapse the real implementation back into one giant HTML file. Preserve the approved look, layout, spacing, colors, cards, interactions, and information hierarchy while implementing the product in maintainable modules.

## Product behavior agreed with owner

### Site installation and registration
1. Installing the widget/plugin means the site intends to go live.
2. Registration with the central support server must happen automatically.
3. A newly installed site is created as `pending`.
4. The local site admin may configure FAQs/settings before approval.
5. Nothing from the widget appears publicly until central admin approval.
6. Central admin may review and edit the site's FAQs before approval.
7. Central admin can approve or decline.
8. Decline requires a visible reason.
9. A declined site can correct the issue and resubmit.
10. Once approved, the widget goes live immediately; there is no second local “go live” action.
11. Central admin can later suspend a live site and must provide a reason.

### FAQ governance
1. FAQs are site-specific by default.
2. Local site admins manage their own FAQ content.
3. Central admin can view, create, edit, and delete FAQs for every connected site.
4. If central admin and local admin both modify the same FAQ, central admin wins.
5. Central admin can push an FAQ to one site, selected sites, or all sites.
6. If a site has no FAQs, the widget may still exist once approved; it simply shows no FAQs.

### Offline behavior
1. If the central server is unavailable, cached FAQs for an already-approved site must remain available locally.
2. Live chat is unavailable while the central server is down.
3. When connectivity returns, the widget must refresh/sync automatically with the central source of truth.
4. Do not allow stale local data to override newer central-admin content.

### Support workflow
1. Visitors use the website widget.
2. Live enquiries route to the central support server.
3. Agents log into the private agent console and handle active conversations.
4. Central administrators log into the admin application.
5. Central admins monitor agents, connected sites, widget state, FAQ content, approvals, suspensions, and reporting.
6. A visitor is treated as “unknown” until verified against an external authoritative customer system when/if one is later integrated.
7. The integration layer must remain generic; do not hard-code assumptions about MSD order/customer systems.

## Existing UI source
The approved prototype is preserved here:

`.ui-source/index.html`

It contains the visual language and flows for:
- customer widget/chat
- login screen
- agent screen
- ticket list
- chat history
- support topics
- tools such as FAQs, self-service, orders, contacts, files, escalation, and feedback

Use this file as the UI source of truth. Do not redesign the product into a different visual system.

## Work already completed

### Root project
- Local Git repository initialized.
- Root workspace structure created.
- npm dependencies installed.
- `package.json` and `package-lock.json` exist.

### API foundation
Files:
- `services/api/src/server.js`
- `services/api/src/store.js`
- `services/api/test/api.test.js`

Implemented foundation includes:
- Fastify server
- CORS
- JWT auth
- central-admin bootstrap/login
- automatic site registration
- pending site state
- site bootstrap endpoint
- central admin site listing
- approve / decline / suspend status flow
- required reason for decline/suspend
- resubmission path
- local FAQ creation
- central FAQ override
- central FAQ deletion
- FAQ broadcast to one/many/all sites
- conversation creation
- agent conversation listing
- Socket.IO room model for sites, agents, and conversations
- persistent JSON-backed development store

### Widget foundation
Files:
- `packages/widget/src/widget.js`
- `packages/widget/vite.config.js`
- `packages/widget/package.json`

Implemented foundation includes:
- framework-independent custom element
- automatic site registration
- local registration persistence
- site bootstrap fetch
- hidden state while not approved
- FAQ rendering
- browser FAQ/bootstrap cache
- offline fallback to cached FAQs
- refresh on browser `online` event

## Current known issues / code-break targets

### 1. Test environment starts the real server
Current test rerun failed with:

`EADDRINUSE: address already in use 0.0.0.0:4300`

Cause:
`services/api/src/server.js` still enters its listen block during the test process in at least one execution path.

Required repair:
- ensure importing `buildServer()` for tests never binds a real port
- use a clean test-safe entrypoint or reliable module-main detection
- tests should use Fastify `inject()` only
- make test execution independent of whatever process happens to own port 4300

### 2. Admin UI not implemented
`apps/admin/` exists but is not built yet.

Required central-admin MVP:
- login
- dashboard
- connected-sites table/cards
- pending / approved / declined / suspended states
- review site
- edit FAQ before approval
- approve
- decline with mandatory reason
- suspend with mandatory reason
- restore/reactivate where appropriate
- FAQ CRUD per site
- broadcast FAQ to selected/all sites
- agents/performance visibility
- audit history

### 3. Agent UI not wired to real API
`apps/agent/` exists but is not built yet.

Required:
- port approved UI from `.ui-source/index.html`
- real login
- real ticket/conversation list
- live Socket.IO updates
- conversation history
- send/reply
- assignment/transfer
- status handling
- capacity state
- site/source context
- safe unknown-customer state

### 4. Dummy-site simulation not implemented
`apps/dummy-site/` exists but is not built yet.

Required:
- dummy public website
- plugin/widget installation flow
- automatic registration
- local admin setup screen
- pre-approval FAQ/settings editing
- pending state demonstration
- central approval
- widget appears automatically after approval
- decline + reason + resubmit demonstration
- suspension demonstration
- offline FAQ demonstration

### 5. Widget is only a foundation
Current widget renders FAQ content but does not yet implement the complete approved interactive chat UI.

Required:
- preserve approved customer UI
- live conversation creation
- two-way Socket.IO messaging
- reconnect behavior
- chat history
- server-down state
- FAQ-only offline state
- no duplicate conversation creation during reconnect

### 6. Persistence is development-grade
Current store is JSON-backed.

For MVP local simulation this is acceptable, but Codex should assess whether SQLite is a better local MVP persistence choice. Do not introduce unnecessary infrastructure unless it materially improves reliability.

### 7. Security hardening incomplete
Required:
- env-based JWT secret
- secure installation token handling
- role/permission enforcement
- central admin vs agent vs local-site-admin separation
- input validation
- rate limiting for public chat endpoints
- safe CORS policy
- no secret leakage to widget/browser
- audit all privileged changes

## Codex development instructions

### Work location
Continue only in:

`/Users/macbookpro/Documents/Chat MSD Bot`

Do not create a second clone or another competing Chat MSD Bot project.

### Resource rule
At handoff time, the previous development/test servers should be stopped. Desktop Commander connector must remain running.

Before starting:
1. inspect active ports/processes
2. do not start duplicate API/frontend servers
3. reuse the intended development ports when practical
4. stop stale project processes before launching replacements

### UI rule
The approved UI in `.ui-source/index.html` is the visual source of truth.

Do not “modernize”, simplify, or redesign it unless needed to fix a clear usability bug. Preserve the look and feel while making it functional.

## Required execution sequence

### Phase 1 — Baseline code break
1. inspect the complete repository
2. run install/build/test commands
3. reproduce all failures
4. fix the port/test isolation bug first
5. make the baseline test/build green
6. document anything still failing

### Phase 2 — Complete missing MVP
Build:
- central admin
- agent console
- dummy site
- complete widget behavior
- local site setup/config
- approval/decline/resubmit/suspend flows
- FAQ sync/offline behavior
- live chat
- audit trail
- documentation

### Phase 3 — Free run
Run the full system locally as a real user journey:
1. start central API
2. start admin app
3. start agent app
4. start dummy site
5. install widget
6. verify auto-registration appears in admin as pending
7. create local FAQs before approval
8. confirm widget remains invisible
9. central admin edits FAQ
10. approve site
11. confirm widget appears immediately
12. verify FAQs
13. start visitor chat
14. verify agent receives it
15. send messages both ways
16. verify admin visibility
17. suspend site
18. confirm widget/live-chat behavior follows suspension rules
19. restore as appropriate
20. simulate central server outage
21. confirm cached FAQ remains available
22. confirm live chat is unavailable
23. restore server
24. verify automatic resync
25. verify central FAQ remains authoritative

### Phase 4 — Code-break pass 1
Find and fix:
- runtime errors
- API failures
- invalid states
- authentication failures
- websocket/reconnect issues
- UI breaks
- duplicate requests
- stale state
- race conditions

Then rerun the complete free run.

### Phase 5 — Code-break pass 2
Focus on:
- edge cases
- permission boundaries
- offline/online transitions
- approve/decline/resubmit/suspend transitions
- browser refresh/reload
- duplicate widget initialization
- agent transfer/assignment
- chat persistence
- empty FAQ states
- no-agent-available states

Then rerun the complete free run.

### Phase 6 — Code-break pass 3
Focus on:
- final UX fidelity versus approved UI
- performance
- resource usage
- console warnings/errors
- API consistency
- security basics
- documentation completeness

Then rerun the complete free run one final time.

## Completion criteria
Do not report “done” merely because code compiles.

The MVP is complete only when:
- build passes
- automated tests pass
- full free run passes
- three code-break passes have been completed
- no known critical/high bugs remain
- no duplicate project servers are left running
- dummy-site installation works end to end
- admin approval flow works end to end
- agent live chat works end to end
- offline FAQ fallback works
- central-admin FAQ override wins after reconnect
- documentation is accurate
- final run commands are documented

## Documentation Codex must leave behind
Update/create:
- `README.md`
- `HANDOVER.md`
- `docs/ARCHITECTURE.md`
- `docs/LOCAL_DEVELOPMENT.md`
- `docs/WIDGET_INSTALLATION.md`
- `docs/API.md`
- `docs/CODEBREAK_REPORT.md`

`docs/CODEBREAK_REPORT.md` must list:
- each pass
- bugs found
- fixes made
- tests added
- remaining limitations
- final free-run result

## Important constraint
Do not push to a remote Git repository unless the owner explicitly asks. Keep development local on this Mac.
