# Staff account recovery

## Change a known password

In either the admin or agent console, choose **Change password**. Enter the current password, a new password and its confirmation. Successful changes sign out every existing session for that user, including open Socket.IO connections. Sign in again with the new password.

New passwords must contain at least 10 characters and fit within bcrypt's 72-byte input limit. Existing accounts are not forced through a migration; their old passwords remain valid until changed.

## Help an agent who forgot their password

A central administrator opens **Issue an agent password reset**, chooses the agent, enters their own current password and supplies an audit reason. Verify the agent's identity using your established process before sharing the code privately.

The code is shown once, is stored only as a digest, expires after 15 minutes, and can be redeemed once. Issuing another code supersedes the previous one. Nothing is emailed or messaged automatically; no external delivery service is configured.

The agent opens **Reset your password** on the sign-in screen and enters their email, code, new password and confirmation. On success, every old HTTP token and staff socket for that agent is revoked. Other users' sessions remain valid. The old password no longer works. Issuing a code alone does not change the password or sign out the user; completion does.

## Recover the sole administrator

A trusted operator with access to the service's private files can generate a code while the API is stopped:

```sh
# Stop npm run dev (Ctrl-C), then from the repository root:
npm run recover:admin -- administrator@example.com
npm run dev
```

Use the printed code in **Reset your password** on the administrator sign-in screen within 15 minutes. Keep the terminal output private. The command changes neither the password nor the site's data until the code is redeemed. It records an offline recovery audit event.

The command loads the same `.env` and `CHAT_MSD_DATA` as the API. Do not point it at a different data directory. A filesystem lock prevents it from running against an active API store; it fails without changing data if the lock already exists.

## Store lock after a crash

The single-process JSON store creates `store.json.lock` containing its process ID and an ownership marker. Normal shutdown removes it. After a forced termination or machine crash, inspect that file and verify the recorded process is no longer using the store before removing the lock manually. Do not delete a lock belonging to a running process. Never start multiple API workers against this JSON store.

This lock is local single-process protection, not distributed database coordination. It does not replace backups, a transactional database or production recovery procedures.
