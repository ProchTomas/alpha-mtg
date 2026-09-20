import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const SearchQuery = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const IdsBody = z.object({ ids: z.array(z.string().min(1)).max(2000) });

export const cardRoutes: FastifyPluginAsync = async (app) => {
  const { cards } = app;

  app.get("/cards/search", async (req, reply) => {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "bad query" });
    const { q, limit } = parsed.data;
    return { results: cards.searchNames(q, limit) };
  });

  app.get<{ Params: { id: string } }>("/cards/:id", async (req, reply) => {
    const card = cards.get(req.params.id);
    if (!card) return reply.code(404).send({ error: "not found" });
    return card;
  });

  app.get<{ Params: { oracleId: string } }>("/cards/oracle/:oracleId/printings", async (req) => {
    return { printings: cards.getPrintings(req.params.oracleId) };
  });

  app.post("/cards/batch", async (req, reply) => {
    const parsed = IdsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad body" });
    return { cards: Object.fromEntries(cards.getMany(parsed.data.ids)) };
  });

  app.get("/cards/stats", async () => ({ count: cards.cardCount() }));
};
