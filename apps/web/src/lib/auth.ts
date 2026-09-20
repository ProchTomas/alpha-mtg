import { create } from "zustand";
import { api } from "./api";

export type User = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: number;
  email?: string | null;
};

type AuthState = {
  user: User | null;
  /** false until the first /auth/me round trip finishes */
  ready: boolean;
  load: () => Promise<void>;
  login: (handle: string, password: string) => Promise<User>;
  register: (input: { handle: string; password: string; displayName?: string; email?: string }) => Promise<{ user: User; recoveryCode: string }>;
  reset: (input: { handle: string; recoveryCode: string; newPassword: string }) => Promise<{ user: User; recoveryCode: string }>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  load: async () => {
    try {
      const { user } = await api.get<{ user: User | null }>("/auth/me");
      set({ user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
  login: async (handle, password) => {
    const { user } = await api.post<{ user: User }>("/auth/login", { handle, password });
    set({ user });
    return user;
  },
  register: async (input) => {
    const r = await api.post<{ user: User; recoveryCode: string }>("/auth/register", input);
    set({ user: r.user });
    return r;
  },
  reset: async (input) => {
    const r = await api.post<{ user: User; recoveryCode: string }>("/auth/reset", input);
    set({ user: r.user });
    return r;
  },
  logout: async () => {
    await api.post("/auth/logout", {});
    set({ user: null });
  },
  setUser: (user) => set({ user }),
}));
