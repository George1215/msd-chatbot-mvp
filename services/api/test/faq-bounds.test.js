import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { read, reset } from "../src/store.js";

test("local and central FAQ writes share content limits and reject invalid content without changing stored FAQs", async () => {
  reset();
  const app = buildServer();
  const call = (method, url, payload, headers = {}) =>
    app.inject({ method, url, payload, headers });
  try {
    const administrator = (
      await call("POST", "/api/auth/bootstrap-admin", {
        name: "Administrator",
        email: "admin@faq-bounds.test",
        password: "testpassword123",
      })
    ).json();
    const adminHeaders = { authorization: `Bearer ${administrator.token}` };
    const site = (
      await call("POST", "/api/sites/register", {
        name: "FAQ Website",
        url: "https://faq-bounds.test",
      })
    ).json();
    const maximum = { question: "Q".repeat(300), answer: "A".repeat(5000) };
    const localPath = `/api/sites/${site.siteKey}/faqs`;
    const created = await call("POST", localPath, {
      ...maximum,
      installToken: site.installToken,
    });
    assert.equal(created.statusCode, 201);
    const faq = created.json();
    const localHeaders = { "x-install-token": site.installToken };
    const original = JSON.stringify({ faqs: read().faqs, audit: read().audit });
    for (const content of [
      { ...maximum, question: "Q".repeat(301) },
      { ...maximum, answer: "A".repeat(5001) },
      { ...maximum, question: "   " },
      { ...maximum, answer: " \n\t " },
    ]) {
      for (const [method, url, body, headers] of [
        [
          "POST",
          localPath,
          { ...content, installToken: site.installToken },
          {},
        ],
        [
          "PUT",
          `${localPath}/${faq.id}`,
          { ...content, version: 1 },
          localHeaders,
        ],
        ["PUT", `/api/admin/faqs/${faq.id}`, content, adminHeaders],
        ["POST", "/api/admin/faqs/broadcast", content, adminHeaders],
      ]) {
        const result = await call(method, url, body, headers);
        assert.equal(
          result.statusCode,
          400,
          `${method} ${url} must reject invalid content`,
        );
        assert.equal(result.json().error, "invalid_input");
        assert.equal(
          JSON.stringify({ faqs: read().faqs, audit: read().audit }),
          original,
        );
      }
    }
    const padded = {
      question: ` ${maximum.question} `,
      answer: `\n${maximum.answer}\n`,
    };
    assert.equal(
      (
        await call(
          "PUT",
          `${localPath}/${faq.id}`,
          { ...padded, version: 1 },
          localHeaders,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await call("PUT", `/api/admin/faqs/${faq.id}`, padded, adminHeaders))
        .statusCode,
      200,
    );
    assert.equal(
      (await call("POST", "/api/admin/faqs/broadcast", padded, adminHeaders))
        .statusCode,
      200,
    );
    assert.equal(read().faqs.length, 2);
    for (const stored of read().faqs) {
      assert.equal(stored.question, maximum.question);
      assert.equal(stored.answer, maximum.answer);
    }
  } finally {
    await app.close();
  }
});
