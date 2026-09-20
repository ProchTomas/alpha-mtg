import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BOARDS } from "@playster/shared";
import { requireUser } from "./auth.js";

const board = z.enum(BOARDS);

const CreateDeck = z.object({
  name: z.string().max(80).default("Untitled deck"),
  format: z.string().max(20).optional(),
  description: z.string().max(2000).optional(),
  /** Optional decklist to import right away. */
  text: z.string().max(100_000).optional(),
});
const PatchDeck = z.object({
  name: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  format: z.string().max(20).optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  coverCardId: z.string().nullable().optional(),
});
const SetCard = z.object({ cardId: z.string().min(1), quantity: z.number().int().min(0).max(999), board });
const Swap = z.object({ fromCardId: z.string().min(1), toCardId: z.string().min(1), board });
const Import = z.object({ text: z.string().max(100_000), mode: z.enum(["replace", "append"]).default("replace") });

export const deckRoutes: FastifyPluginAsync = async (app) => {
  const { decks } = app;
  type P = { Params: { id: string } };

  app.get("/decks", { preHandler: requireUser }, async (req) => ({
    decks: decks.listForUser(req.user!.id, req.user!.id),
  }));

  app.get("/decks/public", async () => ({ decks: decks.listPublic() }));

  app.get<{ Params: { handle: string } }>("/users/:handle/decks", async (req, reply) => {
    const owner = app.auth.getPublicByHandle(req.params.handle);
    if (!owner) return reply.code(404).send({ error: "No such player." });
    return { decks: decks.listForUser(owner.id, req.user?.id ?? null) };
  });

  app.post("/decks", { preHandler: requireUser }, async (req, reply) => {
    const body = CreateDeck.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    const deck = decks.create(req.user!.id, body.data);
    const imported = body.data.text?.trim() ? decks.import(deck.id, req.user!.id, body.data.text, "replace") : null;
    return { deck: decks.get(deck.id, req.user!.id), unresolved: imported?.unresolved ?? [] };
  });

  app.get<P>("/decks/:id", async (req, reply) => {
    const deck = decks.get(req.params.id, req.user?.id ?? null);
    if (!deck) return reply.code(404).send({ error: "No such deck." });
    return { deck };
  });

  app.patch<P>("/decks/:id", { preHandler: requireUser }, async (req, reply) => {
    const body = PatchDeck.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    decks.update(req.params.id, req.user!.id, body.data);
    return { deck: decks.get(req.params.id, req.user!.id) };
  });

  app.delete<P>("/decks/:id", { preHandler: requireUser }, async (req) => {
    decks.delete(req.params.id, req.user!.id);
    return { ok: true };
  });

  app.put<P>("/decks/:id/cards", { preHandler: requireUser }, async (req, reply) => {
    const body = SetCard.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    decks.setCard(req.params.id, req.user!.id, body.data);
    return { deck: decks.get(req.params.id, req.user!.id) };
  });

  app.post<P>("/decks/:id/swap", { preHandler: requireUser }, async (req, reply) => {
    const body = Swap.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    decks.swapPrinting(req.params.id, req.user!.id, body.data.fromCardId, body.data.toCardId, body.data.board);
    return { deck: decks.get(req.params.id, req.user!.id) };
  });

  app.post<P>("/decks/:id/import", { preHandler: requireUser }, async (req, reply) => {
    const body = Import.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad request" });
    const result = decks.import(req.params.id, req.user!.id, body.data.text, body.data.mode);
    return { ...result, deck: decks.get(req.params.id, req.user!.id) };
  });
};
