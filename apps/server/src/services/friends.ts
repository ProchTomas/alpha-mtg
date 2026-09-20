import { and, eq, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { schema } from "../db/index.js";
import { AuthError, normalizeHandle, toPublic, type PublicUser } from "./auth.js";

export type FriendsView = {
  friends: PublicUser[];
  incoming: PublicUser[]; // they asked me
  outgoing: PublicUser[]; // I asked them
};

export type Invite = { code: string; from: PublicUser; at: number };

/** One row per pair, (userA < userB) so a pair can't exist twice in either order. */
function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export class FriendService {
  /** Table invites are ephemeral: in memory, per invitee, polled by the client. */
  private invites = new Map<string, Invite[]>();

  constructor(private readonly db: Db) {}

  list(userId: string): FriendsView {
    const rows = this.db
      .select()
      .from(schema.friendships)
      .where(or(eq(schema.friendships.userA, userId), eq(schema.friendships.userB, userId)))
      .all();
    const otherIds = rows.map((r) => (r.userA === userId ? r.userB : r.userA));
    const users = new Map(
      otherIds.length
        ? this.db
            .select()
            .from(schema.users)
            .where(or(...otherIds.map((id) => eq(schema.users.id, id))))
            .all()
            .map((u) => [u.id, toPublic(u)])
        : [],
    );
    const view: FriendsView = { friends: [], incoming: [], outgoing: [] };
    for (const r of rows) {
      const other = users.get(r.userA === userId ? r.userB : r.userA);
      if (!other || r.status === "blocked") continue;
      if (r.status === "accepted") view.friends.push(other);
      else if (r.requesterId === userId) view.outgoing.push(other);
      else view.incoming.push(other);
    }
    const byName = (a: PublicUser, b: PublicUser) => a.displayName.localeCompare(b.displayName);
    view.friends.sort(byName);
    view.incoming.sort(byName);
    view.outgoing.sort(byName);
    return view;
  }

  /** Send a request by handle. If they already asked you, this accepts instead. */
  request(userId: string, handle: string): FriendsView {
    const target = this.db.select().from(schema.users).where(eq(schema.users.handle, normalizeHandle(handle))).get();
    if (!target) throw new AuthError(404, "No player with that handle.");
    if (target.id === userId) throw new AuthError(400, "That's you.");
    const [a, b] = pair(userId, target.id);
    const existing = this.db
      .select()
      .from(schema.friendships)
      .where(and(eq(schema.friendships.userA, a), eq(schema.friendships.userB, b)))
      .get();
    if (existing) {
      if (existing.status === "accepted") throw new AuthError(409, "You're already friends.");
      if (existing.status === "blocked") throw new AuthError(403, "Can't send that request.");
      if (existing.requesterId !== userId) return this.accept(userId, target.id);
      throw new AuthError(409, "Request already sent.");
    }
    this.db.insert(schema.friendships).values({ userA: a, userB: b, requesterId: userId, status: "pending", createdAt: new Date() }).run();
    return this.list(userId);
  }

  accept(userId: string, otherId: string): FriendsView {
    const [a, b] = pair(userId, otherId);
    const row = this.db
      .select()
      .from(schema.friendships)
      .where(and(eq(schema.friendships.userA, a), eq(schema.friendships.userB, b)))
      .get();
    if (!row || row.status !== "pending" || row.requesterId === userId) throw new AuthError(404, "No request to accept.");
    this.db
      .update(schema.friendships)
      .set({ status: "accepted" })
      .where(and(eq(schema.friendships.userA, a), eq(schema.friendships.userB, b)))
      .run();
    return this.list(userId);
  }

  /** Decline, cancel or unfriend — all the same row delete. */
  remove(userId: string, otherId: string): FriendsView {
    const [a, b] = pair(userId, otherId);
    this.db
      .delete(schema.friendships)
      .where(and(eq(schema.friendships.userA, a), eq(schema.friendships.userB, b)))
      .run();
    return this.list(userId);
  }

  areFriends(userId: string, otherId: string): boolean {
    const [a, b] = pair(userId, otherId);
    const row = this.db
      .select({ status: schema.friendships.status })
      .from(schema.friendships)
      .where(and(eq(schema.friendships.userA, a), eq(schema.friendships.userB, b)))
      .get();
    return row?.status === "accepted";
  }

  // ---------- invites ----------

  invite(fromUser: PublicUser, toUserId: string, code: string): void {
    if (!this.areFriends(fromUser.id, toUserId)) throw new AuthError(403, "You can only invite friends.");
    const list = (this.invites.get(toUserId) ?? []).filter((i) => i.code !== code);
    list.push({ code, from: fromUser, at: Date.now() });
    this.invites.set(toUserId, list.slice(-10));
  }

  pendingInvites(userId: string): Invite[] {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const list = (this.invites.get(userId) ?? []).filter((i) => i.at > cutoff);
    this.invites.set(userId, list);
    return list;
  }

  dismissInvite(userId: string, code: string): void {
    this.invites.set(userId, (this.invites.get(userId) ?? []).filter((i) => i.code !== code));
  }
}
