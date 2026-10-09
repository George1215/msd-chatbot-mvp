import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { read, reset, mutate, now } from "../src/store.js";
import { staffClaims } from "../src/staff-auth.js";
import { MAX_ATTACHMENT_BYTES, parseAttachment } from "../src/attachments.js";
import { applyRetention } from "../src/operations.js";

const attachment = (
  name = "support.txt",
  mime = "text/plain",
  bytes = Buffer.from("Private support document"),
) => ({
  name,
  mime,
  data: bytes.toString("base64"),
  requestKey: "attachment-request-123456789",
  text: "Please see the document.",
});
async function fixture() {
  reset({
    users: [
      { id: "admin", name: "Administrator", role: "central_admin" },
      {
        id: "first",
        name: "First Agent",
        role: "agent",
        available: true,
        capacity: 5,
      },
      {
        id: "second",
        name: "Second Agent",
        role: "agent",
        available: true,
        capacity: 5,
      },
    ],
    sites: [
      {
        id: "site",
        siteKey: "site-key",
        name: "Test Website",
        url: "https://attachment.test",
        status: "approved",
        widget: {},
      },
    ],
    faqs: [],
    conversations: [],
    messages: [],
    audit: [],
  });
  const app = buildServer();
  await app.ready();
  const staff = Object.fromEntries(
    read().users.map((user) => [
      user.id,
      { authorization: `Bearer ${app.jwt.sign(staffClaims(user))}` },
    ]),
  );
  const call = (method, url, payload, headers = {}) =>
    app.inject({ method, url, payload, headers });
  const create = async (key) =>
    (
      await call("POST", "/api/conversations", {
        siteKey: "site-key",
        visitorName: "Test Visitor",
        text: "Please help",
        requestKey: key,
      })
    ).json();
  return { app, staff, call, create };
}

test("attachment content validation allows documented types and rejects disguised, oversized and malformed files", () => {
  const samples = [
    ["document.pdf", "application/pdf", Buffer.from("%PDF-1.7\n%%EOF")],
    ["notes.txt", "text/plain", Buffer.from("Support notes\nTaarifa")],
    ["image.png", "image/png", Buffer.from("89504e470d0a1a0a", "hex")],
    ["image.jpg", "image/jpeg", Buffer.from("ffd8ffe0", "hex")],
    ["image.webp", "image/webp", Buffer.from("RIFF0000WEBP")],
    ["image.gif", "image/gif", Buffer.from("GIF89a")],
    ["video.mp4", "video/mp4", Buffer.from("0000ftypisom")],
    ["video.webm", "video/webm", Buffer.from("1a45dfa3", "hex")],
    ["voice.webm", "audio/webm", Buffer.from("1a45dfa3", "hex")],
    ["voice.mp3", "audio/mpeg", Buffer.from("ID3audio")],
    ["voice.wav", "audio/wav", Buffer.from("RIFF0000WAVE")],
    ["voice.ogg", "audio/ogg", Buffer.from("OggSaudio")],
  ];
  for (const [name, mime, bytes] of samples)
    assert.equal(
      parseAttachment(attachment(name, mime, bytes)).size,
      bytes.length,
    );
  for (const value of [
    attachment("../notes.txt"),
    attachment("page.html", "text/html"),
    attachment("image.svg", "image/svg+xml"),
    attachment("program.exe", "text/plain"),
    attachment(
      "fake.png",
      "image/png",
      Buffer.from("<html>not an image</html>"),
    ),
    attachment(
      "page.txt",
      "text/plain",
      Buffer.from("<svg onload=alert(1)></svg>"),
    ),
    attachment("program.txt", "text/plain", Buffer.from("MZ executable")),
    attachment("binary.txt", "text/plain", Buffer.from([0xff, 0xfe, 0x00])),
    { ...attachment(), data: "not base64!" },
    { ...attachment(), data: "Zh==" },
    attachment(
      "large.txt",
      "text/plain",
      Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 97),
    ),
  ])
    assert.throws(() => parseAttachment(value));
});

