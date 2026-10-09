import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { reset, read } from "../src/store.js";
test("input validation, bootstrap race, CORS, local FAQ conflicts and rate limits", async () => {
  reset();
  const app = buildServer();
  const call = (method, url, payload, headers = {}) =>
    app.inject({ method, url, payload, headers });
  try {
    assert.equal(app.server.listening, false);
    const payload = {
      name: "Admin",
      email: "admin@security.test",
      password: "password12345",
    };
    const results = await Promise.all([
      call("POST", "/api/auth/bootstrap-admin", payload),
      call("POST", "/api/auth/bootstrap-admin", payload),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(read().users.length, 1);
    const token = results.find((r) => r.statusCode === 200).json().token;
    const headers = { authorization: `Bearer ${token}` };
    assert.equal(
      (
        await call("POST", "/api/sites/register", {
          name: "Bad",
          url: "javascript:alert(1)",
        })
      ).statusCode,
      400,
    );
    const reg = (
      await call("POST", "/api/sites/register", {
        name: "Site",
        url: "https://test.example/path",
      })
    ).json();
    assert.equal(
      (
        await call("POST", "/api/sites/register", {
          name: "Site",
          url: "https://test.example/other",
        })
      ).statusCode,
      409,
    );
    const preflight = await call(
      "OPTIONS",
      "/api/admin/sites/example/status",
      undefined,
      {
        origin: "http://localhost:4301",
        "access-control-request-method": "PATCH",
      },
    );
    assert.ok(
      preflight.headers["access-control-allow-methods"].includes("PATCH"),
    );
    const cors = await call("GET", "/health", undefined, {
      origin: "https://untrusted.test",
    });
    assert.equal(cors.headers["access-control-allow-origin"], undefined);
    assert.equal(
      (
        await call(
          "POST",
          "/api/admin/faqs/broadcast",
          { question: "Question?", answer: "Answer", siteIds: [] },
          headers,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call(
          "POST",
          "/api/admin/faqs/broadcast",
          { question: "Question?", answer: "Answer", siteIds: ["unknown"] },
          headers,
        )
      ).statusCode,
      400,
    );
    const faq = (
      await call("POST", `/api/sites/${reg.siteKey}/faqs`, {
        question: "Local FAQ?",
        answer: "First",
        installToken: reg.installToken,
      })
    ).json();
    const local = { "x-install-token": reg.installToken };
    assert.equal(
      (
        await call(
          "PUT",
          `/api/sites/${reg.siteKey}/faqs/${faq.id}`,
          { question: "Local FAQ?", answer: "Second", version: 1 },
          local,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await call(
          "PUT",
          `/api/sites/${reg.siteKey}/faqs/${faq.id}`,
          { question: "Local FAQ?", answer: "Stale", version: 1 },
          local,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await call(
          "DELETE",
          `/api/sites/${reg.siteKey}/faqs/${faq.id}`,
          { version: 2 },
          local,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await call("GET", `/api/sites/${reg.siteKey}/setup`, undefined, local)
      ).json().faqs.length,
      0,
    );
    let last;
    for (let i = 0; i < 61; i++)
      last = await call("POST", "/api/auth/login", {
        email: "absent@example.com",
        password: "x",
      });
    assert.equal(last.statusCode, 429);
  } finally {
    await app.close();
  }
});
