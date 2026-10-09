import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { reset } from "../src/store.js";
test("complete governance, isolation, assignment and conversation lifecycle", async () => {
  reset();
  const app = buildServer();
  const call = async (method, url, payload, token, headers = {}) => {
    const r = await app.inject({
      method,
      url,
      payload,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
    return { status: r.statusCode, data: r.json() };
  };
  try {
    const admin = (
      await call("POST", "/api/auth/bootstrap-admin", {
        name: "Admin",
        email: "owner@test.local",
        password: "testpassword123",
      })
    ).data;
    const reg = (
      await call("POST", "/api/sites/register", {
        name: "Demo",
        url: "https://demo.test",
      })
    ).data;
    assert.equal(
      (
        await call("POST", "/api/sites/register", {
          name: "Demo",
          url: "https://demo.test",
        })
      ).status,
      409,
    );
    assert.equal(
      (await call("GET", `/api/sites/${reg.siteKey}/setup`)).status,
      401,
    );
    const f = (
      await call("POST", `/api/sites/${reg.siteKey}/faqs`, {
        installToken: reg.installToken,
        question: "Delivery?",
        answer: "Local answer",
      })
    ).data;
    assert.deepEqual(
      (await call("GET", `/api/sites/${reg.siteKey}/bootstrap`)).data.faqs,
      [],
    );
    const site = (await call("GET", "/api/admin/sites", undefined, admin.token))
      .data[0];
    assert.equal(site.installToken, undefined);
    assert.equal(
      (
        await call(
          "PATCH",
          `/api/admin/sites/${site.id}/status`,
          { status: "suspended", reason: "test" },
          admin.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "PATCH",
          `/api/admin/sites/${site.id}/status`,
          { status: "declined" },
          admin.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "PATCH",
          `/api/admin/sites/${site.id}/status`,
          { status: "declined", reason: "Fix FAQs" },
          admin.token,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call("POST", `/api/sites/${reg.siteKey}/resubmit`, {
          installToken: reg.installToken,
        })
      ).status,
      200,
    );
    await call(
      "PUT",
      `/api/admin/faqs/${f.id}`,
      { question: "Delivery?", answer: "Central answer" },
      admin.token,
    );
    assert.equal(
      (
        await call(
          "PUT",
          `/api/sites/${reg.siteKey}/faqs/${f.id}`,
          { question: "Delivery?", answer: "Stale local", version: 1 },
          undefined,
          { "x-install-token": reg.installToken },
        )
      ).status,
      409,
    );
    await call(
      "PATCH",
      `/api/admin/sites/${site.id}/status`,
      { status: "approved" },
      admin.token,
    );
    assert.equal(
      (await call("GET", `/api/sites/${reg.siteKey}/bootstrap`)).data.faqs[0]
        .answer,
      "Central answer",
    );
    const agent = (
      await call(
        "POST",
        "/api/admin/agents",
        {
          name: "Agent",
          email: "agent@test.local",
          password: "testpassword123",
          capacity: 1,
        },
        admin.token,
      )
    ).data;
    const auth = (
      await call("POST", "/api/auth/login", {
        email: agent.email,
        password: "testpassword123",
      })
    ).data;
    assert.equal(
      (await call("GET", "/api/admin/sites", undefined, auth.token)).status,
      403,
    );
    const body = {
      siteKey: reg.siteKey,
      text: "Hello",
      requestKey: "conversation-request-12345",
    };
    const c = (await call("POST", "/api/conversations", body)).data;
    assert.deepEqual((await call("POST", "/api/conversations", body)).data, c);
    assert.equal(
      (await call("GET", `/api/conversations/${c.conversationId}`)).status,
      401,
    );
    const vh = { "x-visitor-token": c.visitorToken };
    assert.equal(
      (
        await call(
          "GET",
          `/api/conversations/${c.conversationId}`,
          undefined,
          undefined,
          vh,
        )
      ).data.identity,
      "unknown",
    );
    assert.equal(
      (
        await call(
          "POST",
          `/api/conversations/${c.conversationId}/messages`,
          { text: "Reply", requestKey: "reply-request-123456789" },
          auth.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "PATCH",
          `/api/conversations/${c.conversationId}`,
          { assignedAgentId: agent.id },
          auth.token,
        )
      ).status,
      200,
    );
    const msg = {
      text: "How can I help?",
      requestKey: "reply-request-123456789",
    };
    const first = (
      await call(
        "POST",
        `/api/conversations/${c.conversationId}/messages`,
        msg,
        auth.token,
      )
    ).data;
    assert.deepEqual(
      (
        await call(
          "POST",
          `/api/conversations/${c.conversationId}/messages`,
          msg,
          auth.token,
        )
      ).data,
      first,
    );
    const second = (
      await call("POST", "/api/conversations", {
        ...body,
        requestKey: "another-request-123456789",
      })
    ).data;
    assert.equal(
      (
        await call(
          "PATCH",
          `/api/conversations/${second.conversationId}`,
          { assignedAgentId: agent.id },
          auth.token,
        )
      ).status,
      409,
    );
    await call(
      "PATCH",
      `/api/admin/sites/${site.id}/status`,
      { status: "suspended", reason: "Maintenance" },
      admin.token,
    );
    assert.equal(
      (
        await call(
          "POST",
          `/api/conversations/${c.conversationId}/messages`,
          { text: "Hello again", requestKey: "visitor-request-12345678" },
          undefined,
          vh,
        )
      ).status,
      403,
    );
    await call(
      "PATCH",
      `/api/admin/sites/${site.id}/status`,
      { status: "approved" },
      admin.token,
    );
    assert.equal(
      (
        await call(
          "POST",
          `/api/conversations/${c.conversationId}/messages`,
          { text: "Hello again", requestKey: "visitor-request-12345678" },
          undefined,
          vh,
        )
      ).status,
      200,
    );
    await call(
      "PATCH",
      `/api/conversations/${c.conversationId}`,
      { status: "closed" },
      auth.token,
    );
    assert.equal(
      (
        await call(
          "POST",
          `/api/conversations/${c.conversationId}/messages`,
          { text: "Closed?", requestKey: "visitor-request-99999999" },
          undefined,
          vh,
        )
      ).status,
      409,
    );
    const list = (
      await call("GET", "/api/agent/conversations", undefined, auth.token)
    ).data;
    assert.equal(list[0].visitorToken, undefined);
    assert.equal(list[0].site.installToken, undefined);
    assert.equal(
      (
        await call("POST", "/api/conversations", {
          siteKey: reg.siteKey,
          text: " ",
          requestKey: "invalid-request-12345678",
        })
      ).status,
      400,
    );
    assert.ok(
      (await call("GET", "/api/admin/audit", undefined, admin.token)).data
        .length >= 8,
    );
  } finally {
    await app.close();
  }
});
