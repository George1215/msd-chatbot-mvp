# Template conformance and control verification

The design authority is `.ui-source/index.html`. It remains untouched. Its stylesheet and `apps/shared/approved.css` match exactly. Template SHA-256: `9a17a58ee1b55f7df8f626731e2b509bb3abf07a56e34248cf3dcd98820cacd8`.

The earlier implementation reused the palette but simplified customer and agent layouts. This continuation restores their original component hierarchies. General administration styles are now scoped to pages absent from the template so they cannot override the original inbox, customer, login, or About screens.

## Preserved screens and additions

| Screen | Treatment |
|---|---|
| Customer home | Original phone shell, greeting/diamond, Quick Access, language pills, order/contact/ticket cards, new-ticket/AI actions, topics, floating chat button |
| Customer chat | Original header/back/end/expand controls, history, FAQ card, suggestions, composer and seven-tool drawer |
| Service pages | Original header, hero/stats/section/action layouts; real ticket records and request form replace mock data |
| Agent login | Original card, logo, fields, button and note; real authentication replaces fake sign-in |
| Agent inbox | Original shell/sidebar, search, four tabs, capacity, ticket row hierarchy, conversation actions, chat/details/history/timeline split and reply tools |
| Transfer | Original overlay/modal, agent chips, typed filter, cancel and confirm; real eligible agents |
| About | Original cards, explanatory content and credits copied directly into `/apps/about/` |
| Central admin / website admin | Not supplied by the original template; use the same tokens, cards, fields, rounded geometry and theme controls |
| Account recovery / attachment viewer | Missing functional pages/dialogs follow the original form/modal theme |

Both original dark/light themes and responsive inbox/customer behavior are retained. UI text that previously claimed fake login, fake records or mock success is replaced with real outcomes. No provider data is invented.

## Button coverage

| Area | Controls / behavior verified |
|---|---|
| Navigation | Customer Chatbot, Agent Login, Agent Inbox, About MVP, home/back actions and both themes |
| Customer home | More tools, all three languages, Order Status, Zonal Contacts, My Tickets, Open New Ticket, MediAssist Phase Two, View all, six topics, floating chat |
| Customer services | Download Order Summary and Copy Contacts explain the missing provider; Continue Ticket opens an owned ticket; Open Forms opens the real request form; Open Chat works on each service page |
| Customer chat | Back/end session, expand/restore, history, original FAQ, suggestions/search/close, plus drawer, send/Enter, all drawer tools, closed/new conversation |
| Customer data | Create/resume multiple owned tickets, live replies, transcript download, authenticated file/image download and preview, oversized rejection, reload, cached FAQs/offline-disabled chat/reconnect |
| Customer fault handling | Changed drafts preserved while older uncertain requests settle, capability captured across file reads, stale request/select responses ignored, same-file retry, request-key deduplication |
| Agent inbox | Search, All/New/Active/Resolved, selection, capacity, availability, refresh, Inbox return, Accept, Resolve, Transfer, ownership guards |
| Agent tools | Greeting, File, Image, Video, Link, FAQ, Text, Voice; actual uploads, bounded FAQ replies, validated links, protected media previews/downloads and safe retry |
| Agent collaboration | Transfer filtering/chips/cancel/confirm, capacity/full controls, receiver reply, resolution and real timeline/history |
| Admin | Invalid/valid login, refresh/report, agent creation, reset issuance/reveal/hide/dismiss, FAQ override/broadcast/delete, site status decisions and installation recovery |
| Website admin | Protected login, widget title save, FAQ create/edit/delete, refresh, reconnect and sign out |
| Account controls | Change-password dialog/cancel, reset redemption, password change/revocation and sign out |

Browser checks run against a separate isolated development fixture, not the user's production-simulation accounts. The disposable production rehearsal separately checks compiled HTTPS pages, live WebSocket chat, attachment authorization and recovery from a complete backup.

## Provider-dependent controls

Order records, delivery estimates and zonal contact values require authoritative external providers. The original controls remain in place and give clear service-connection messages or route to real support. They do not download fabricated summaries or copy invented contact details. MediAssist retains the template's explicit **Coming in Phase Two** label and a working information/support action.

File/media tools now accept real files up to 2 MiB. Approved types: PDF/plain text, PNG/JPEG/WebP/GIF, MP4/WebM, MP3/WAV/OGG. Downloads require the conversation's visitor capability or an authenticated staff account; private payloads never appear in normal conversation API/socket responses. Attachment storage is retained and backed up with messages.

## Repeat checks

```sh
npm run codebreak
npm run test:sqlite
npm run verify:production
```

The `scripts/browser-template-*.mjs` runners require the isolated template test stack on 4300–4304, an approved host website, and the fixture accounts documented in their source. They create test messages/files/accounts and change fixture workflow state; do not run them against the user's test data or a real deployment. The race harness replaces requests only in its own browser for fault injection.

Screenshots and sanitized logs are saved in `docs/evidence/template-*`. Earlier browser scripts that target simplified customer/agent selectors are historical; use these current template runners for UI verification.
