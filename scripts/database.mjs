// Offline maintenance: stop the API first. Restore writes only into an empty directory.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import { acquireStoreLock } from "../packages/shared/src/file-lock.js";
import {
  openSQLite,
  collections,
  validateState,
} from "../services/api/src/sqlite-store.js";

const [command, sourceArg, targetArg] = process.argv.slice(2);
const digest = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function verify(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw Error("Database integrity check failed");
    if (db.prepare("PRAGMA user_version").get().user_version !== 1)
      throw Error("Unsupported schema version");
    const state = validateState(
      Object.fromEntries(
        collections.map((name) => [
          name,
          db
            .prepare(`SELECT body FROM ${name} ORDER BY position`)
            .all()
            .map((row) => JSON.parse(row.body)),
        ]),
      ),
    );
    return Object.fromEntries(
      collections.map((name) => [name, state[name].length]),
    );
  } finally {
    db.close();
  }
}
try {
  if (
    !["migrate", "backup", "verify", "restore"].includes(command) ||
    !sourceArg
  )
    throw Error(
      "Usage: node scripts/database.mjs migrate DATA_DIR | backup DATA_DIR NEW_BACKUP_DIR | verify BACKUP_DIR | restore BACKUP_DIR EMPTY_DATA_DIR",
    );
  const source = path.resolve(sourceArg),
    target = targetArg && path.resolve(targetArg);
  if (command === "verify" || command === "restore") {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(source, "manifest.json")),
    );
    const file = path.join(source, "store.sqlite");
    if (digest(file) !== manifest.sha256)
      throw Error("Backup checksum mismatch");
    const counts = verify(file);
    if (JSON.stringify(counts) !== JSON.stringify(manifest.counts))
      throw Error("Backup counts mismatch");
    if (command === "restore") {
      if (!target || (fs.existsSync(target) && fs.readdirSync(target).length))
        throw Error("Restore requires an empty destination");
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
      const release = acquireStoreLock(path.join(target, "store.json"));
      try {
        fs.copyFileSync(
          file,
          path.join(target, "store.sqlite"),
          fs.constants.COPYFILE_EXCL,
        );
        fs.chmodSync(path.join(target, "store.sqlite"), 0o600);
      } finally {
        release();
      }
    }
    console.log(JSON.stringify({ ok: true, command, counts }));
  } else {
    if (!fs.existsSync(source)) throw Error("Data directory does not exist");
    if (
      !fs.existsSync(path.join(source, "store.sqlite")) &&
      !fs.existsSync(path.join(source, "store.json"))
    )
      throw Error("No database or legacy data found");
    const release = acquireStoreLock(path.join(source, "store.json"));
    try {
      const store = openSQLite(
        path.join(source, "store.sqlite"),
        path.join(source, "store.json"),
      );
      store.close();
      if (command === "backup") {
        if (!target || fs.existsSync(target))
          throw Error("Backup requires a new destination directory");
        fs.mkdirSync(target, { recursive: true, mode: 0o700 });
        const sql = new DatabaseSync(path.join(source, "store.sqlite"), {
          readOnly: true,
        });
        const output = path.join(target, "store.sqlite");
        try {
          await backup(sql, output);
        } finally {
          sql.close();
        }
        fs.chmodSync(output, 0o600);
        const counts = verify(output);
        fs.writeFileSync(
          path.join(target, "manifest.json"),
          JSON.stringify(
            {
              schema: 1,
              createdAt: new Date().toISOString(),
              sha256: digest(output),
              counts,
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
        console.log(JSON.stringify({ ok: true, command, counts }));
      } else
        console.log(
          JSON.stringify({
            ok: true,
            command,
            counts: verify(path.join(source, "store.sqlite")),
          }),
        );
    } finally {
      release();
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
