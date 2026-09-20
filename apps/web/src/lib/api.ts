import type { CardSummary } from "@playster/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    // Only claim JSON when there is a body: Fastify rejects an empty JSON body.
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  searchCards: (q: string, limit = 20, signal?: AbortSignal) =>
    fetch(`/api/cards/search?q=${encodeURIComponent(q)}&limit=${limit}`, { signal })
      .then((r) => r.json() as Promise<{ results: CardSummary[] }>)
      .then((r) => r.results),
};

/** URL for a locally cached card image. */
export function cardImageUrl(cardId: string, size: "small" | "normal" | "large" | "art_crop" = "normal", face: "front" | "back" = "front"): string {
  return `/img/${cardId}/${size}${face === "back" ? "/back" : ""}`;
}
