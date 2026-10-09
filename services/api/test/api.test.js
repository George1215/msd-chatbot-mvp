import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
process.env.CHAT_MSD_DATA = "/tmp/chat-msd-bot-test";
import { buildServer } from "../src/server.js";
import { reset } from "../src/store.js";

test("site auto-registers pending and stays hidden until approved", async () => {
  reset();
  const app = buildServer();
  const r = await app.inject({
    method: "POST",
    url: "/api/sites/register",
    payload: {
      name: "Dummy MSD",
      url: "https://dummy.local",
      platform: "generic",
    },
  });
  assert.equal(r.statusCode, 201);
  const reg = r.json();
  assert.equal(reg.status, "pending");

  const b = await app.inject({
    method: "GET",
    url: `/api/sites/${reg.siteKey}/bootstrap`,
  });
  assert.equal(b.statusCode, 200);
  assert.equal(b.json().site.widget.enabled, false);
  await app.close();
});

test("decline requires a reason", async () => {
  reset();
  const app = buildServer();
  const a = await app.inject({
    method: "POST",
    url: "/api/auth/bootstrap-admin",
    payload: {
      name: "Admin",
      email: "admin@example.com",
      password: "password123",
    },
  });
  const token = a.json().token;

  await app.inject({
    method: "POST",
    url: "/api/sites/register",
    payload: { name: "Site", url: "https://site.local" },
  });

  const sites = await app.inject({
    method: "GET",
    url: "/api/admin/sites",
    headers: { authorization: `Bearer ${token}` },
  });
  const site = sites.json()[0];

  const r = await app.inject({
    method: "PATCH",
    url: `/api/admin/sites/${site.id}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "declined" },
  });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error, "reason_required");
  await app.close();
});

test("central admin approval makes widget live", async () => {
  reset();
  const app = buildServer();
  const a = await app.inject({
    method: "POST",
    url: "/api/auth/bootstrap-admin",
    payload: {
      name: "Admin",
      email: "admin@example.com",
      password: "password123",
    },
  });
  const token = a.json().token;
  const reg = (
    await app.inject({
      method: "POST",
      url: "/api/sites/register",
      payload: { name: "Site", url: "https://site.local" },
    })
  ).json();

  const site = (
    await app.inject({
      method: "GET",
      url: "/api/admin/sites",
      headers: { authorization: `Bearer ${token}` },
    })
  ).json()[0];

  const approve = await app.inject({
    method: "PATCH",
    url: `/api/admin/sites/${site.id}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "approved" },
  });
  assert.equal(approve.statusCode, 200);

  const boot = (
    await app.inject({
      method: "GET",
      url: `/api/sites/${reg.siteKey}/bootstrap`,
    })
  ).json();
  assert.equal(boot.site.widget.enabled, true);
  await app.close();
});
