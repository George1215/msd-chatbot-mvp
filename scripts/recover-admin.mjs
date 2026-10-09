// Trusted local operator command. Never run it against a running API store.
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const envPath = fileURLToPath(new URL("../.env", import.meta.url));
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const email = process.argv[2]?.trim().toLowerCase();
if (!email || process.argv.length !== 3) {
  console.error(
    "Usage: npm run recover:admin -- administrator@example.com\nStop the API first. This prints a sensitive, one-time reset code.",
  );
  process.exit(1);
}
try {
  const { read, mutate, id, now } =
    await import("../services/api/src/store.js");
  const user = read().users.find(
    (u) => u.role === "central_admin" && u.email.toLowerCase() === email,
  );
  if (!user) throw Error("Administrator not found");
  const resetToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  mutate((db) => {
    user.passwordReset = {
      hash: crypto.createHash("sha256").update(resetToken).digest("hex"),
      expiresAt,
    };
    db.audit.unshift({
      id: id("audit"),
      actor: "local_operator",
      action: "auth.password_reset.issue",
      meta: {
        userId: user.id,
        reason: "Offline administrator recovery",
        expiresAt,
      },
      at: now(),
    });
  });
  console.log(
    `One-time reset code for ${user.email}:\n${resetToken}\nExpires: ${expiresAt}\nRestart the API, then use Reset your password on the sign-in page. Keep this code private.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
