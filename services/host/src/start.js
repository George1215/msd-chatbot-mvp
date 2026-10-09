import fs from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { buildHostServer } from "@chat-msd/host-installer";
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.NODE_ENV === "production") {
  if (!process.env.HOST_SITE_URL || !process.env.HOST_CENTRAL_URL)
    throw Error(
      "Set HOST_SITE_URL and HOST_CENTRAL_URL before production startup",
    );
  if (new URL(process.env.HOST_SITE_URL).protocol !== "https:")
    throw Error("Production host administration requires HTTPS");
}
let adminPasswordHash = process.env.HOST_ADMIN_PASSWORD_HASH;
if (!adminPasswordHash) {
  if (process.env.NODE_ENV === "production")
    throw Error("Set HOST_ADMIN_PASSWORD_HASH before production startup");
  adminPasswordHash = await bcrypt.hash("LocalSite!2026", 12);
  console.log(
    "Host installer uses the documented loopback-only local demo password. Configure HOST_ADMIN_PASSWORD_HASH for deployment.",
  );
}
const app = buildHostServer({
  siteUrl: process.env.HOST_SITE_URL || "http://localhost:4303",
  apiOrigin: process.env.HOST_CENTRAL_URL || "http://localhost:4300",
  credentialFile:
    process.env.HOST_INSTALLATION_FILE ||
    fileURLToPath(new URL("../data/installation.json", import.meta.url)),
  adminPasswordHash,
});
await app.listen({
  port: Number(process.env.HOST_PORT || 4304),
  host: "127.0.0.1",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
