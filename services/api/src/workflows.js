import {
  passwordSchema,
  safeStaff,
  validateStaffClaims,
} from "./staff-auth.js";
import {
  hashInstallToken,
  matchesInstallToken,
} from "./install-credentials.js";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { read, mutate, audit, id, now } from "./store.js";
import {
  ATTACHMENT_BODY_LIMIT,
  parseAttachment,
  safeMessage,
  attachmentDisposition,
} from "./attachments.js";
const fail = (message, statusCode = 403) => {
  throw Object.assign(new Error(message), { statusCode });
};
const content = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(5000),
});
const safeUser = safeStaff;
const actorFor = (actorId) => {
  const user = read().users.find((u) => u.id === actorId);
  return user
    ? { id: user.id, name: user.name, role: user.role }
    : {
        id: actorId || "visitor",
        name: actorId === "visitor" ? "Visitor" : "Support",
        role: actorId === "visitor" ? "visitor" : "staff",
      };
};
const agentName = (agentId) =>
  read().users.find((u) => u.id === agentId)?.name || null;
function updateEvents(c, changes, actor, at, eventId = id("event")) {
  const events = [];
  if (
    Object.hasOwn(changes, "assignedAgentId") &&
    changes.assignedAgentId !== c.assignedAgentId
  )
    events.push({
      id: `${eventId}:assignment`,
      type: "assignment",
      at,
      actor,
      fromAgentId: c.assignedAgentId,
      toAgentId: changes.assignedAgentId,
      fromAgentName: agentName(c.assignedAgentId),
      toAgentName: agentName(changes.assignedAgentId),
    });
  if (changes.status && changes.status !== c.status)
    events.push({
      id: `${eventId}:status`,
      type: "status",
      at,
      actor,
      fromStatus: c.status,
      toStatus: changes.status,
    });
  return events;
}
function timelineFor(c) {
  if (Array.isArray(c.timeline)) return c.timeline;
  // Legacy records have durable audit events. Replay those rather than inventing history.
  const timeline = [
    {
      id: `${c.id}:created`,
      type: "created",
      at: c.createdAt,
      actor: { id: "visitor", name: c.visitorName, role: "visitor" },
    },
  ];
  const previous = { assignedAgentId: null, status: "open" };
  for (const entry of read()
    .audit.filter(
      (a) => a.action === "conversation.update" && a.meta.id === c.id,
    )
    .toReversed()
    .sort((a, b) => a.at.localeCompare(b.at))) {
    timeline.push(
      ...updateEvents(
        previous,
        entry.meta,
        actorFor(entry.actor),
        entry.at,
        entry.id,
      ),
    );
    Object.assign(previous, entry.meta);
  }
  return timeline;
}
export function conversationView(c) {
  const { visitorToken, requestKey, ...rest } = c;
  const timeline = timelineFor(c);
  return {
    ...rest,
    timeline,
    transferHistory: timeline.filter((e) => e.type === "assignment"),
    messages: read()
      .messages.filter((m) => m.conversationId === c.id)
      .map(safeMessage),
  };
}
export function registerWorkflows(app, io) {
  const staff = async (req) => {
    await app.auth(req);
    if (!["agent", "central_admin"].includes(req.user.role)) fail("forbidden");
  };
  const admin = async (req) => {
    await staff(req);
    if (req.user.role !== "central_admin") fail("forbidden");
  };
  const siteFor = (req) =>
    read().sites.find((s) => s.siteKey === req.params.siteKey) ||
    fail("site_not_found", 404);
  const local = (req) => {
    const s = siteFor(req);
    if (!matchesInstallToken(s, req.headers["x-install-token"]))
      fail("invalid_install_token", 401);
    return s;
  };
  const changed = (s) => io.to(`site:${s.siteKey}`).emit("faq:changed");
  app.get("/api/sites/:siteKey/setup", async (req) => {
    const { installTokenHash, ...s } = local(req);
    return {
      ...s,
      faqs: read().faqs.filter((f) => f.siteId === s.id && !f.deletedAt),
    };
  });
  app.patch("/api/sites/:siteKey/settings", async (req) => {
    const s = local(req);
    const body = z
      .object({ title: z.string().trim().min(1).max(80) })
      .parse(req.body);
    mutate(() => {
      s.widget.title = body.title;
      s.updatedAt = now();
    });
    audit("local_admin", "site.settings", { siteId: s.id });
    changed(s);
    return { ok: true };
  });
  for (const method of ["PUT", "DELETE"])
    app.route({
      method,
      url: "/api/sites/:siteKey/faqs/:id",
      handler: async (req) => {
        const s = local(req),
          f = read().faqs.find(
            (f) => f.id === req.params.id && f.siteId === s.id && !f.deletedAt,
          );
        if (!f) fail("faq_not_found", 404);
        if (f.source === "central" || req.body?.version !== f.version)
          fail("central_override_or_version_conflict", 409);
        const body = method === "PUT" ? content.parse(req.body) : {};
        mutate(() =>
          Object.assign(f, body, {
            version: f.version + 1,
            updatedAt: now(),
            ...(method === "DELETE" ? { deletedAt: now() } : {}),
          }),
        );
        audit("local_admin", `faq.${method.toLowerCase()}`, {
          siteId: s.id,
          faqId: f.id,
        });
        changed(s);
        return f;
      },
    });
  app.post(
    "/api/admin/sites/:id/install-credentials",
    { preHandler: admin },
    async (req) => {
      const site = read().sites.find((s) => s.id === req.params.id);
      if (!site) fail("site_not_found", 404);
      const { reason } = z
        .object({ reason: z.string().trim().min(3).max(1000) })
        .parse(req.body);
      const installToken = id("install");
      mutate(() => {
        site.installTokenHash = hashInstallToken(installToken);
        site.updatedAt = now();
      });
      audit(req.user.sub, "site.install_credentials.rotate", {
        siteId: site.id,
        reason,
      });
      return { siteKey: site.siteKey, installToken };
    },
  );
  app.get("/api/admin/audit", { preHandler: admin }, async () =>
    read().audit.slice(0, 300),
  );
  app.get("/api/agents", { preHandler: staff }, async () =>
    read()
      .users.filter((u) => u.role === "agent")
      .map((u) => ({
        ...safeUser(u),
        active: read().conversations.filter(
          (c) => c.assignedAgentId === u.id && c.status !== "closed",
        ).length,
        closed: read().conversations.filter(
          (c) => c.assignedAgentId === u.id && c.status === "closed",
        ).length,
      })),
  );
  app.post("/api/admin/agents", { preHandler: admin }, async (req) => {
    const b = z
      .object({
        name: z.string().trim().min(2),
        email: z.string().email(),
        password: passwordSchema,
        capacity: z.number().int().min(1).max(50).default(5),
      })
      .parse(req.body);
    if (
      read().users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())
    )
      fail("email_exists", 409);
    const passwordHash = await bcrypt.hash(b.password, 12);
    if (
      read().users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())
    )
      fail("email_exists", 409);
    const { password, ...data } = b;
    const u = {
      ...data,
      id: id("usr"),
      passwordHash,
      role: "agent",
      available: true,
      createdAt: now(),
    };
    mutate((d) => d.users.push(u));
    audit(req.user.sub, "agent.create", { userId: u.id });
    return safeUser(u);
  });
  app.patch("/api/agent/availability", { preHandler: staff }, async (req) => {
    const b = z.object({ available: z.boolean() }).parse(req.body);
    mutate((d) =>
      Object.assign(
        d.users.find((u) => u.id === req.user.sub),
        b,
      ),
    );
    audit(req.user.sub, "agent.availability", b);
    return { ok: true };
  });
  const view = conversationView;
  const access = async (req) => {
    const c = read().conversations.find((c) => c.id === req.params.id);
    if (!c) fail("not_found", 404);
    if (req.headers["x-visitor-token"] === c.visitorToken)
      return { c, who: "visitor" };
    await staff(req);
    return { c, who: "agent" };
  };
  app.post("/api/conversations", async (req) => {
    const b = z
      .object({
        siteKey: z.string(),
        visitorName: z.string().trim().max(100).default("Visitor"),
        text: z.string().trim().min(1).max(5000),
        requestKey: z.string().min(20).max(100),
      })
      .parse(req.body);
    const site = read().sites.find(
      (s) => s.siteKey === b.siteKey && s.status === "approved",
    );
    if (!site) fail("site_not_live");
    let c = read().conversations.find(
      (c) => c.siteId === site.id && c.requestKey === b.requestKey,
    );
    if (!c) {
      c = {
        id: id("conv"),
        siteId: site.id,
        visitorName: b.visitorName,
        identity: "unknown",
        status: "open",
        assignedAgentId: null,
        visitorToken: id("visitor"),
        requestKey: b.requestKey,
        createdAt: now(),
        updatedAt: now(),
      };
      c.timeline = [
        {
          id: `${c.id}:created`,
          type: "created",
          at: c.createdAt,
          actor: { id: "visitor", name: c.visitorName, role: "visitor" },
        },
      ];
      mutate((d) => {
        d.conversations.push(c);
        d.messages.push({
          id: id("msg"),
          conversationId: c.id,
          sender: "visitor",
          text: b.text,
          createdAt: now(),
        });
      });
      io.to("agents").emit("conversation:new", view(c));
    }
    return { conversationId: c.id, visitorToken: c.visitorToken };
  });
  app.get("/api/conversations/:id", async (req) => view((await access(req)).c));
  const requireWritable = (req, c, who) => {
    if (read().sites.find((s) => s.id === c.siteId)?.status !== "approved")
      fail("site_not_live");
    if (c.status === "closed") fail("conversation_closed", 409);
    if (
      who === "agent" &&
      req.user.role !== "central_admin" &&
      c.assignedAgentId !== req.user.sub
    )
      fail("claim_conversation_first", 409);
  };
  app.post("/api/conversations/:id/messages", async (req) => {
    const { c, who } = await access(req);
    const b = z
      .object({
        text: z.string().trim().min(1).max(5000),
        requestKey: z.string().min(20).max(100),
      })
      .parse(req.body);
    requireWritable(req, c, who);
    let m = read().messages.find(
      (m) => m.conversationId === c.id && m.requestKey === b.requestKey,
    );
    if (
      m &&
      (m.attachment ||
        m.sender !== who ||
        m.senderId !== (who === "agent" ? req.user.sub : null) ||
        m.text !== b.text)
    )
      fail("request_key_conflict", 409);
    if (!m) {
      m = {
        id: id("msg"),
        conversationId: c.id,
        sender: who,
        senderId: who === "agent" ? req.user.sub : null,
        text: b.text,
        requestKey: b.requestKey,
        createdAt: now(),
      };
      mutate((d) => {
        d.messages.push(m);
        c.updatedAt = now();
      });
      io.to(`conversation:${c.id}`).emit("message:new", safeMessage(m));
      io.to("agents").emit("conversation:changed", { id: c.id });
    }
    return safeMessage(m);
  });
  app.post(
    "/api/conversations/:id/attachments",
    { bodyLimit: ATTACHMENT_BODY_LIMIT },
    async (req) => {
      const { c, who } = await access(req);
      requireWritable(req, c, who);
      const b = parseAttachment(req.body);
      const senderId = who === "agent" ? req.user.sub : null;
      let message = read().messages.find(
        (m) => m.conversationId === c.id && m.requestKey === b.requestKey,
      );
      if (message) {
        if (
          !message.attachment ||
          message.sender !== who ||
          message.senderId !== senderId ||
          message.text !== b.text ||
          message.attachment.name !== b.name ||
          message.attachment.mime !== b.mime ||
          message.attachmentData !== b.data
        )
          fail("request_key_conflict", 409);
        return safeMessage(message);
      }
      message = {
        id: id("msg"),
        conversationId: c.id,
        sender: who,
        senderId,
        text: b.text,
        requestKey: b.requestKey,
        createdAt: now(),
        attachment: {
          id: id("attachment"),
          name: b.name,
          mime: b.mime,
          size: b.size,
        },
        attachmentData: b.data,
      };
      mutate((d) => {
        d.messages.push(message);
        c.updatedAt = message.createdAt;
      });
      io.to(`conversation:${c.id}`).emit("message:new", safeMessage(message));
      io.to("agents").emit("conversation:changed", { id: c.id });
      return safeMessage(message);
    },
  );
  app.get(
    "/api/conversations/:id/attachments/:attachmentId",
    async (req, reply) => {
      const { c } = await access(req);
      const message = read().messages.find(
        (m) =>
          m.conversationId === c.id &&
          m.attachment?.id === req.params.attachmentId,
      );
      if (!message?.attachmentData) fail("attachment_not_found", 404);
      return reply
        .type("application/octet-stream")
        .header(
          "Content-Disposition",
          attachmentDisposition(message.attachment.name),
        )
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "sandbox; default-src 'none'")
        .header("Cache-Control", "private, no-store")
        .send(Buffer.from(message.attachmentData, "base64"));
    },
  );
  app.patch("/api/conversations/:id", { preHandler: staff }, async (req) => {
    const c = read().conversations.find((c) => c.id === req.params.id);
    if (!c) fail("not_found", 404);
    const b = z
      .object({
        status: z.enum(["open", "pending", "closed"]).optional(),
        assignedAgentId: z.string().nullable().optional(),
      })
      .parse(req.body);
    if (
      req.user.role !== "central_admin" &&
      c.assignedAgentId &&
      c.assignedAgentId !== req.user.sub
    )
      fail("assigned_to_another_agent", 409);
    if (
      req.user.role !== "central_admin" &&
      !c.assignedAgentId &&
      b.assignedAgentId !== req.user.sub
    )
      fail("claim_conversation_first", 409);
    const target = b.assignedAgentId ?? c.assignedAgentId;
    if (target && (b.status || c.status) !== "closed") {
      const u = read().users.find((u) => u.id === target && u.role === "agent");
      if (!u) fail("invalid_agent", 400);
      if (
        !u.available ||
        read().conversations.filter(
          (x) =>
            x.id !== c.id &&
            x.assignedAgentId === u.id &&
            x.status !== "closed",
        ).length >= u.capacity
      )
        fail("agent_at_capacity", 409);
    }
    const at = now();
    const timeline = [
      ...timelineFor(c),
      ...updateEvents(c, b, actorFor(req.user.sub), at),
    ];
    mutate(() => Object.assign(c, b, { updatedAt: at, timeline }));
    audit(req.user.sub, "conversation.update", { id: c.id, ...b });
    io.to("agents").emit("conversation:changed", { id: c.id });
    io.to(`conversation:${c.id}`).emit("conversation:changed", { id: c.id });
    return view(c);
  });
  io.use((socket, next) => {
    try {
      const a = socket.handshake.auth || {};
      if (a.token) {
        const u = app.jwt.verify(a.token);
        validateStaffClaims(u);
        socket.data.user = u;
      } else if (a.conversationId) {
        const c = read().conversations.find(
          (c) => c.id === a.conversationId && c.visitorToken === a.visitorToken,
        );
        if (!c) throw Error();
        socket.data.conversationId = c.id;
      } else if (!read().sites.some((s) => s.siteKey === a.siteKey))
        throw Error();
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    const a = socket.handshake.auth || {};
    if (socket.data.user) {
      const claims = socket.data.user;
      try {
        validateStaffClaims(claims);
      } catch {
        socket.disconnect(true);
        return;
      }
      socket.join("agents");
      socket.join(`staff:${claims.sub}`);
      const timer = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, claims.exp * 1000 - Date.now()),
      );
      timer.unref();
      socket.on("disconnect", () => clearTimeout(timer));
    }
    if (a.siteKey) socket.join(`site:${a.siteKey}`);
    if (socket.data.conversationId)
      socket.join(`conversation:${socket.data.conversationId}`);
    socket.on("conversation:join", (cid) => {
      if (socket.data.user) {
        try {
          validateStaffClaims(socket.data.user);
        } catch {
          socket.disconnect(true);
          return;
        }
      }
      if (socket.data.user || socket.data.conversationId === cid)
        socket.join(`conversation:${cid}`);
    });
  });
}
