import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "./auth.js";

const ByHandle = z.object({ handle: z.string().min(1).max(40) });
const ByUser = z.object({ userId: z.string().min(1) });

export const friendRoutes: FastifyPluginAsync = async (app) => {
  const { friends } = app;

  app.get("/friends", { preHandler: requireUser }, async (req) => friends.list(req.user!.id));

  app.post("/friends/request", { preHandler: requireUser }, async (req, reply) => {
    const body = ByHandle.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    return friends.request(req.user!.id, body.data.handle);
  });

  app.post("/friends/accept", { preHandler: requireUser }, async (req, reply) => {
    const body = ByUser.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    return friends.accept(req.user!.id, body.data.userId);
  });

  app.post("/friends/remove", { preHandler: requireUser }, async (req, reply) => {
    const body = ByUser.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    return friends.remove(req.user!.id, body.data.userId);
  });

  app.get("/invites", { preHandler: requireUser }, async (req) => ({ invites: friends.pendingInvites(req.user!.id) }));

  app.delete<{ Params: { code: string } }>("/invites/:code", { preHandler: requireUser }, async (req) => {
    friends.dismissInvite(req.user!.id, req.params.code.toUpperCase());
    return { ok: true };
  });

  app.post<{ Params: { code: string } }>("/games/:code/invite", { preHandler: requireUser }, async (req, reply) => {
    const body = ByUser.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    const lobby = app.games.lobby(req.params.code); // throws 404 if unknown
    const { email: _e, ...me } = req.user!;
    friends.invite(me, body.data.userId, lobby.joinCode);
    return { ok: true };
  });
};
