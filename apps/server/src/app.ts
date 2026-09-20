import Fastify from "fastify";
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

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    sqlite: Sqlite;
    cards: CardService;
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

  await app.register(cookie, { secret: config.cookieSecret });
  if (!config.isProd) {
    await app.register(cors, { origin: config.appUrl, credentials: true });
  }

  app.get("/health", async () => ({ ok: true, app: config.appName }));

  await app.register(cardRoutes, { prefix: "/api" });
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
