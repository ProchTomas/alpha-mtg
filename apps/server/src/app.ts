import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { Db, Sqlite } from "./db/index.js";
import { cardRoutes } from "./routes/cards.js";
import { imageRoutes } from "./routes/images.js";
import { CardService } from "./services/cards.js";
import { AuthError, AuthService } from "./services/auth.js";
import { authRoutes, SESSION_COOKIE } from "./routes/auth.js";
import { DeckService } from "./services/decks.js";
import { deckRoutes } from "./routes/decks.js";
import { GameService } from "./services/games.js";
import { gameRoutes, wsRoutes } from "./routes/games.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    sqlite: Sqlite;
    cards: CardService;
    auth: AuthService;
    decks: DeckService;
    games: GameService;
  }
}

export async function buildApp(deps: { db: Db; sqlite: Sqlite }) {
  const app = Fastify({
    logger: config.isProd
      ? true
      : { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } },
    trustProxy: true,
  });

  app.decorate("db", deps.db);
  app.decorate("sqlite", deps.sqlite);
  app.decorate("cards", new CardService(deps.sqlite));
  app.decorate("auth", new AuthService(deps.db));
  app.decorate("decks", new DeckService(deps.db, app.cards));
  app.decorate("games", new GameService(deps.db, app.cards));
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);

  await app.register(cookie, { secret: config.cookieSecret });
  if (!config.isProd) {
    await app.register(cors, { origin: config.appUrl, credentials: true });
  }

  // Resolve the session cookie once per request; routes read req.user.
  app.addHook("onRequest", async (req) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (!sid) return;
    const user = app.auth.getSessionUser(sid);
    if (user) {
      req.user = user;
      req.sessionId = sid;
    }
  });

  app.setErrorHandler((err: FastifyError | AuthError, req, reply) => {
    if (err instanceof AuthError) return reply.code(err.status).send({ error: err.message });
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status < 500 ? err.message : "Something went wrong." });
  });

  app.get("/health", async () => ({ ok: true, app: config.appName }));

  await app.register(authRoutes, { prefix: "/api" });
  await app.register(cardRoutes, { prefix: "/api" });
  await app.register(deckRoutes, { prefix: "/api" });
  await app.register(gameRoutes, { prefix: "/api" });
  await app.register(wsRoutes);
  await app.register(imageRoutes);

  // In production the built React bundle is served from here with an SPA fallback.
  const publicDir = path.resolve(import.meta.dirname, "../../web/dist");
  if (config.isProd && fs.existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir, prefix: "/", wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/img")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
