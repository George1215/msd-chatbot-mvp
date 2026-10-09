import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { reset, read, mutate } from "../src/store.js";

test("password changes revoke every old HTTP session and preserve unrelated users", async () => {
  reset();
  const app = buildServer();
  const call = async (method, url, payload, token) => {
    const r = await app.inject({
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: r.statusCode, data: r.json() };
  };
  try {
    const admin = (
      await call("POST", "/api/auth/bootstrap-admin", {
        name: "Admin",
        email: "admin@password.test",
        password: "OriginalAdmin123",
      })
    ).data;
    await call(
      "POST",
      "/api/admin/agents",
      {
        name: "Agent",
        email: "agent@password.test",
        password: "OriginalAgent123",
      },
      admin.token,
    );
    const agent = (
      await call("POST", "/api/auth/login", {
        email: "agent@password.test",
        password: "OriginalAgent123",
      })
    ).data;
    const reg = (
      await call("POST", "/api/sites/register", {
        name: "Private site",
        url: "https://private.test",
      })
    ).data;
    assert.equal(
      (
        await call(
          "POST",
          "/api/auth/change-password",
          { currentPassword: "wrong", newPassword: "ReplacementAdmin123" },
          admin.token,
        )
      ).status,
      401,
    );
    assert.equal(
      (await call("GET", "/api/admin/sites", undefined, admin.token)).status,
      200,
    );
    assert.equal(
      (
        await call(
          "POST",
          "/api/auth/change-password",
          {
            currentPassword: "OriginalAdmin123",
            newPassword: "ReplacementAdmin123",
          },
          admin.token,
        )
      ).status,
      200,
    );
    for (const route of [
      "/api/admin/sites",
      "/api/admin/audit",
      "/api/agents",
      "/api/agent/conversations",
    ])
      assert.equal(
        (await call("GET", route, undefined, admin.token)).status,
        401,
      );
    assert.equal(
      (
        await call(
          "GET",
          `/api/sites/${reg.siteKey}/faqs`,
          undefined,
          admin.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call("GET", "/api/agents", undefined, agent.token)).status,
      200,
    );
    assert.equal(
      (
        await call("POST", "/api/auth/login", {
          email: "admin@password.test",
          password: "OriginalAdmin123",
        })
      ).status,
      401,
    );
    const fresh = (
      await call("POST", "/api/auth/login", {
        email: "admin@password.test",
        password: "ReplacementAdmin123",
      })
    ).data;
    assert.equal(
      (await call("GET", "/api/admin/sites", undefined, fresh.token)).status,
      200,
    );
    assert.equal(
      (
        await call(
          "POST",
          "/api/auth/change-password",
          {
            currentPassword: "ReplacementAdmin123",
            newPassword: "é".repeat(37),
          },
          fresh.token,
        )
      ).status,
      400,
    );
  } finally {
    await app.close();
  }
});

test("agent reset codes require reauthentication, expire, supersede older codes and are single-use under concurrency", async () => {
  reset();
  const app = buildServer();
  const call = async (method, url, payload, token) => {
    const r = await app.inject({
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: r.statusCode, data: r.json() };
  };
  try {
    const admin = (
      await call("POST", "/api/auth/bootstrap-admin", {
        name: "Admin",
        email: "admin@reset.test",
        password: "OriginalAdmin123",
      })
    ).data;
    const user = (
      await call(
        "POST",
        "/api/admin/agents",
        {
          name: "Agent",
          email: "agent@reset.test",
          password: "OriginalAgent123",
        },
        admin.token,
      )
    ).data;
    const agent = (
      await call("POST", "/api/auth/login", {
        email: user.email,
        password: "OriginalAgent123",
      })
    ).data;
    const url = `/api/admin/agents/${user.id}/password-reset`,
      request = {
        currentPassword: "OriginalAdmin123",
        reason: "Verified agent lost password",
      };
    assert.equal((await call("POST", url, request, agent.token)).status, 403);
    assert.equal(
      (
        await call(
          "POST",
          url,
          { ...request, currentPassword: "wrong" },
          admin.token,
        )
      ).status,
      401,
    );
    const old = (await call("POST", url, request, admin.token)).data;
    const current = (await call("POST", url, request, admin.token)).data;
    const payload = {
      email: user.email,
      resetToken: old.resetToken,
      newPassword: "ReplacementAgent123",
    };
    assert.equal(
      (await call("POST", "/api/auth/reset-password", payload)).status,
      401,
    );
    const stored = read().users.find((u) => u.id === user.id).passwordReset;
    for (const value of [
      (await call("GET", "/api/agents", undefined, admin.token)).data,
      (await call("GET", "/api/admin/audit", undefined, admin.token)).data,
    ]) {
      const text = JSON.stringify(value);
      assert.equal(text.includes(current.resetToken), false);
      assert.equal(text.includes(stored.hash), false);
    }
    mutate(() => {
      stored.expiresAt = new Date(Date.now() - 1).toISOString();
    });
    assert.equal(
      (
        await call("POST", "/api/auth/reset-password", {
          ...payload,
          resetToken: current.resetToken,
        })
      ).status,
      401,
    );
    const valid = (await call("POST", url, request, admin.token)).data;
    const attempts = await Promise.all([
      call("POST", "/api/auth/reset-password", {
        ...payload,
        resetToken: valid.resetToken,
      }),
      call("POST", "/api/auth/reset-password", {
        ...payload,
        resetToken: valid.resetToken,
      }),
    ]);
    assert.deepEqual(attempts.map((a) => a.status).sort(), [200, 401]);
    assert.equal(
      (await call("GET", "/api/agents", undefined, agent.token)).status,
      401,
    );
    assert.equal(
      (
        await call("POST", "/api/auth/login", {
          email: user.email,
          password: "OriginalAgent123",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("POST", "/api/auth/login", {
          email: user.email,
          password: "ReplacementAgent123",
        })
      ).status,
      200,
    );
    assert.equal(
      read().users.find((u) => u.id === user.id).passwordReset,
      undefined,
    );
    assert.equal(
      (await call("GET", "/api/admin/sites", undefined, admin.token)).status,
      200,
    );
  } finally {
    await app.close();
  }
});
