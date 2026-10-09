import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const dir = path.resolve(
  process.env.SIMULATION_DIR || ".test-artifacts/production",
);
const configFile = path.join(dir, "config.json");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
if (!fs.existsSync(configFile)) {
  const secret = () => crypto.randomBytes(32).toString("base64url");
  const hostPassword = secret(),
    adminPassword = secret(),
    agentPassword = secret();
  const config = {
    JWT_SECRET: secret(),
    BOOTSTRAP_SECRET: secret(),
    HOST_ADMIN_PASSWORD_HASH: await bcrypt.hash(hostPassword, 12),
    hostPassword,
    adminPassword,
    agentPassword,
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
const cert = path.join(dir, "localhost.crt"),
  key = path.join(dir, "localhost.key");
if (!fs.existsSync(cert) || !fs.existsSync(key)) {
  const result = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "30",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
    ],
    { stdio: "pipe" },
  );
  if (result.status !== 0) throw Error("OpenSSL certificate generation failed");
  fs.chmodSync(key, 0o600);
}
if (process.argv.includes("--setup-only")) {
  console.log(`Simulation configuration: ${configFile}`);
  process.exit(0);
}
for (const file of [
  "dist/apps/apps/admin/index.html",
  "packages/widget/dist/chat-msd-widget.js",
])
  if (!fs.existsSync(file))
    throw Error("Run npm run build before starting production simulation");
for (const port of [4400, 4404, 4443])
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
const env = {
  ...process.env,
  NODE_ENV: "production",
  STORE_BACKEND: "sqlite",
  CHAT_MSD_DATA: path.join(dir, "central"),
  HOST_INSTALLATION_FILE: path.join(dir, "host", "installation.json"),
  HOST_SITE_URL: "https://localhost:4443",
  HOST_CENTRAL_URL: "https://localhost:4443",
  ALLOWED_ORIGINS: "https://localhost:4443",
  HOST: "127.0.0.1",
  PORT: "4400",
  HOST_PORT: "4404",
  EDGE_PORT: "4443",
  TRUST_PROXY: "loopback",
  TLS_CERT: cert,
  TLS_KEY: key,
  NODE_EXTRA_CA_CERTS: cert,
  JWT_SECRET: config.JWT_SECRET,
  BOOTSTRAP_SECRET: config.BOOTSTRAP_SECRET,
  HOST_ADMIN_PASSWORD_HASH: config.HOST_ADMIN_PASSWORD_HASH,
  RETENTION_CONVERSATION_DAYS: "90",
  RETENTION_AUDIT_DAYS: "365",
};
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children)
      if (child.exitCode === null) child.kill("SIGKILL");
  }, 5000);
  timer.unref();
}
for (const script of [
  "services/api/src/start.js",
  "services/host/src/start.js",
  "scripts/gateway.mjs",
]) {
  const child = spawn(process.execPath, [script], { env, stdio: "inherit" });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", () => {
    if (!stopping) stop(1);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log(
  `Local production simulation: https://localhost:4443\nPrivate credentials: ${configFile}\nTLS uses a local self-signed certificate. No demo data is imported.`,
);
