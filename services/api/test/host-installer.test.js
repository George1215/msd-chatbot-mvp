import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { buildHostServer } from "@chat-msd/host-installer";
import { buildServer } from "../src/server.js";
import { reset, read } from "../src/store.js";
const origin = "http://localhost:4303";
const password = "HostPassword!2026";

async function fixture(extra = {}) {
  reset();
  const central = buildServer();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msd-host-"));
  const credentialFile = path.join(directory, "installation.json");
  const options = {
    siteUrl: origin,
    apiOrigin: "http://localhost:4300",
    credentialFile,
    adminPasswordHash: await bcrypt.hash(password, 4),
    transport: async (url, method = "GET", payload, headers = {}) => {
      const response = await central.inject({ url, method, payload, headers });
      const data = response.json();
      if (response.statusCode >= 400)
        throw Object.assign(Error(data.error), {
          statusCode: response.statusCode,
        });
      return data;
    },
    ...extra,
  };
  let host = buildHostServer(options);
  const call = async (method, url, payload, headers = {}) => {
    const r = await host.inject({
      method,
      url,
      payload,
      headers: { host: "localhost:4303", origin, ...headers },
    });
    return { status: r.statusCode, data: r.json(), headers: r.headers };
  };
  const login = async () => {
    const r = await call("POST", "/host-api/login", { password });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers["set-cookie"].split(";")[0],
      "x-csrf-token": r.data.csrfToken,
    };
  };
  return {
    central,
    options,
    credentialFile,
    call,
    login,
    restart: async () => {
      await host.close();
      host = buildHostServer(options);
    },
    close: async () => {
      await host.close();
      await central.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("host installer authenticates, protects mutations, persists credentials and serves public config to fresh visitors", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call("GET", "/host-api/setup")).status, 401);
    assert.equal(
      (
        await f.call("POST", "/host-api/install", {
          name: "Demo",
          adminEmail: "owner@test.local",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await f.call(
          "POST",
          "/host-api/login",
          { password },
          { origin: "https://attacker.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call("GET", "/host-api/widget", undefined, {
          host: "localhost:4301",
        })
      ).status,
      403,
    );
    const login = await f.call("POST", "/host-api/login", { password });
    assert.match(login.headers["set-cookie"], /HttpOnly/);
    assert.match(login.headers["set-cookie"], /SameSite=Strict/);
    const auth = {
      cookie: login.headers["set-cookie"].split(";")[0],
      "x-csrf-token": login.data.csrfToken,
    };
    assert.equal(
      (
        await f.call(
          "POST",
          "/host-api/install",
          { name: "Demo", adminEmail: "owner@test.local" },
          { cookie: auth.cookie },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call(
          "POST",
          "/host-api/install",
          { name: "Demo", adminEmail: "owner@test.local" },
          auth,
        )
      ).status,
      200,
    );
    const saved = JSON.parse(fs.readFileSync(f.credentialFile));
    assert.ok(saved.installToken);
    assert.ok(saved.siteKey);
    assert.equal(fs.statSync(f.credentialFile).mode & 0o777, 0o600);
    assert.equal(read().sites.length, 1);
    const publicData = (await f.call("GET", "/host-api/widget")).data;
    assert.equal(publicData.siteKey, saved.siteKey);
    assert.equal(
      JSON.stringify(publicData).includes(saved.installToken),
      false,
    );
    const setup = (await f.call("GET", "/host-api/setup", undefined, auth))
      .data;
    assert.equal(setup.status, "pending");
    assert.equal(setup.installToken, undefined);
    assert.equal(setup.installTokenHash, undefined);
    const faq = await f.call(
      "POST",
      "/host-api/faqs",
      { question: "Local FAQ?", answer: "Private setup works" },
      auth,
    );
    assert.equal(faq.status, 200);
    assert.equal(
      (
        await f.call(
          "PATCH",
          "/host-api/settings",
          { title: "Help desk" },
          auth,
        )
      ).status,
      200,
    );
    await f.restart();
    assert.equal(
      (await f.call("GET", "/host-api/setup", undefined, auth)).status,
      401,
    );
    const renewed = await f.login();
    assert.equal(
      (await f.call("GET", "/host-api/setup", undefined, renewed)).data.faqs
        .length,
      1,
    );
    assert.equal(
      (await f.call("GET", "/host-api/widget")).data.siteKey,
      saved.siteKey,
    );
    await f.call(
      "POST",
      "/host-api/install",
      { name: "Changed", adminEmail: "owner@test.local" },
      renewed,
    );
    assert.equal(read().sites.length, 1);
    await f.call("POST", "/host-api/logout", {}, renewed);
    assert.equal(
      (await f.call("GET", "/host-api/setup", undefined, renewed)).status,
      401,
    );
  } finally {
    await f.close();
  }
});

test("lost registration response retries the same credential and cannot take over another installation", async () => {
  const f = await fixture();
  try {
    const auth = await f.login();
    const original = f.options.transport;
    let lost = true;
    f.options.transport = async (...args) => {
      const data = await original(...args);
      if (args[0] === "/api/sites/register" && lost) {
        lost = false;
        throw Object.assign(Error("central_unavailable"), { statusCode: 503 });
      }
      return data;
    };
    await f.restart();
    const fresh = await f.login();
    assert.equal(
      (
        await f.call(
          "POST",
          "/host-api/install",
          { name: "Retry", adminEmail: "owner@test.local" },
          fresh,
        )
      ).status,
      503,
    );
    assert.equal(read().sites.length, 1);
    const pending = JSON.parse(fs.readFileSync(f.credentialFile));
    assert.ok(pending.installToken);
    assert.equal(pending.siteKey, undefined);
    await f.restart();
    const again = await f.login();
    assert.equal(
      (
        await f.call(
          "POST",
          "/host-api/install",
          { name: "Retry", adminEmail: "owner@test.local" },
          again,
        )
      ).status,
      200,
    );
    assert.equal(read().sites.length, 1);
    assert.equal(
      JSON.parse(fs.readFileSync(f.credentialFile)).installToken,
      pending.installToken,
    );
    const bad = await f.central.inject({
      method: "POST",
      url: "/api/sites/register",
      payload: {
        name: "Attacker",
        url: origin,
        registrationToken: "x".repeat(43),
      },
    });
    assert.equal(bad.statusCode, 409);
  } finally {
    await f.close();
  }
});

test("host reconnect rejects a different website and stores the correct replacement only server-side", async () => {
  const f = await fixture();
  try {
    const auth = await f.login();
    const wrong = (
      await f.central.inject({
        method: "POST",
        url: "/api/sites/register",
        payload: { name: "Other", url: "https://other.example" },
      })
    ).json();
    assert.equal(
      (
        await f.call(
          "POST",
          "/host-api/reconnect",
          { siteKey: wrong.siteKey, installToken: wrong.installToken },
          auth,
        )
      ).status,
      409,
    );
    assert.equal(fs.existsSync(f.credentialFile), false);
    const own = (
      await f.central.inject({
        method: "POST",
        url: "/api/sites/register",
        payload: { name: "Own", url: origin },
      })
    ).json();
    const response = await f.call(
      "POST",
      "/host-api/reconnect",
      { siteKey: own.siteKey, installToken: own.installToken },
      auth,
    );
    assert.deepEqual(response.data, { ok: true });
    assert.equal(
      (await f.call("GET", "/host-api/widget")).data.siteKey,
      own.siteKey,
    );
  } finally {
    await f.close();
  }
});

test("host login limits guesses, secure origins use Secure cookies, and expired sessions fail", async () => {
  const f = await fixture({ sessionMs: 20 });
  try {
    const auth = await f.login();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      (await f.call("GET", "/host-api/setup", undefined, auth)).status,
      401,
    );
    for (let i = 0; i < 9; i++)
      assert.equal(
        (await f.call("POST", "/host-api/login", { password: "wrong" })).status,
        401,
      );
    assert.equal(
      (await f.call("POST", "/host-api/login", { password })).status,
      429,
    );
  } finally {
    await f.close();
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msd-host-https-"));
  const host = buildHostServer({
    siteUrl: "https://website.test",
    apiOrigin: "https://central.test",
    credentialFile: path.join(directory, "installation.json"),
    adminPasswordHash: await bcrypt.hash(password, 4),
  });
  try {
    const r = await host.inject({
      method: "POST",
      url: "/host-api/login",
      headers: { host: "website.test", origin: "https://website.test" },
      payload: { password },
    });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers["set-cookie"], /; Secure/);
    assert.match(r.headers["set-cookie"], /^__Secure-/);
  } finally {
    await host.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
