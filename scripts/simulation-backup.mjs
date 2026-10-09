import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireStoreLock } from "../packages/shared/src/file-lock.js";
const dbScript = fileURLToPath(new URL("./database.mjs", import.meta.url));
const [command, sourceArg, targetArg] = process.argv.slice(2);
const files = [
  "config.json",
  "localhost.crt",
  "localhost.key",
  "host/installation.json",
];
const digest = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function database(...args) {
  const result = spawnSync(process.execPath, [dbScript, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw Error(result.stderr);
}
try {
  if (
    !["backup", "verify", "restore"].includes(command) ||
    !sourceArg ||
    (command !== "verify" && !targetArg)
  )
    throw Error(
      "Usage: node scripts/simulation-backup.mjs backup SIMULATION_DIR NEW_BACKUP_DIR | verify BACKUP_DIR | restore BACKUP_DIR EMPTY_SIMULATION_DIR",
    );
  const source = path.resolve(sourceArg),
    target = targetArg && path.resolve(targetArg);
  if (command === "backup") {
    if (fs.existsSync(target)) throw Error("Backup requires a new directory");
    if (fs.existsSync(path.join(source, "central/store.json.lock")))
      throw Error("Stop the simulation before backup");
    for (const file of files)
      if (!fs.existsSync(path.join(source, file)))
        throw Error(`Missing simulation file: ${file}`);
    const release = acquireStoreLock(
      path.join(source, "host/installation.json"),
    );
    try {
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
      database(
        "backup",
        path.join(source, "central"),
        path.join(target, "central"),
      );
      const checksums = {};
      for (const file of files) {
        const to = path.join(target, file);
        fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
        fs.copyFileSync(
          path.join(source, file),
          to,
          fs.constants.COPYFILE_EXCL,
        );
        fs.chmodSync(to, 0o600);
        checksums[file] = digest(to);
      }
      fs.writeFileSync(
        path.join(target, "bundle.json"),
        JSON.stringify(
          { version: 1, createdAt: new Date().toISOString(), checksums },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    } finally {
      release();
    }
  } else {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(source, "bundle.json")),
    );
    if (bundle.version !== 1) throw Error("Unsupported bundle version");
    for (const file of files)
      if (digest(path.join(source, file)) !== bundle.checksums[file])
        throw Error(`Bundle checksum mismatch: ${file}`);
    database("verify", path.join(source, "central"));
    if (command === "restore") {
      if (fs.existsSync(target) && fs.readdirSync(target).length)
        throw Error("Restore requires an empty destination");
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
      database(
        "restore",
        path.join(source, "central"),
        path.join(target, "central"),
      );
      for (const file of files) {
        const to = path.join(target, file);
        fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
        fs.copyFileSync(
          path.join(source, file),
          to,
          fs.constants.COPYFILE_EXCL,
        );
        fs.chmodSync(to, 0o600);
      }
    }
  }
  console.log(
    `PASS: simulation ${command}; private credentials are not printed.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
