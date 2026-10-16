import { create } from "zustand";
import type { AuthResult, UserSummary } from "@novak/contracts";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: UserSummary | null;
  // Kept in memory only. On reload the session is restored from the httpOnly refresh cookie.
  accessToken: string | null;
  status: AuthStatus;
  setSession: (result: AuthResult) => void;
  setUser: (user: UserSummary) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  setSession: ({ user, accessToken }) => set({ user, accessToken, status: "authenticated" }),
  setUser: (user) => set({ user }),
  clear: () => set({ user: null, accessToken: null, status: "anonymous" }),
}));
