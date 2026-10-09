import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { acquireStoreLock } from "../src/store-lock.js";

test("offline administrator recovery refuses a locked store and stores only a digest", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msd-operator-"));
  const dataFile = path.join(dir, "store.json");
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      users: [
        {
          id: "operator-test",
          name: "Admin",
          email: "operator@example.com",
          role: "central_admin",
          passwordHash: "unchanged",
        },
      ],
      sites: [],
      faqs: [],
      conversations: [],
      messages: [],
      audit: [],
    }),
  );
  const script = new URL("../../../scripts/recover-admin.mjs", import.meta.url);
  const env = {
    ...process.env,
    NODE_ENV: "development",
    STORE_BACKEND: "json",
    CHAT_MSD_DATA: dir,
  };
  const release = acquireStoreLock(dataFile);
  try {
    const blocked = spawnSync(
      process.execPath,
      [decodeURIComponent(script.pathname), "operator@example.com"],
      { env, encoding: "utf8" },
    );
    // Use URL decoding for workspaces whose paths contain spaces.
    if (blocked.stderr.includes("Cannot find module"))
      throw Error("Recovery script path is invalid");
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Store is locked/);
  } finally {
    release();
  }
  try {
    const result = spawnSync(
      process.execPath,
      [decodeURIComponent(script.pathname), "operator@example.com"],
      { env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const token = result.stdout.split("\n")[1];
    assert.ok(token.length >= 40);
    const data = JSON.parse(fs.readFileSync(dataFile));
    assert.equal(data.users[0].passwordHash, "unchanged");
    assert.ok(data.users[0].passwordReset.hash);
    assert.equal(JSON.stringify(data).includes(token), false);
    assert.equal(data.audit[0].actor, "local_operator");
    assert.equal(fs.existsSync(dataFile + ".lock"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
