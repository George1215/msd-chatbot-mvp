import { openSQLite } from "./sqlite-store.js";
import { acquireStoreLock } from "./store-lock.js";
import { migrateInstallCredentials } from "./install-credentials.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR =
  process.env.CHAT_MSD_DATA ||
  fileURLToPath(new URL("../data", import.meta.url));
const DATA_FILE = path.join(
  DATA_DIR,
  process.env.NODE_ENV === "test" ? `store-${process.pid}.json` : "store.json",
);
fs.mkdirSync(DATA_DIR, { recursive: true });
const seed = {
  users: [],
  sites: [],
  faqs: [],
  conversations: [],
  messages: [],
  audit: [],
};

function load() {
  if (!fs.existsSync(DATA_FILE)) return structuredClone(seed);
  try {
    return {
      ...structuredClone(seed),
      ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")),
    };
  } catch (error) {
    throw new Error(`Cannot read store: ${error.message}`);
  }
}
const releaseLock = acquireStoreLock(DATA_FILE);
process.once("exit", releaseLock);
const backend =
  process.env.STORE_BACKEND ||
  (process.env.NODE_ENV === "production" ? "sqlite" : "json");
if (!["json", "sqlite"].includes(backend)) throw Error("Unknown STORE_BACKEND");
if (process.env.NODE_ENV === "production" && backend !== "sqlite")
  throw Error("Production requires SQLite storage");
const sqlite =
  backend === "sqlite"
    ? openSQLite(
        path.join(
          DATA_DIR,
          process.env.NODE_ENV === "test"
            ? `store-${process.pid}.sqlite`
            : "store.sqlite",
        ),
        DATA_FILE,
      )
    : null;
process.once("exit", () => sqlite?.close());
let db = sqlite ? sqlite.load() : load();
export function storageHealth() {
  return sqlite ? sqlite.healthy() : fs.existsSync(DATA_DIR);
}
function save() {
  if (sqlite) return sqlite.save(db);
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}
if (migrateInstallCredentials(db)) save();
export const id = (prefix = "id") => `${prefix}_${crypto.randomUUID()}`;
export const now = () => new Date().toISOString();
export function read() {
  return db;
}
export function reset(next = seed) {
  const before = db;
  try {
    db = structuredClone(next);
    save();
  } catch (error) {
    db = before;
    throw error;
  }
}
export function mutate(fn) {
  const before = structuredClone(db);
  try {
    const result = fn(db);
    save();
    return result;
  } catch (error) {
    db = before;
    throw error;
  }
}
export function audit(actor, action, meta = {}) {
  return mutate((d) =>
    d.audit.unshift({ id: id("audit"), actor, action, meta, at: now() }),
  );
}
