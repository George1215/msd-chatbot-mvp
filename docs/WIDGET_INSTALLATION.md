# Widget installation

## Production integration contract

The host plugin's authenticated server-side installation hook calls `POST /api/sites/register` once with `{name,url,platform,adminEmail}`. It stores the returned installation token in its private configuration and exposes only the `siteKey` in page markup. Installation creates a pending site automatically; repeat registration without matching ownership proof returns 409 and never discloses credentials. The generic host package persists a random registrationToken before the first request and uses it to safely retry lost responses. Preserve the original registration securely. Central administrators can replace a lost or compromised credential from the site review screen; the previous credential is immediately invalidated.

Build with `npm run build`. Host `packages/widget/dist/chat-msd-widget.js` on your own static asset server:

```html
<script type="module" src="/assets/chat-msd-widget.js"></script>
<chat-msd-widget api="https://support.example.com" site-key="key_REPLACE"></chat-msd-widget>
```

The bundle includes its Socket.IO client. Multiple inclusions do not redefine the custom element; duplicate instances for one site remain hidden. No installation token, JWT secret or staff login token belongs in the embed. Use HTTPS. Add the host origin to the central allowlist before approval if its administrative browser needs direct API access; preferably proxy local setup through the host backend.

The widget stays invisible for pending, declined and suspended sites. Approval activates it automatically. Empty FAQ lists are supported. Messages, conversation bearer token and FAQ cache are scoped to API origin and site key. A conversation token is intentionally a visitor-side capability; treat access to the host origin's browser storage as access to that visitor's chat.

## Local host integration

At the demo site open Site administration, authenticate, and choose Install support widget. Registration happens immediately. Add FAQs and a title before approval. In central admin, review FAQs, override content, and approve or decline with a reason. A declined site can resubmit from local setup. Suspend and restore from central review.

For offline testing, block requests to the API origin in browser tools while keeping the demo page loaded. Cached approved FAQs remain visible and Send becomes disabled. Remove the block: polling/socket reconnection refreshes the central content. A full offline reload additionally requires the host website to cache/serve its own HTML and widget assets; the widget does not install a service worker for the host.

## Installation recovery

In central administration, review the site and open **Recover installation access**. Enter an audit reason and replace the credential. Save the one-time replacement in the host backend; the API stores only its SHA-256 digest. Neither site listings nor audit history expose the credential or digest. Existing plaintext development records migrate automatically on API startup, preserving their valid credential.

For the local demo, sign into Site administration and open **Reconnect an existing installation** and enter the public site key and replacement credential. A successful reconnect restores the existing site's settings and FAQs; it does not register a second site or change approval status. A mismatched website origin is rejected. The demo clears credential form fields after success and persists the credential privately on the host server. The public page and browser storage do not receive it. See [HOST_INSTALLER.md](HOST_INSTALLER.md) for the generic Node integration and CMS adapter boundary.
