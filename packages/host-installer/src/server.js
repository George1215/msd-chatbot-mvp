import crypto from "node:crypto";
import Fastify from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { credentialStore } from "./credentials.js";
const secret = () => crypto.randomBytes(32).toString("base64url");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};
const content = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(5000),
});

// This server can be mounted behind the host website's reverse proxy. The
// browser always talks to /host-api on its own origin; it never gets a central
// installation credential. Integrators can replace login with their host auth.
export function buildHostServer({
  siteUrl,
  apiOrigin,
  credentialFile,
  adminPasswordHash,
  transport,
  sessionMs = 8 * 60 * 60 * 1000,
}) {
  const origin = new URL(siteUrl).origin;
  const central = new URL(apiOrigin).origin;
  if (
    !/^https?:$/.test(new URL(siteUrl).protocol) ||
    !/^https?:$/.test(new URL(apiOrigin).protocol)
  )
    throw Error("HTTP(S) origins required");
  if (!/^\$2[aby]\$/.test(adminPasswordHash || ""))
    throw Error("Host administrator password hash required");
  const store = credentialStore(credentialFile);
  if (
    store.read() &&
    (store.read().siteUrl !== origin || store.read().apiOrigin !== central)
  ) {
    store.close();
    throw Error("Installation configuration does not match its saved origins");
  }
  const app = Fastify({
    bodyLimit: 16384,
    logger: false,
    trustProxy: process.env.TRUST_PROXY === "loopback" ? "loopback" : false,
  });
  const sessions = new Map(),
    attempts = new Map();
  const cookieName = origin.startsWith("https:")
    ? "__Secure-msd-host-session"
    : "msd-host-session";
  const cookie = (value, maxAge) =>
    `${cookieName}=${value}; Path=/host-api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;
  const requestCentral =
    transport ||
    (async (path, method = "GET", body, headers = {}) => {
      let response;
      try {
        response = await fetch(central + path, {
          method,
          headers: { "content-type": "application/json", ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        fail("central_unavailable", 503);
      }
      let data;
      try {
        data = await response.json();
      } catch {
        fail("central_unavailable", 502);
      }
      if (!response.ok)
        fail(
          typeof data.error === "string"
            ? data.error
            : "central_request_failed",
          response.status >= 500 ? 503 : response.status,
        );
      return data;
    });
  app.setErrorHandler((error, req, reply) =>
    reply
      .code(error instanceof z.ZodError ? 400 : error.statusCode || 500)
      .send({
        error:
          error instanceof z.ZodError
            ? "invalid_input"
            : error.statusCode
              ? error.message
              : "host_error",
      }),
  );
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    return payload;
  });
  app.addHook("onRequest", async (req) => {
    if (req.headers.host !== new URL(origin).host) fail("invalid_host", 403);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    )
      fail("invalid_origin", 403);
  });
  function session(req) {
    const raw = (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    const key = raw ? hash(raw) : "";
    const found = sessions.get(key);
    if (!found || found.expires <= Date.now()) {
      sessions.delete(key);
      fail("host_sign_in_required", 401);
    }
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== found.csrf
    )
      fail("invalid_csrf", 403);
    return { key, ...found };
  }
  function installation() {
    const saved = store.read();
    if (!saved?.siteKey) fail("not_installed", 409);
    return saved;
  }
  const local = async (path, method = "GET", body) => {
    const saved = installation();
    return requestCentral(
      `/api/sites/${encodeURIComponent(saved.siteKey)}${path}`,
      method,
      body,
      { "x-install-token": saved.installToken },
    );
  };
  app.get("/host-api/widget", async () => ({
    siteKey: store.read()?.siteKey || null,
    api: central,
  }));
  app.post("/host-api/login", async (req, reply) => {
    const { password } = z
      .object({ password: z.string().max(1024) })
      .parse(req.body);
    const current = Date.now();
    for (const [key, value] of attempts)
      if (value.until <= current) attempts.delete(key);
    const entry = attempts.get(req.ip) || { count: 0, until: current + 60000 };
    if (entry.count >= 10) fail("rate_limited", 429);
    entry.count++;
    attempts.set(req.ip, entry);
    if (!(await bcrypt.compare(password, adminPasswordHash)))
      fail("invalid_credentials", 401);
    for (const [key, value] of sessions)
      if (value.expires <= current) sessions.delete(key);
    if (sessions.size >= 100) fail("too_many_sessions", 429);
    const sid = secret(),
      csrf = secret();
    sessions.set(hash(sid), { csrf, expires: current + sessionMs });
    reply.header("Set-Cookie", cookie(sid, Math.floor(sessionMs / 1000)));
    return { csrfToken: csrf };
  });
  app.get("/host-api/session", async (req) => ({
    csrfToken: session(req).csrf,
  }));
  app.post("/host-api/logout", async (req, reply) => {
    const s = session(req);
    sessions.delete(s.key);
    reply.header("Set-Cookie", cookie("", 0));
    return { ok: true };
  });
  app.get("/host-api/setup", async (req) => {
    session(req);
    if (!store.read()?.siteKey)
      return { installed: false, retryPending: !!store.read() };
    const s = await local("/setup");
    // Explicit projection prevents future central fields exposing credentials.
    return {
      installed: true,
      siteKey: s.siteKey,
      name: s.name,
      url: s.url,
      status: s.status,
      declineReason: s.declineReason,
      suspendedReason: s.suspendedReason,
      widget: s.widget,
      faqs: s.faqs,
    };
  });
  let installing;
  app.post("/host-api/install", async (req) => {
    session(req);
    const body = z
      .object({
        name: z.string().trim().min(2).max(100),
        adminEmail: z.string().email(),
      })
      .parse(req.body);
    if (store.read()?.siteKey) return { siteKey: store.read().siteKey };
    if (!installing)
      installing = (async () => {
        const saved = store.read() || {
          siteUrl: origin,
          apiOrigin: central,
          installToken: secret(),
          registration: body,
        };
        // Persist before contacting central: retries use the same proof of ownership.
        store.write(saved);
        const reg = await requestCentral("/api/sites/register", "POST", {
          ...saved.registration,
          url: origin,
          platform: "generic-host",
          registrationToken: saved.installToken,
        });
        const siteKey = z.string().min(1).max(100).parse(reg.siteKey);
        store.write({ ...saved, siteKey, registration: undefined });
        return { siteKey: reg.siteKey, status: reg.status };
      })().finally(() => {
        installing = null;
      });
    return installing;
  });
  app.post("/host-api/reconnect", async (req) => {
    session(req);
    if (installing) fail("installation_in_progress", 409);
    const body = z
      .object({
        siteKey: z.string().min(1).max(100),
        installToken: z.string().min(20).max(128),
      })
      .parse(req.body);
    const site = await requestCentral(
      `/api/sites/${encodeURIComponent(body.siteKey)}/setup`,
      "GET",
      undefined,
      { "x-install-token": body.installToken },
    );
    if (new URL(site.url).origin !== origin) fail("wrong_website", 409);
    store.write({ ...body, siteUrl: origin, apiOrigin: central });
    return { ok: true };
  });
  app.patch("/host-api/settings", async (req) => {
    session(req);
    return local(
      "/settings",
      "PATCH",
      z.object({ title: z.string().trim().min(1).max(80) }).parse(req.body),
    );
  });
  app.post("/host-api/resubmit", async (req) => {
    session(req);
    return local("/resubmit", "POST", {
      installToken: installation().installToken,
    });
  });
  app.post("/host-api/faqs", async (req) => {
    session(req);
    return local("/faqs", "POST", {
      ...content.parse(req.body),
      installToken: installation().installToken,
    });
  });
  app.put("/host-api/faqs/:id", async (req) => {
    session(req);
    const body = content
      .extend({ version: z.number().int().positive() })
      .parse(req.body);
    return local(`/faqs/${encodeURIComponent(req.params.id)}`, "PUT", body);
  });
  app.delete("/host-api/faqs/:id", async (req) => {
    session(req);
    return local(
      `/faqs/${encodeURIComponent(req.params.id)}`,
      "DELETE",
      z.object({ version: z.number().int().positive() }).parse(req.body),
    );
  });
  app.addHook("onClose", async () => {
    sessions.clear();
    store.close();
  });
  return app;
}
