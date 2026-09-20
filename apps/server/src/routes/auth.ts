import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import type { SessionUser } from "../services/auth.js";

export const SESSION_COOKIE = "ps_session";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
  }
}

const Register = z.object({
  handle: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
  displayName: z.string().max(40).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
});
const Login = z.object({ handle: z.string().min(1).max(40), password: z.string().min(1).max(200) });
const Reset = z.object({
  handle: z.string().min(1).max(40),
  recoveryCode: z.string().min(1).max(60),
  newPassword: z.string().min(1).max(200),
});
const ChangePassword = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });
const ProfilePatch = z.object({
  displayName: z.string().max(40).optional(),
  email: z.string().email().max(200).nullable().optional().or(z.literal("")),
});

function setSessionCookie(reply: FastifyReply, id: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    expires: expiresAt,
  });
}

/** Route guard: 401 unless the request carries a valid session. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: "Sign in required." });
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { auth } = app;

  app.post("/auth/register", async (req, reply) => {
    const body = Register.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Bad request" });
    const { user, recoveryCode } = await auth.register({ ...body.data, email: body.data.email || undefined });
    const s = auth.createSession(user.id);
    setSessionCookie(reply, s.id, s.expiresAt);
    return { user, recoveryCode };
  });

  app.post("/auth/login", async (req, reply) => {
    const body = Login.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    const user = await auth.login(body.data);
    const s = auth.createSession(user.id);
    setSessionCookie(reply, s.id, s.expiresAt);
    return { user };
  });

  app.post("/auth/logout", async (req, reply) => {
    if (req.sessionId) auth.deleteSession(req.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.post("/auth/reset", async (req, reply) => {
    const body = Reset.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    const { user, recoveryCode } = await auth.resetPassword(body.data);
    const s = auth.createSession(user.id);
    setSessionCookie(reply, s.id, s.expiresAt);
    return { user, recoveryCode };
  });

  app.get("/auth/me", async (req) => ({ user: req.user }));

  app.post("/auth/password", { preHandler: requireUser }, async (req, reply) => {
    const body = ChangePassword.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    await auth.changePassword(req.user!.id, body.data.currentPassword, body.data.newPassword);
    return { ok: true };
  });

  app.patch("/auth/profile", { preHandler: requireUser }, async (req, reply) => {
    const body = ProfilePatch.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Bad request" });
    const user = auth.updateProfile(req.user!.id, {
      displayName: body.data.displayName,
      email: body.data.email === undefined ? undefined : body.data.email || null,
    });
    return { user };
  });

  app.get<{ Params: { handle: string } }>("/users/:handle", async (req, reply) => {
    const user = auth.getPublicByHandle(req.params.handle);
    if (!user) return reply.code(404).send({ error: "No such player." });
    return { user };
  });
};
