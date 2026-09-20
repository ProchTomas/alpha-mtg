import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getFaceImages, type ImageSize } from "@alphamtg/shared";

const SIZES: ImageSize[] = ["small", "normal", "large", "art_crop", "border_crop", "png"];
const UUID = /^[0-9a-f-]{36}$/;

/**
 * Lazy image cache: first request fetches from scryfall.io and writes to disk,
 * every later request is a plain file send with a one-year immutable cache header.
 * Fetches are serialised through a small polite queue (~10 req/s, as Scryfall asks).
 */
class Fetcher {
  private inflight = new Map<string, Promise<void>>();
  private chain: Promise<void> = Promise.resolve();
  private lastAt = 0;
  private readonly minGapMs = 100;

  fetchTo(url: string, file: string): Promise<void> {
    const existing = this.inflight.get(file);
    if (existing) return existing;
    const p = this.enqueue(async () => {
      const res = await fetch(url, { headers: { "User-Agent": config.userAgent, Accept: "*/*" } });
      if (!res.ok) throw new Error(`scryfall ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, buf);
      await fsp.rename(tmp, file);
    }).finally(() => this.inflight.delete(file));
    this.inflight.set(file, p);
    return p;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.lastAt + this.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastAt = Date.now();
      return job();
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export const imageRoutes: FastifyPluginAsync = async (app) => {
  const fetcher = new Fetcher();

  app.get<{ Params: { id: string; size: string; face?: string } }>(
    "/img/:id/:size/:face?",
    async (req, reply) => {
      const { id, size } = req.params;
      const face = req.params.face === "back" ? "back" : "front";
      if (!UUID.test(id) || !SIZES.includes(size as ImageSize)) {
        return reply.code(400).send({ error: "bad image request" });
      }
      const ext = size === "png" ? "png" : "jpg";
      const file = path.join(config.imgDir, size, face, `${id}.${ext}`);

      if (!fs.existsSync(file)) {
        const card = app.cards.get(id);
        if (!card) return reply.code(404).send({ error: "unknown card" });
        const url = getFaceImages(card, size as ImageSize)[face];
        if (!url) return reply.code(404).send({ error: "no image for face" });
        try {
          await fetcher.fetchTo(url, file);
        } catch (err) {
          req.log.warn({ err, url }, "image fetch failed");
          return reply.code(502).send({ error: "upstream image fetch failed" });
        }
      }

      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      reply.type(ext === "png" ? "image/png" : "image/jpeg");
      return reply.send(fs.createReadStream(file));
    },
  );
};
