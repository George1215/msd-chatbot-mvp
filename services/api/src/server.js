import { registerOperations } from "./operations.js";
import {
  passwordSchema,
  staffClaims,
  validateStaffClaims,
  registerStaffRecovery,
} from "./staff-auth.js";
import {
  hashInstallToken,
  matchesInstallToken,
} from "./install-credentials.js";
import crypto from "node:crypto";
import { registerWorkflows, conversationView } from "./workflows.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { id, now, read, mutate, audit } from "./store.js";

export function buildServer() {
  const app = Fastify({
    logger:
      process.env.NODE_ENV !== "test"
        ? {
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.headers.x-install-token",
              "req.headers.x-bootstrap-secret",
            ],
          }
        : false,
    trustProxy: process.env.TRUST_PROXY === "loopback" ? "loopback" : false,
    bodyLimit: 32768,
  });
  const origins = (
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:4301,http://localhost:4302,http://localhost:4303"
  ).split(",");
  const allowed = (origin) =>
    !origin ||
    origins.includes(origin) ||
    read().sites.some(
      (s) => s.status === "approved" && new URL(s.url).origin === origin,
    );
  app.setErrorHandler((err, req, reply) =>
    reply.code(err instanceof z.ZodError ? 400 : err.statusCode || 500).send({
      error:
        err instanceof z.ZodError
          ? "invalid_input"
          : err.statusCode
            ? err.message
            : "internal_error",
    }),
  );
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.ALLOWED_ORIGINS ||
      origins.some((origin) => new URL(origin).protocol !== "https:"))
  )
    throw Error("Production requires explicit HTTPS ALLOWED_ORIGINS");
  const limits = new Map();
  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "GET" || req.method === "OPTIONS") return;
    const key =
      req.ip + (req.url.startsWith("/api/auth/") ? ":auth" : ":writes");
    const t = Date.now();
    if (limits.size > 10000)
      for (const [k, v] of limits) if (t - v.at > 60000) limits.delete(k);
    const item = limits.get(key);
    if (!item || t - item.at > 60000) limits.set(key, { at: t, count: 1 });
    else if (
      ++item.count >
      (process.env.NODE_ENV === "production" && req.url.startsWith("/api/auth/")
        ? 10
        : 60)
    )
      return reply.code(429).send({ error: "rate_limited" });
  });
  app.register(cors, {
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: (origin, cb) => cb(null, allowed(origin)),
  });
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.JWT_SECRET || "").length < 32
  )
    throw new Error("JWT_SECRET must contain at least 32 characters");
  app.register(jwt, {
    secret: process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex"),
    sign: { expiresIn: "8h" },
  });
  app.addHook("onSend", async (req, reply, payload) => {
    if (!reply.hasHeader("Cache-Control"))
      reply.header("Cache-Control", "no-store");
    return payload;
  });
  app.decorate("auth", async (req) => {
    await req.jwtVerify();
    validateStaffClaims(req.user);
  });
  const io = new SocketIOServer(app.server, {
    cors: { origin: (origin, cb) => cb(null, allowed(origin)) },
  });
  app.decorate("io", io);

  app.get("/health", async () => ({
    ok: true,
    service: "chat-msd-api",
    time: now(),
  }));

  app.post("/api/auth/bootstrap-admin", async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: passwordSchema,
        name: z.string().min(2),
      })
      .parse(req.body);
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.BOOTSTRAP_SECRET ||
        req.headers["x-bootstrap-secret"] !== process.env.BOOTSTRAP_SECRET)
    )
      return reply.code(403).send({ error: "forbidden" });
    if (read().users.some((u) => u.role === "central_admin"))
      return reply.code(409).send({ error: "central_admin_exists" });
    const user = {
      id: id("usr"),
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
      role: "central_admin",
      createdAt: now(),
    };
    if (read().users.some((u) => u.role === "central_admin"))
      return reply.code(409).send({ error: "central_admin_exists" });
    mutate((d) => d.users.push(user));
    audit(user.id, "admin.bootstrap");
    return {
      token: app.jwt.sign(staffClaims(user)),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string() })
      .parse(req.body);
    const user = read().users.find(
      (u) => u.email.toLowerCase() === body.email.toLowerCase(),
    );
    const originalHash = user?.passwordHash;
    if (
      !user ||
      !(await bcrypt.compare(body.password, originalHash)) ||
      read().users.find((u) => u.id === user.id)?.passwordHash !== originalHash
    )
      return reply.code(401).send({ error: "invalid_credentials" });
    return {
      token: app.jwt.sign(staffClaims(user)),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  });

  app.post("/api/sites/register", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        url: z
          .string()
          .url()
          .refine((v) => ["http:", "https:"].includes(new URL(v).protocol))
          .transform((v) => new URL(v).origin),
        platform: z.string().default("generic"),
        adminEmail: z.string().email().optional(),
        registrationToken: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .optional(),
      })
      .parse(req.body);

    const existing = read().sites.find((s) => s.url === body.url);
    if (existing) {
      if (
        body.registrationToken &&
        matchesInstallToken(existing, body.registrationToken)
      )
        return { siteKey: existing.siteKey, status: existing.status };
      return reply.code(409).send({ error: "site_already_registered" });
    }

    const installToken = body.registrationToken || id("install");
    const site = {
      id: id("site"),
      siteKey: id("key"),
      installTokenHash: hashInstallToken(installToken),
      name: body.name,
      url: body.url,
      platform: body.platform,
      adminEmail: body.adminEmail || null,
      status: "pending",
      declineReason: null,
      suspendedReason: null,
      widget: { enabled: false, title: "Support", accent: "#0a63ff" },
      createdAt: now(),
      updatedAt: now(),
    };
    mutate((d) => d.sites.push(site));
    audit("plugin", "site.register", { siteId: site.id, url: site.url });
    return reply.code(201).send({
      siteKey: site.siteKey,
      installToken,
      status: site.status,
    });
  });

  app.get("/api/sites/:siteKey/bootstrap", async (req, reply) => {
    const site = read().sites.find((s) => s.siteKey === req.params.siteKey);
    if (!site) return reply.code(404).send({ error: "site_not_found" });
    const faqs = read()
      .faqs.filter((f) => f.siteId === site.id && !f.deletedAt)
      .map(({ id, question, answer, updatedAt, version, source }) => ({
        id,
        question,
        answer,
        updatedAt,
        version,
        source,
      }));

    return {
      site: {
        siteKey: site.siteKey,
        name: site.name,
        status: site.status,
        widget: { ...site.widget, enabled: site.status === "approved" },
      },
      faqs: site.status === "approved" ? faqs : [],
      serverTime: now(),
    };
  });

  app.get(
    "/api/admin/sites",
    { preHandler: [app.auth] },
    async (req, reply) => {
      if (req.user.role !== "central_admin")
        return reply.code(403).send({ error: "forbidden" });
      return read().sites.map(({ installTokenHash, ...s }) => ({
        ...s,
        faqCount: read().faqs.filter((f) => f.siteId === s.id && !f.deletedAt)
          .length,
      }));
    },
  );

  app.patch(
    "/api/admin/sites/:id/status",
    { preHandler: [app.auth] },
    async (req, reply) => {
      if (req.user.role !== "central_admin")
        return reply.code(403).send({ error: "forbidden" });
      const body = z
        .object({
          status: z.enum(["approved", "declined", "suspended"]),
          reason: z.string().optional(),
        })
        .parse(req.body);

      if (
        (body.status === "declined" || body.status === "suspended") &&
        !body.reason?.trim()
      ) {
        return reply.code(400).send({ error: "reason_required" });
      }

      const site = read().sites.find((s) => s.id === req.params.id);
      if (!site) return reply.code(404).send({ error: "site_not_found" });

      mutate((d) => {
        const s = d.sites.find((x) => x.id === site.id);
        const transitions = {
          pending: ["approved", "declined"],
          approved: ["suspended"],
          declined: ["approved"],
          suspended: ["approved"],
        };
        if (!transitions[s.status]?.includes(body.status))
          throw Object.assign(new Error("invalid_transition"), {
            statusCode: 409,
          });
        s.status = body.status;
        s.updatedAt = now();
        s.declineReason = body.status === "declined" ? body.reason : null;
        s.suspendedReason = body.status === "suspended" ? body.reason : null;
        s.widget.enabled = body.status === "approved";
      });

      audit(req.user.sub, "site.status", {
        siteId: site.id,
        status: body.status,
        reason: body.reason || null,
      });
      app.io
        .to(`site:${site.siteKey}`)
        .emit("site:status", { status: body.status });
      return { ok: true, status: body.status };
    },
  );

  app.post("/api/sites/:siteKey/resubmit", async (req, reply) => {
    const site = read().sites.find((s) => s.siteKey === req.params.siteKey);
    if (!site) return reply.code(404).send({ error: "site_not_found" });
    const body = z.object({ installToken: z.string() }).parse(req.body);
    if (!matchesInstallToken(site, body.installToken))
      return reply.code(401).send({ error: "invalid_install_token" });
    if (site.status !== "declined")
      return reply.code(409).send({ error: "not_declined" });
    mutate((d) => {
      const s = d.sites.find((x) => x.id === site.id);
      s.status = "pending";
      s.declineReason = null;
      s.updatedAt = now();
    });
    audit("local_admin", "site.resubmit", { siteId: site.id });
    return { ok: true, status: "pending" };
  });

  app.get("/api/sites/:siteKey/faqs", async (req, reply) => {
    const site = read().sites.find((s) => s.siteKey === req.params.siteKey);
    if (!site) return reply.code(404).send({ error: "site_not_found" });
    if (
      site.status !== "approved" &&
      !matchesInstallToken(site, req.headers["x-install-token"])
    ) {
      try {
        await app.auth(req);
        if (req.user.role !== "central_admin") throw new Error();
      } catch {
        return reply.code(403).send({ error: "forbidden" });
      }
    }
    return read().faqs.filter((f) => f.siteId === site.id && !f.deletedAt);
  });

  app.post("/api/sites/:siteKey/faqs", async (req, reply) => {
    const site = read().sites.find((s) => s.siteKey === req.params.siteKey);
    if (!site) return reply.code(404).send({ error: "site_not_found" });
    const body = z
      .object({
        installToken: z.string(),
        question: z.string().trim().min(3).max(300),
        answer: z.string().trim().min(1).max(5000),
      })
      .parse(req.body);

    if (!matchesInstallToken(site, body.installToken))
      return reply.code(401).send({ error: "invalid_install_token" });

    const faq = {
      id: id("faq"),
      siteId: site.id,
      question: body.question,
      answer: body.answer,
      source: "local",
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    mutate((d) => d.faqs.push(faq));
    audit("local_admin", "faq.create", { siteId: site.id, faqId: faq.id });
    app.io.to(`site:${site.siteKey}`).emit("faq:changed");
    return reply.code(201).send(faq);
  });

  app.put(
    "/api/admin/faqs/:id",
    { preHandler: [app.auth] },
    async (req, reply) => {
      if (req.user.role !== "central_admin")
        return reply.code(403).send({ error: "forbidden" });
      const body = z
        .object({
          question: z.string().trim().min(3).max(300),
          answer: z.string().trim().min(1).max(5000),
        })
        .parse(req.body);
      const faq = read().faqs.find(
        (f) => f.id === req.params.id && !f.deletedAt,
      );
      if (!faq) return reply.code(404).send({ error: "faq_not_found" });

      mutate((d) => {
        const f = d.faqs.find((x) => x.id === faq.id);
        f.question = body.question;
        f.answer = body.answer;
        f.source = "central";
        f.version += 1;
        f.updatedAt = now();
      });

      const site = read().sites.find((s) => s.id === faq.siteId);
      audit(req.user.sub, "faq.override", {
        faqId: faq.id,
        siteId: faq.siteId,
      });
      if (site) app.io.to(`site:${site.siteKey}`).emit("faq:changed");
      return { ok: true };
    },
  );

  app.delete(
    "/api/admin/faqs/:id",
    { preHandler: [app.auth] },
    async (req, reply) => {
      if (req.user.role !== "central_admin")
        return reply.code(403).send({ error: "forbidden" });
      const faq = read().faqs.find(
        (f) => f.id === req.params.id && !f.deletedAt,
      );
      if (!faq) return reply.code(404).send({ error: "faq_not_found" });
      mutate((d) => {
        const f = d.faqs.find((x) => x.id === faq.id);
        f.deletedAt = now();
        f.updatedAt = now();
      });
      audit(req.user.sub, "faq.delete", { faqId: faq.id, siteId: faq.siteId });
      const site = read().sites.find((s) => s.id === faq.siteId);
      if (site) io.to(`site:${site.siteKey}`).emit("faq:changed");
      return { ok: true };
    },
  );

  app.post(
    "/api/admin/faqs/broadcast",
    { preHandler: [app.auth] },
    async (req, reply) => {
      if (req.user.role !== "central_admin")
        return reply.code(403).send({ error: "forbidden" });
      const body = z
        .object({
          question: z.string().trim().min(3).max(300),
          answer: z.string().trim().min(1).max(5000),
          siteIds: z.array(z.string()).min(1).optional(),
        })
        .parse(req.body);

      const targets = body.siteIds?.length
        ? read().sites.filter((s) => body.siteIds.includes(s.id))
        : read().sites;

      if (body.siteIds && targets.length !== new Set(body.siteIds).size)
        return reply.code(400).send({ error: "unknown_site" });
      const created = [];
      mutate((d) => {
        for (const site of targets) {
          const faq = {
            id: id("faq"),
            siteId: site.id,
            question: body.question,
            answer: body.answer,
            source: "central",
            version: 1,
            createdAt: now(),
            updatedAt: now(),
            deletedAt: null,
          };
          d.faqs.push(faq);
          created.push(faq);
        }
      });
      audit(req.user.sub, "faq.broadcast", {
        siteIds: targets.map((s) => s.id),
        count: created.length,
      });
      for (const site of targets)
        io.to(`site:${site.siteKey}`).emit("faq:changed");
      return { ok: true, count: created.length };
    },
  );

  app.get(
    "/api/agent/conversations",
    { preHandler: [app.auth] },
    async (req, reply) => {
      if (!["agent", "central_admin"].includes(req.user.role))
        return reply.code(403).send({ error: "forbidden" });
      return read().conversations.map((c) => ({
        ...conversationView(c),
        site: (() => {
          const s = read().sites.find((s) => s.id === c.siteId);
          return {
            id: s.id,
            siteKey: s.siteKey,
            name: s.name,
            status: s.status,
          };
        })(),
      }));
    },
  );

  registerOperations(app);
  registerStaffRecovery(app, io);
  registerWorkflows(app, io);
  app.addHook("onClose", async () => {
    io.disconnectSockets();
    io.close();
  });
  return app;
}
