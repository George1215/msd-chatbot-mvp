import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import crypto from "node:crypto";
if (!fs.existsSync(".env"))
  fs.writeFileSync(
    ".env",
    `JWT_SECRET=${crypto.randomBytes(48).toString("hex")}\n`,
    { mode: 0o600 },
  );
process.loadEnvFile(".env");
const ports = [4300, 4301, 4302, 4303, 4304];
for (const port of ports) {
  await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (error) =>
      reject(
        Error(
          `Cannot bind port ${port}: ${error.code}. Stop an existing project server if EADDRINUSE.`,
        ),
      ),
    );
    s.listen(port, "127.0.0.1", () => s.close(resolve));
  });
}
const children = [];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
};
for (const [cmd, args, cwd] of [
  ["node", ["src/start.js"], "services/api"],
  ["node", ["src/start.js"], "services/host"],
  ...ports
    .slice(1, 4)
    .map((port) => [
      "node",
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      ".",
    ]),
]) {
  const child = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
  children.push(child);
  child.once("exit", () => {
    stop();
    process.exitCode = 1;
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(
  "Admin http://localhost:4301/apps/admin/\nAgent http://localhost:4302/apps/agent/\nWebsite http://localhost:4303/apps/dummy-site/",
);
