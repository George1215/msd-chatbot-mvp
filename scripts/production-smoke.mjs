import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { io } from "socket.io-client";
const dir = path.resolve(
  process.env.SIMULATION_DIR || ".test-artifacts/production",
);
const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json")));
const ca = fs.readFileSync(path.join(dir, "localhost.crt"));
const origin = "https://localhost:4443";
const agent = new https.Agent({ ca });
function request(url, method = "GET", body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      origin + url,
      {
        agent,
        method,
        headers: { "content-type": "application/json", origin, ...headers },
        timeout: 10000,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(Error("Request timed out")));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const expect = async (url, method, body, headers, status = 200) => {
  const response = await request(url, method, body, headers);
  assert.equal(
    response.status,
    status,
    `${method || "GET"} ${url}: ${response.status}`,
  );
  return response;
};
const sockets = [];
try {
  await expect("/ready");
  for (const url of [
    "/apps/about/",
    "/apps/admin/",
    "/apps/agent/",
    "/apps/dummy-site/",
    "/apps/dummy-site/admin.html",
    "/chat-msd-widget.js",
  ]) {
    const response = await expect(url);
    assert.ok(response.headers["strict-transport-security"]);
    assert.ok(response.headers["x-content-type-options"]);
    if (url === "/apps/agent/") {
      assert.match(
        response.headers["content-security-policy"],
        /img-src[^;]*blob:/,
      );
      assert.match(
        response.headers["content-security-policy"],
        /media-src[^;]*blob:/,
      );
    }
  }
  for (const url of [
    "/.env",
    "/services/api/data/store.json",
    "/services/host/data/installation.json",
    "/.test-artifacts/production/config.json",
    "/scripts/production-local.mjs",
  ])
    await expect(url, "GET", undefined, {}, 404);
  await expect("/api/admin/operations", "GET", undefined, {}, 401);
  await expect("/host-api/setup", "GET", undefined, {}, 401);
  const adminBody = {
    name: "Production Simulation Admin",
    email: "simulation-admin@example.test",
    password: config.adminPassword,
  };
  await expect("/api/auth/bootstrap-admin", "POST", adminBody, {}, 403);
  const boot = await request("/api/auth/bootstrap-admin", "POST", adminBody, {
    "x-bootstrap-secret": config.BOOTSTRAP_SECRET,
  });
  assert.ok([200, 409].includes(boot.status));
  if (process.env.EXPECT_RESTORED)
    assert.equal(boot.status, 409, "Restored administrator missing");
  const admin = (await expect("/api/auth/login", "POST", adminBody)).data;
  const auth = { authorization: `Bearer ${admin.token}` };
  const host = await expect("/host-api/login", "POST", {
    password: config.hostPassword,
  });
  const cookieHeader = host.headers["set-cookie"][0];
  for (const flag of ["__Secure-", "HttpOnly", "SameSite=Strict", "Secure"])
    assert.ok(cookieHeader.includes(flag));
  const hostAuth = {
    cookie: cookieHeader.split(";")[0],
    "x-csrf-token": host.data.csrfToken,
  };
  await expect(
    "/host-api/settings",
    "PATCH",
    { title: "Unauthorized" },
    { cookie: hostAuth.cookie },
    403,
  );
  const install = (
    await expect(
      "/host-api/install",
      "POST",
      { name: "Production Simulation Website", adminEmail: adminBody.email },
      hostAuth,
    )
  ).data;
  assert.equal("installToken" in install, false);
  const sites = (await expect("/api/admin/sites", "GET", undefined, auth)).data;
  const site = sites.find((s) => s.siteKey === install.siteKey);
  assert.ok(site);
  if (site.status !== "approved")
    await expect(
      `/api/admin/sites/${site.id}/status`,
      "PATCH",
      { status: "approved" },
      auth,
    );
  const setup = (await expect("/host-api/setup", "GET", undefined, hostAuth))
    .data;
  if (process.env.EXPECT_RESTORED)
    assert.ok(setup.faqs.length, "Restored FAQ missing");
  if (!setup.faqs.length)
    await expect(
      "/host-api/faqs",
      "POST",
      {
        question: "How does this simulation work?",
        answer:
          "Compiled assets, HTTPS, SQLite, and production authentication.",
      },
      hostAuth,
    );
  const widget = (await expect("/host-api/widget")).data;
  assert.deepEqual(Object.keys(widget).sort(), ["api", "siteKey"]);
  const agents = (await expect("/api/agents", "GET", undefined, auth)).data;
  const agentBody = {
    name: "Simulation Agent",
    email: "simulation-agent@example.test",
    password: config.agentPassword,
    capacity: 50,
  };
  let staff = agents.find((a) => a.email === agentBody.email);
  if (process.env.EXPECT_RESTORED) assert.ok(staff, "Restored agent missing");
  if (!staff)
    staff = (await expect("/api/admin/agents", "POST", agentBody, auth)).data;
  const signed = (await expect("/api/auth/login", "POST", agentBody)).data;
  const staffAuth = { authorization: `Bearer ${signed.token}` };
  await expect("/api/admin/operations", "GET", undefined, staffAuth, 403);
  const conversation = (
    await expect("/api/conversations", "POST", {
      siteKey: site.siteKey,
      visitorName: "Local simulation",
      text: "Production smoke request",
      requestKey: crypto.randomUUID(),
    })
  ).data;
  const cid = conversation.conversationId;
  await expect(
    `/api/conversations/${cid}`,
    "PATCH",
    { assignedAgentId: staff.id },
    staffAuth,
  );
  const socket = io(origin, {
    auth: { conversationId: cid, visitorToken: conversation.visitorToken },
    transports: ["websocket"],
    ca,
    reconnection: false,
    timeout: 5000,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  const delivered = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Socket delivery timed out")),
      5000,
    );
    socket.once("message:new", (message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
  await expect(
    `/api/conversations/${cid}/messages`,
    "POST",
    { text: "Production socket reply", requestKey: crypto.randomUUID() },
    staffAuth,
  );
  assert.equal((await delivered).text, "Production socket reply");
  const uploaded = (
    await expect(
      `/api/conversations/${cid}/attachments`,
      "POST",
      {
        name: "smoke.txt",
        mime: "text/plain",
        data: Buffer.from("Production attachment").toString("base64"),
        requestKey: crypto.randomUUID(),
      },
      staffAuth,
    )
  ).data;
  assert.equal(uploaded.attachmentData, undefined);
  const attachmentPath = `/api/conversations/${cid}/attachments/${uploaded.attachment.id}`;
  await expect(attachmentPath, "GET", undefined, {}, 401);
  const downloaded = await expect(attachmentPath, "GET", undefined, {
    "x-visitor-token": conversation.visitorToken,
  });
  assert.equal(downloaded.data, "Production attachment");
  assert.match(downloaded.headers["content-disposition"], /attachment;/);
  const stored = (
    await expect("/api/agent/conversations", "GET", undefined, auth)
  ).data;
  assert.ok(stored.find((c) => c.id === cid).timeline.length >= 2);
  if (process.env.EXPECT_RESTORED)
    assert.ok(
      stored.some((c) => c.id !== cid && c.messages.some((m) => m.attachment)),
      "Restored attachment missing",
    );
  await expect(
    `/api/conversations/${cid}`,
    "PATCH",
    { status: "closed" },
    staffAuth,
  );
  const report = (
    await expect("/api/admin/reports?days=30", "GET", undefined, auth)
  ).data;
  assert.ok(report.totals.closed >= (process.env.EXPECT_RESTORED ? 2 : 1));
  const operations = (
    await expect("/api/admin/operations", "GET", undefined, auth)
  ).data;
  assert.equal(operations.storageHealthy, true);
  assert.equal(operations.serverErrors, 0);
  await expect("/host-api/logout", "POST", {}, hostAuth);
  await expect("/host-api/setup", "GET", undefined, hostAuth, 401);
  console.log(
    "PASS: HTTPS trust, compiled pages/widget, private-file denial, bootstrap protection, secure host session/CSRF, installation, FAQ, approvals, staff authorization, live WebSocket chat, protected attachments/timeline, reporting and logout.",
  );
  console.log(
    `Retained simulation: ${sites.length} site(s), ${report.totals.conversations} conversation(s).`,
  );
} finally {
  for (const socket of sockets) socket.close();
  agent.destroy();
}
