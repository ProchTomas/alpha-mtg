import argon2 from "argon2";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { schema } from "../db/index.js";
import { newId, newRecoveryCode, newSessionId } from "../ids.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Sessions are extended when more than this much of their life has elapsed. */
const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export type PublicUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: number;
};

export type SessionUser = PublicUser & { email: string | null };

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeHandle(h: string): string {
  return h.trim().toLowerCase();
}

export function toPublic(u: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.getTime(),
  };
}

export class AuthService {
  constructor(private readonly db: Db) {}

  /**
   * Creates a user and returns the one-time recovery code. The code is shown once and only
   * its argon2 hash is stored — there is no email, so this is the only password reset path.
   */
  async register(input: { handle: string; password: string; displayName?: string; email?: string }) {
    const handle = normalizeHandle(input.handle);
    if (!HANDLE_RE.test(handle)) {
      throw new AuthError(400, "Handle must be 3–20 characters: lowercase letters, digits, underscore.");
    }
    if (input.password.length < 8) throw new AuthError(400, "Password must be at least 8 characters.");
    if (input.password.length > 200) throw new AuthError(400, "Password too long.");
    const email = input.email?.trim().toLowerCase() || null;
    const displayName = (input.displayName?.trim() || input.handle.trim()).slice(0, 40);

    const existing = this.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle)).get();
    if (existing) throw new AuthError(409, "That handle is taken.");
    if (email) {
      const byEmail = this.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get();
      if (byEmail) throw new AuthError(409, "That email is already registered.");
    }

    const recoveryCode = newRecoveryCode();
    const [passwordHash, recoveryHash] = await Promise.all([argon2.hash(input.password), argon2.hash(recoveryCode)]);
    const user: typeof schema.users.$inferInsert = {
      id: newId(),
      handle,
      email,
      passwordHash,
      recoveryHash,
      displayName,
      avatarUrl: null,
      createdAt: new Date(),
    };
    this.db.insert(schema.users).values(user).run();
    const row = this.db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()!;
    return { user: this.toSessionUser(row), recoveryCode };
  }

  async login(input: { handle: string; password: string }): Promise<SessionUser> {
    const handle = normalizeHandle(input.handle);
    const row = this.db.select().from(schema.users).where(eq(schema.users.handle, handle)).get();
    // Always run a hash verify so timing doesn't reveal whether the handle exists.
    const ok = row ? await argon2.verify(row.passwordHash, input.password) : await argon2.verify(DUMMY_HASH, input.password);
    if (!row || !ok) throw new AuthError(401, "Wrong handle or password.");
    return this.toSessionUser(row);
  }

  /** Password reset via the recovery code. Issues a fresh recovery code on success. */
  async resetPassword(input: { handle: string; recoveryCode: string; newPassword: string }) {
    const handle = normalizeHandle(input.handle);
    if (input.newPassword.length < 8) throw new AuthError(400, "Password must be at least 8 characters.");
    const row = this.db.select().from(schema.users).where(eq(schema.users.handle, handle)).get();
    const code = input.recoveryCode.trim().toUpperCase();
    const ok = row ? await argon2.verify(row.recoveryHash, code) : await argon2.verify(DUMMY_HASH, code);
    if (!row || !ok) throw new AuthError(401, "Wrong handle or recovery code.");

    const recoveryCode = newRecoveryCode();
    const [passwordHash, recoveryHash] = await Promise.all([argon2.hash(input.newPassword), argon2.hash(recoveryCode)]);
    this.db.update(schema.users).set({ passwordHash, recoveryHash }).where(eq(schema.users.id, row.id)).run();
    // Log everyone out.
    this.db.delete(schema.sessions).where(eq(schema.sessions.userId, row.id)).run();
    return { user: this.toSessionUser({ ...row, passwordHash, recoveryHash }), recoveryCode };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new AuthError(400, "Password must be at least 8 characters.");
    const row = this.db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    if (!row || !(await argon2.verify(row.passwordHash, currentPassword))) throw new AuthError(401, "Wrong password.");
    this.db.update(schema.users).set({ passwordHash: await argon2.hash(newPassword) }).where(eq(schema.users.id, userId)).run();
  }

  updateProfile(userId: string, patch: { displayName?: string; email?: string | null }): SessionUser {
    const set: Partial<typeof schema.users.$inferInsert> = {};
    if (patch.displayName !== undefined) {
      const d = patch.displayName.trim().slice(0, 40);
      if (!d) throw new AuthError(400, "Display name can't be empty.");
      set.displayName = d;
    }
    if (patch.email !== undefined) set.email = patch.email?.trim().toLowerCase() || null;
    if (Object.keys(set).length) this.db.update(schema.users).set(set).where(eq(schema.users.id, userId)).run();
    const row = this.db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    if (!row) throw new AuthError(404, "No such user.");
    return this.toSessionUser(row);
  }

  createSession(userId: string): { id: string; expiresAt: Date } {
    const id = newSessionId();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    this.db.insert(schema.sessions).values({ id, userId, expiresAt, createdAt: new Date() }).run();
    return { id, expiresAt };
  }

  /** Returns the session's user, sliding the expiry forward once a day. */
  getSessionUser(sessionId: string): SessionUser | null {
    const now = new Date();
    const row = this.db
      .select({ session: schema.sessions, user: schema.users })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(and(eq(schema.sessions.id, sessionId), gt(schema.sessions.expiresAt, now)))
      .get();
    if (!row) return null;
    const age = now.getTime() - row.session.createdAt.getTime();
    if (age > SESSION_REFRESH_AFTER_MS) {
      this.db
        .update(schema.sessions)
        .set({ createdAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
        .where(eq(schema.sessions.id, sessionId))
        .run();
    }
    return this.toSessionUser(row.user);
  }

  deleteSession(sessionId: string): void {
    this.db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();
  }

  getPublicByHandle(handle: string): PublicUser | null {
    const row = this.db.select().from(schema.users).where(eq(schema.users.handle, normalizeHandle(handle))).get();
    return row ? toPublic(row) : null;
  }

  private toSessionUser(u: typeof schema.users.$inferSelect): SessionUser {
    return { ...toPublic(u), email: u.email };
  }
}

// A valid argon2id hash of a random string, used to equalise timing on unknown handles.
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdA$m4Y0kM0bA2yfLbA3qXQfw1kS3z0oT1G0cmzD4x1nJd0";
