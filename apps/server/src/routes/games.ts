import type { FastifyPluginAsync } from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { requireUser } from "./auth.js";

const PickDeck = z.object({ deckId: z.string().nullable() });

export const gameRoutes: FastifyPluginAsync = async (app) => {
  const { games } = app;
  type P = { Params: { code: string } };

  app.post("/games", { preHandler: requireUser }, async (req) => ({ lobby: games.create(req.user!.id) }));

  app.get<P>("/games/:code", async (req) => ({ lobby: games.lobby(req.params.code) }));

  app.post<P>("/games/:code/join", { preHandler: requireUser }, async (req) => ({ lobby: games.join(req.params.code, req.user!.id) }));

  app.post<P>("/games/:code/leave", { preHandler: requireUser }, async (req) => ({ lobby: games.leave(req.params.code, req.user!.id) }));

  app.post<P>("/games/:code/deck", { preHandler: requireUser }, async (req, reply) => {
    const body = PickDeck.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    return { lobby: games.pickDeck(req.params.code, req.user!.id, body.data.deckId) };
  });

  app.post<P>("/games/:code/start", { preHandler: requireUser }, async (req) => ({ lobby: games.start(req.params.code, req.user!.id) }));
};

/** WebSocket at /ws?code=ABC123, authenticated by the same session cookie. */
export const wsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });
  app.get<{ Querystring: { code?: string } }>("/ws", { websocket: true }, (socket, req) => {
    const code = req.query.code;
    if (!code) {
      socket.close(1008, "missing code");
      return;
    }
    app.games.attach(code, socket, req.user?.id ?? null);
  });
};
