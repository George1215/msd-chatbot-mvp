import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { read, mutate, id, now } from "./store.js";

const fail = (message, statusCode = 401) => {
  throw Object.assign(new Error(message), { statusCode });
};
// bcrypt consumes at most 72 bytes, so reject passwords it would truncate.
export const passwordSchema = z
  .string()
  .min(10)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72);
export const safeStaff = ({
  passwordHash,
  passwordReset,
  authVersion,
  ...user
}) => user;
export const staffClaims = (user) => ({
  sub: user.id,
  role: user.role,
  av: user.authVersion || 0,
});
export function validateStaffClaims(claims) {
  const user = read().users.find((user) => user.id === claims.sub);
  if (
    !user ||
    !["agent", "central_admin"].includes(user.role) ||
    user.role !== claims.role ||
    (claims.av || 0) !== (user.authVersion || 0)
  )
    fail("session_revoked");
  return user;
}
const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const addAudit = (db, actor, action, meta) =>
  db.audit.unshift({ id: id("audit"), actor, action, meta, at: now() });
const revokeSockets = (io, userId) =>
  io.in(`staff:${userId}`).disconnectSockets(true);
function changePassword(user, passwordHash) {
  user.passwordHash = passwordHash;
  user.authVersion = (user.authVersion || 0) + 1;
  user.passwordChangedAt = now();
  delete user.passwordReset;
}

export function registerStaffRecovery(app, io) {
  app.post(
    "/api/auth/change-password",
    { preHandler: app.auth },
    async (req) => {
      const body = z
        .object({
          currentPassword: z.string().max(1024),
          newPassword: passwordSchema,
        })
        .parse(req.body);
      const user = validateStaffClaims(req.user);
      const originalHash = user.passwordHash;
      if (!(await bcrypt.compare(body.currentPassword, originalHash)))
        fail("invalid_current_password");
      const passwordHash = await bcrypt.hash(body.newPassword, 12);
      // Re-check after hashing: a simultaneous reset must not be overwritten.
      const current = validateStaffClaims(req.user);
      if (current.passwordHash !== originalHash) fail("session_revoked");
      mutate((db) => {
        changePassword(current, passwordHash);
        addAudit(db, current.id, "auth.password.change", {
          userId: current.id,
        });
      });
      revokeSockets(io, current.id);
      return { ok: true, signInRequired: true };
    },
  );

  app.post(
    "/api/admin/agents/:id/password-reset",
    { preHandler: app.auth },
    async (req) => {
      if (req.user.role !== "central_admin") fail("forbidden", 403);
      const body = z
        .object({
          currentPassword: z.string().max(1024),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(req.body);
      const administrator = validateStaffClaims(req.user);
      const originalHash = administrator.passwordHash;
      if (!(await bcrypt.compare(body.currentPassword, originalHash)))
        fail("invalid_current_password");
      if (validateStaffClaims(req.user).passwordHash !== originalHash)
        fail("session_revoked");
      const user = read().users.find(
        (user) => user.id === req.params.id && user.role === "agent",
      );
      if (!user) fail("agent_not_found", 404);
      const resetToken = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      mutate((db) => {
        user.passwordReset = { hash: digest(resetToken), expiresAt };
        addAudit(db, req.user.sub, "auth.password_reset.issue", {
          userId: user.id,
          reason: body.reason,
          expiresAt,
        });
      });
      return { resetToken, expiresAt, email: user.email };
    },
  );

  app.post("/api/auth/reset-password", async (req) => {
    const body = z
      .object({
        email: z.string().email(),
        resetToken: z.string().min(20).max(128),
        newPassword: passwordSchema,
      })
      .parse(req.body);
    const hash = digest(body.resetToken);
    const eligible = () =>
      read().users.find(
        (user) =>
          user.email.toLowerCase() === body.email.toLowerCase() &&
          user.passwordReset?.hash === hash &&
          Date.parse(user.passwordReset.expiresAt) > Date.now(),
      );
    if (!eligible()) fail("invalid_or_expired_reset");
    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    const user = eligible();
    if (!user) fail("invalid_or_expired_reset");
    mutate((db) => {
      changePassword(user, passwordHash);
      addAudit(db, user.id, "auth.password_reset.complete", {
        userId: user.id,
      });
    });
    revokeSockets(io, user.id);
    return { ok: true, signInRequired: true };
  });
}
