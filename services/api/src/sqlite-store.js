import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const collections = [
  "users",
  "sites",
  "faqs",
  "conversations",
  "messages",
  "audit",
];
export const emptyState = () =>
  Object.fromEntries(collections.map((k) => [k, []]));
export function validateState(state) {
  for (const name of collections) {
    if (!Array.isArray(state[name])) throw Error(`Invalid collection: ${name}`);
    const ids = new Set();
    for (const row of state[name]) {
      if (!row || typeof row.id !== "string" || ids.has(row.id))
        throw Error(`Invalid or duplicate ID in ${name}`);
      ids.add(row.id);
    }
  }
  for (const [child, parent, key] of [
    ["faqs", "sites", "siteId"],
    ["conversations", "sites", "siteId"],
    ["messages", "conversations", "conversationId"],
  ]) {
    const ids = new Set(state[parent].map((row) => row.id));
    if (state[child].some((row) => !ids.has(row[key])))
      throw Error(`Orphan record in ${child}`);
  }
  return state;
}

// One application process owns the state. SQLite supplies durable atomic commits;
// the existing ownership lock prevents two cached application states competing.
export function openSQLite(filename, legacyFile) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const sql = new DatabaseSync(filename);
  fs.chmodSync(filename, 0o600);
  try {
    sql.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;",
    );
    const version = sql.prepare("PRAGMA user_version").get().user_version;
    if (version > 1)
      throw Error("Database schema is newer than this application");
    if (version === 0) {
      sql.exec("BEGIN IMMEDIATE");
      try {
        for (const name of collections)
          sql.exec(
            `CREATE TABLE ${name} (id TEXT PRIMARY KEY, position INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body))) STRICT`,
          );
        sql.exec(
          "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT; PRAGMA user_version=1; COMMIT",
        );
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    }
    const load = () =>
      validateState(
        Object.fromEntries(
          collections.map((name) => [
            name,
            sql
              .prepare(`SELECT body FROM ${name} ORDER BY position`)
              .all()
              .map((row) => JSON.parse(row.body)),
          ]),
        ),
      );
    let previous = load();
    function save(state) {
      validateState(state);
      sql.exec("BEGIN IMMEDIATE");
      try {
        for (const name of collections) {
          const before = new Map(
            previous[name].map((row, position) => [
              row.id,
              { body: JSON.stringify(row), position },
            ]),
          );
          const upsert = sql.prepare(
            `INSERT INTO ${name} (id, position, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET position=excluded.position, body=excluded.body`,
          );
          state[name].forEach((row, position) => {
            const body = JSON.stringify(row),
              old = before.get(row.id);
            if (!old || old.body !== body || old.position !== position)
              upsert.run(row.id, position, body);
            before.delete(row.id);
          });
          const remove = sql.prepare(`DELETE FROM ${name} WHERE id=?`);
          for (const id of before.keys()) remove.run(id);
        }
        sql
          .prepare(
            "INSERT OR REPLACE INTO metadata VALUES ('initialized', '1')",
          )
          .run();
        sql.exec("COMMIT");
        previous = structuredClone(state);
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    }
    if (
      !sql.prepare("SELECT value FROM metadata WHERE key='initialized'").get()
    ) {
      // Existing JSON is preserved unchanged as a migration source.
      const source =
        legacyFile && fs.existsSync(legacyFile)
          ? JSON.parse(fs.readFileSync(legacyFile, "utf8"))
          : emptyState();
      save({ ...emptyState(), ...source });
    }
    return {
      load,
      save,
      healthy: () => sql.prepare("SELECT 1 AS ok").get().ok === 1,
      close: () => sql.close(),
    };
  } catch (e) {
    sql.close();
    throw e;
  }
}
