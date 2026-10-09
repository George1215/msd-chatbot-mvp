import { read, mutate, id, now, storageHealth } from "./store.js";

export function applyRetention(
  { conversationDays, auditDays },
  time = Date.now(),
) {
  for (const days of [conversationDays, auditDays])
    if (!Number.isInteger(days) || days < 1)
      throw Error("Retention days must be positive integers");
  const expired = new Set(
    read()
      .conversations.filter(
        (c) =>
          c.status === "closed" &&
          Date.parse(c.updatedAt) < time - conversationDays * 86400000,
      )
      .map((c) => c.id),
  );
  const summary = { conversations: expired.size, messages: 0, audit: 0 };
  mutate((db) => {
    db.conversations = db.conversations.filter((c) => !expired.has(c.id));
    const messages = db.messages.length,
      audit = db.audit.length;
    db.messages = db.messages.filter((m) => !expired.has(m.conversationId));
    db.audit = db.audit.filter(
      (a) => Date.parse(a.at) >= time - auditDays * 86400000,
    );
    summary.messages = messages - db.messages.length;
    summary.audit = audit - db.audit.length;
    if (Object.values(summary).some(Boolean))
      db.audit.unshift({
        id: id("audit"),
        actor: "system",
        action: "retention.cleanup",
        meta: summary,
        at: new Date(time).toISOString(),
      });
  });
  return summary;
}

export function registerOperations(app) {
  const started = Date.now();
  const metrics = { requests: 0, errors: 0, durationMs: 0 };
  app.addHook("onResponse", async (req, reply) => {
    metrics.requests++;
    if (reply.statusCode >= 500) metrics.errors++;
    metrics.durationMs += reply.elapsedTime;
  });
  app.get("/ready", async (req, reply) => {
    try {
      if (!storageHealth()) throw Error("storage_unavailable");
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  app.get(
    "/api/admin/operations",
    { preHandler: app.auth },
    async (req, reply) => {
      if (req.user.role !== "central_admin")
        return reply.code(403).send({ error: "forbidden" });
      return {
        uptimeSeconds: Math.floor((Date.now() - started) / 1000),
        requests: metrics.requests,
        serverErrors: metrics.errors,
        meanResponseMs: metrics.requests
          ? Math.round(metrics.durationMs / metrics.requests)
          : 0,
        storageHealthy: storageHealth(),
        counts: Object.fromEntries(
          Object.entries(read()).map(([k, v]) => [k, v.length]),
        ),
        time: now(),
      };
    },
  );
  app.get(
    "/api/admin/reports",
    { preHandler: app.auth },
    async (req, reply) => {
      if (req.user.role !== "central_admin")
        return reply.code(403).send({ error: "forbidden" });
      const requested = Number(req.query.days || 30);
      if (!Number.isInteger(requested) || requested < 1 || requested > 365)
        return reply.code(400).send({ error: "invalid_period" });
      const since = Date.now() - requested * 86400000;
      const conversations = read().conversations.filter(
        (c) => Date.parse(c.createdAt) >= since,
      );
      return {
        days: requested,
        since: new Date(since).toISOString(),
        totals: {
          conversations: conversations.length,
          open: conversations.filter((c) => c.status === "open").length,
          pending: conversations.filter((c) => c.status === "pending").length,
          closed: conversations.filter((c) => c.status === "closed").length,
        },
        sites: read().sites.map((s) => ({
          id: s.id,
          name: s.name,
          conversations: conversations.filter((c) => c.siteId === s.id).length,
        })),
        agents: read()
          .users.filter((u) => u.role === "agent")
          .map((u) => ({
            id: u.id,
            name: u.name,
            assigned: conversations.filter((c) => c.assignedAgentId === u.id)
              .length,
            closed: conversations.filter(
              (c) => c.assignedAgentId === u.id && c.status === "closed",
            ).length,
          })),
      };
    },
  );
  const conversationDays = Number(
    process.env.RETENTION_CONVERSATION_DAYS || 90,
  );
  const auditDays = Number(process.env.RETENTION_AUDIT_DAYS || 365);
  for (const days of [conversationDays, auditDays])
    if (!Number.isInteger(days) || days < 1)
      throw Error("Invalid retention configuration");
  if (process.env.NODE_ENV === "production") {
    const sweep = () => {
      try {
        const result = applyRetention({ conversationDays, auditDays });
        app.log.info({ retention: result }, "Retention completed");
      } catch (err) {
        app.log.error({ err }, "Retention failed");
      }
    };
    app.addHook("onReady", async () => sweep());
    const timer = setInterval(sweep, 24 * 3600000);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  }
}
