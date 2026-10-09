import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openSQLite, emptyState } from "../src/sqlite-store.js";
import { acquireStoreLock } from "../src/store-lock.js";
const script = fileURLToPath(
  new URL("../../../scripts/database.mjs", import.meta.url),
);

test("SQLite migration, rollback, persistence, backup restore and checksum validation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msd-sqlite-"));
  try {
    const data = path.join(dir, "data");
    fs.mkdirSync(data);
    const legacy = path.join(data, "store.json");
    const initial = emptyState();
    initial.users.push({
      id: "u1",
      role: "central_admin",
      passwordHash: "private",
    });
    fs.writeFileSync(legacy, JSON.stringify(initial));
    const file = path.join(data, "store.sqlite");
    let store = openSQLite(file, legacy);
    assert.deepEqual(store.load(), initial);
    const next = store.load();
    next.users[0].name = "Changed";
    store.save(next);
    const invalid = store.load();
    invalid.messages.push({ id: "m1", conversationId: "missing" });
    assert.throws(() => store.save(invalid), /Orphan/);
    assert.deepEqual(store.load(), next);
    const unserializable = store.load();
    unserializable.users[0].name = "Must roll back";
    unserializable.sites.push({ id: "bad", value: 1n });
    assert.throws(() => store.save(unserializable));
    assert.deepEqual(store.load(), next);
    store.close();
    store = openSQLite(file, legacy);
    assert.deepEqual(store.load(), next);
    store.close();
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(legacy)).users[0].name, undefined);
    const backup = path.join(dir, "backup"),
      restored = path.join(dir, "restored");
    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    const release = acquireStoreLock(legacy);
    try {
      assert.equal(run("backup", data, backup).status, 1);
    } finally {
      release();
    }
    for (const args of [
      ["backup", data, backup],
      ["verify", backup],
      ["restore", backup, restored],
    ]) {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(run("restore", backup, restored).status, 1);
    store = openSQLite(path.join(restored, "store.sqlite"));
    assert.deepEqual(store.load(), next);
    store.close();
    fs.appendFileSync(path.join(backup, "store.sqlite"), "tampered");
    assert.match(run("verify", backup).stderr, /checksum/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("failed legacy migration can be retried without losing the source", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msd-migration-"));
  try {
    const legacy = path.join(dir, "store.json"),
      file = path.join(dir, "store.sqlite");
    fs.writeFileSync(legacy, "{invalid");
    assert.throws(() => openSQLite(file, legacy));
    const state = emptyState();
    state.users.push({ id: "retry" });
    fs.writeFileSync(legacy, JSON.stringify(state));
    const store = openSQLite(file, legacy);
    assert.deepEqual(store.load(), state);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
