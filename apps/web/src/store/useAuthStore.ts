import { create } from "zustand";
import { User } from "../types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: {
    id: "demo-user-1",
    username: "abhishek",
    name: "Abhishek Kamble",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    bio: "Building Novak — high-scale AI native social experience 🚀",
    followersCount: 1420,
    followingCount: 380,
  },
  accessToken: localStorage.getItem("novak_access_token") || "demo-token",
  isAuthenticated: true,
  setAuth: (user, token) => {
    localStorage.setItem("novak_access_token", token);
    set({ user, accessToken: token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem("novak_access_token");
    set({ user: null, accessToken: null, isAuthenticated: false });
  },
}));
