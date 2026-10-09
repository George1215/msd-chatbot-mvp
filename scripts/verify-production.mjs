// End-to-end, disposable production rehearsal; includes restart from a full backup.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { spawn, spawnSync } from "node:child_process";
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "msd-production-rehearsal-"),
);
let running;
function run(script, args = [], env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) throw Error(`${script} failed`);
}
async function start(dir) {
  const env = { ...process.env, SIMULATION_DIR: dir };
  run("scripts/production-local.mjs", ["--setup-only"], env);
  const log = fs.openSync(path.join(dir, "runtime.log"), "a", 0o600);
  running = spawn(process.execPath, ["scripts/production-local.mjs"], {
    env,
    stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  const ca = fs.readFileSync(path.join(dir, "localhost.crt"));
  for (let n = 0; n < 100; n++) {
    if (running.exitCode !== null)
      throw Error(`Runtime failed; inspect ${dir}/runtime.log`);
    const ready = await new Promise((resolve) => {
      const req = https.get(
        "https://localhost:4443/ready",
        { ca, timeout: 500 },
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => req.destroy());
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Runtime did not become ready");
}
async function stop() {
  if (!running || running.exitCode !== null) return;
  const done = new Promise((resolve) => running.once("exit", resolve));
  running.kill("SIGTERM");
  await done;
  running = null;
}
try {
  const first = path.join(root, "original"),
    restored = path.join(root, "restored"),
    backup = path.join(root, "backup");
  await start(first);
  run("scripts/production-smoke.mjs", [], { SIMULATION_DIR: first });
  await stop();
  run("scripts/simulation-backup.mjs", ["backup", first, backup]);
  run("scripts/simulation-backup.mjs", ["verify", backup]);
  run("scripts/simulation-backup.mjs", ["restore", backup, restored]);
  await start(restored);
  run("scripts/production-smoke.mjs", [], {
    SIMULATION_DIR: restored,
    EXPECT_RESTORED: "1",
  });
  await stop();
  console.log(
    "PASS: fresh production runtime, complete private backup, verified restore, restart, retained users/site/FAQ/chat, and repeated live chat.",
  );
  fs.rmSync(root, { recursive: true, force: true });
} catch (error) {
  console.error(error.message);
  console.error(`Failure evidence retained in ${root}`);
  process.exitCode = 1;
} finally {
  await stop();
}