test("attachments enforce ownership, isolate visitors, retry safely and never expose bytes through message APIs or sockets", async () => {
  const { app, staff, call, create } = await fixture();
  try {
    const one = await create("conversation-one-123456789"),
      two = await create("conversation-two-123456789");
    const path = `/api/conversations/${one.conversationId}`;
    const visitor = { "x-visitor-token": one.visitorToken },
      other = { "x-visitor-token": two.visitorToken };
    const payload = attachment();
    assert.equal(
      (await call("POST", `${path}/attachments`, payload)).statusCode,
      401,
    );
    assert.equal(
      (await call("POST", `${path}/attachments`, payload, other)).statusCode,
      401,
    );
    assert.equal(
      (await call("POST", `${path}/attachments`, payload, staff.first))
        .statusCode,
      409,
    );
    await call("PATCH", path, { assignedAgentId: "first" }, staff.first);
    const events = [];
    app.io.to = (room) => ({
      emit: (event, data) => events.push({ room, event, data }),
    });
    const first = await call(
      "POST",
      `${path}/attachments`,
      payload,
      staff.first,
    );
    assert.equal(first.statusCode, 200);
    const message = first.json();
    assert.deepEqual(message.attachment, {
      id: message.attachment.id,
      name: payload.name,
      mime: payload.mime,
      size: Buffer.from(payload.data, "base64").length,
    });
    assert.equal(message.attachmentData, undefined);
    assert.deepEqual(
      (await call("POST", `${path}/attachments`, payload, staff.first)).json(),
      message,
    );
    assert.equal(read().messages.filter((m) => m.attachment).length, 1);
    assert.equal(
      read().messages.find((m) => m.id === message.id).attachmentData,
      payload.data,
    );
    assert.equal(
      (
        await call(
          "POST",
          `${path}/attachments`,
          { ...payload, name: "different.txt" },
          staff.first,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await call(
          "POST",
          `${path}/messages`,
          { text: payload.text, requestKey: payload.requestKey },
          staff.first,
        )
      ).statusCode,
      409,
    );
    const view = (await call("GET", path, undefined, visitor)).json();
    const list = (
      await call("GET", "/api/agent/conversations", undefined, staff.first)
    ).json();
    for (const value of [view, list, events, message]) {
      assert.ok(!JSON.stringify(value).includes(payload.data));
      assert.ok(!JSON.stringify(value).includes("attachmentData"));
    }
    assert.equal(list[0].site.siteKey, "site-key");
    assert.equal(view.visitorToken, undefined);
    assert.equal(
      events.filter((event) => event.event === "message:new").length,
      1,
    );
    const download = `${path}/attachments/${message.attachment.id}`;
    assert.equal((await call("GET", download)).statusCode, 401);
    assert.equal(
      (await call("GET", download, undefined, other)).statusCode,
      401,
    );
    assert.equal(
      (
        await call(
          "GET",
          `/api/conversations/${two.conversationId}/attachments/${message.attachment.id}`,
          undefined,
          other,
        )
      ).statusCode,
      404,
    );
    const file = await call("GET", download, undefined, visitor);
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers["content-type"], "application/octet-stream");
    assert.match(file.headers["content-disposition"], /^attachment;/);
    assert.equal(file.headers["x-content-type-options"], "nosniff");
    assert.equal(file.headers["cache-control"], "private, no-store");
    assert.equal(file.body, "Private support document");
    const visitorUpload = {
      ...attachment(),
      requestKey: "visitor-attachment-12345678",
    };
    assert.equal(
      (await call("POST", `${path}/attachments`, visitorUpload, visitor))
        .statusCode,
      200,
    );
    mutate((db) => {
      db.sites[0].status = "suspended";
    });
    assert.equal(
      (
        await call(
          "POST",
          `${path}/attachments`,
          { ...payload, requestKey: "suspended-request-12345678" },
          staff.first,
        )
      ).statusCode,
      403,
    );
    mutate((db) => {
      db.sites[0].status = "approved";
    });
    await call("PATCH", path, { status: "closed" }, staff.first);
    assert.equal(
      (
        await call(
          "POST",
          `${path}/attachments`,
          { ...payload, requestKey: "closed-request-123456789" },
          visitor,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await call("GET", download, undefined, staff.first)).statusCode,
      200,
    );
  } finally {
    await app.close();
  }
});

test("attachment route accepts the 2 MiB bound, restores bytes with store snapshots, and retention removes them with the conversation", async () => {
  const { app, staff, call, create } = await fixture();
  try {
    const conversation = await create("maximum-conversation-12345678");
    const path = `/api/conversations/${conversation.conversationId}`;
    const payload = attachment(
      "maximum.txt",
      "text/plain",
      Buffer.alloc(MAX_ATTACHMENT_BYTES, 97),
    );
    const response = await call("POST", `${path}/attachments`, payload, {
      "x-visitor-token": conversation.visitorToken,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().attachment.size, MAX_ATTACHMENT_BYTES);
    const saved = JSON.parse(JSON.stringify(read()));
    reset(saved);
    const download = `${path}/attachments/${response.json().attachment.id}`;
    assert.equal(
      (await call("GET", download, undefined, staff.admin)).rawPayload.length,
      MAX_ATTACHMENT_BYTES,
    );
    await call("PATCH", path, { status: "closed" }, staff.admin);
    const result = applyRetention(
      { conversationDays: 1, auditDays: 90 },
      Date.now() + 2 * 86400000,
    );
    assert.equal(result.messages, 2);
    assert.equal(read().messages.length, 0);
    assert.equal(
      (await call("GET", download, undefined, staff.admin)).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});

test("conversation timeline records real creation, claims, transfers and status changes including legacy audit history", async () => {
  const { app, staff, call, create } = await fixture();
  try {
    const conversation = await create("timeline-conversation-12345678");
    const path = `/api/conversations/${conversation.conversationId}`;
    await call("PATCH", path, { assignedAgentId: "first" }, staff.first);
    await call(
      "PATCH",
      path,
      { assignedAgentId: "second", status: "pending" },
      staff.first,
    );
    await call("PATCH", path, { status: "closed" }, staff.second);
    const view = (await call("GET", path, undefined, staff.admin)).json();
    assert.deepEqual(
      view.timeline.map((event) => event.type),
      ["created", "assignment", "assignment", "status", "status"],
    );
    assert.equal(view.timeline[0].actor.name, "Test Visitor");
    assert.deepEqual(
      view.transferHistory.map((event) => [
        event.fromAgentName,
        event.toAgentName,
        event.actor.name,
      ]),
      [
        [null, "First Agent", "First Agent"],
        ["First Agent", "Second Agent", "First Agent"],
      ],
    );
    assert.equal(view.timeline.at(-1).toStatus, "closed");
    assert.equal(view.timeline.at(-1).actor.id, "second");
    assert.ok(
      view.timeline.every((event) => Number.isFinite(Date.parse(event.at))),
    );
    mutate((db) => {
      delete db.conversations[0].timeline;
    });
    const legacy = (await call("GET", path, undefined, staff.admin)).json();
    assert.deepEqual(
      legacy.timeline.map(({ type, actor }) => [type, actor.name]),
      view.timeline.map(({ type, actor }) => [type, actor.name]),
    );
    assert.deepEqual(
      legacy.transferHistory.map(({ fromAgentId, toAgentId }) => [
        fromAgentId,
        toAgentId,
      ]),
      [
        [null, "first"],
        ["first", "second"],
      ],
    );
    assert.equal(
      read().conversations[0].timeline,
      undefined,
      "read-only projection does not change stored legacy data",
    );
  } finally {
    await app.close();
  }
});
