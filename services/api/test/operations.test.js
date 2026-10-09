import test from "node:test";
import assert from "node:assert/strict";
import { reset, read } from "../src/store.js";
import { applyRetention } from "../src/operations.js";
import { buildServer } from "../src/server.js";

test("retention removes expired closed transcripts, preserves active work and records counts", async () => {
  const old = "2020-01-01T00:00:00Z",
    recent = new Date().toISOString();
  reset({
    users: [],
    sites: [{ id: "s" }],
    faqs: [],
    conversations: [
      { id: "closed", siteId: "s", status: "closed", updatedAt: old },
      { id: "active", siteId: "s", status: "open", updatedAt: old },
      { id: "recent", siteId: "s", status: "closed", updatedAt: recent },
    ],
    messages: [
      { id: "m1", conversationId: "closed" },
      { id: "m2", conversationId: "active" },
    ],
    audit: [{ id: "a", at: old }],
  });
  assert.deepEqual(applyRetention({ conversationDays: 90, auditDays: 365 }), {
    conversations: 1,
    messages: 1,
    audit: 1,
  });
  assert.deepEqual(
    read().conversations.map((c) => c.id),
    ["active", "recent"],
  );
  assert.equal(read().messages[0].id, "m2");
  assert.equal(read().audit[0].action, "retention.cleanup");
  assert.throws(() => applyRetention({ conversationDays: 0, auditDays: 365 }));
  const app = buildServer();
  try {
    assert.equal((await app.inject("/ready")).statusCode, 200);
    assert.equal((await app.inject("/api/admin/operations")).statusCode, 401);
    assert.equal((await app.inject("/api/admin/reports")).statusCode, 401);
  } finally {
    await app.close();
  }
});
