import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, Home, LogIn, LogOut, PlusSquare, Sparkles, User as UserIcon } from "lucide-react";
import { authApi } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { Avatar } from "../ui/Avatar";

interface NavbarProps {
  onOpenCreateModal: () => void;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all border ${
    isActive
      ? "bg-brand-500/15 text-white border-brand-500/30 shadow-neon"
      : "text-slate-400 hover:text-white hover:bg-surface border-transparent"
  }`;

const mobileClass = ({ isActive }: { isActive: boolean }) =>
  `p-2.5 rounded-xl ${isActive ? "text-brand-400" : "text-slate-400"}`;

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreateModal }) => {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleCreate = () => (user ? onOpenCreateModal() : navigate("/auth"));

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      useAuthStore.getState().clear();
      qc.clear();
      navigate("/");
    }
  };

  return (
    <>
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 glass-panel border-r border-surface-border p-6 z-40 justify-between">
        <div className="flex flex-col gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-neon">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-heading text-2xl font-extrabold tracking-tight text-white">Novak</span>
              <span className="block text-[10px] tracking-wider uppercase text-pink-400/80 font-semibold">
                AI Social Network
              </span>
            </div>
          </Link>

          <nav className="flex flex-col gap-2">
            <NavLink to="/" end className={linkClass}>
              <Home className="w-5 h-5" /> Feed
            </NavLink>
            <NavLink to="/explore" className={linkClass}>
              <Compass className="w-5 h-5" /> Explore
              <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gradient-brand text-white">
                AI
              </span>
            </NavLink>
            {user && (
              <NavLink to={`/u/${user.username}`} className={linkClass}>
                <UserIcon className="w-5 h-5" /> Profile
              </NavLink>
            )}
            <button
              onClick={handleCreate}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-brand text-white font-semibold shadow-neon hover:opacity-95"
            >
              <PlusSquare className="w-5 h-5" /> Create Post
            </button>
          </nav>
        </div>

        {user ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface/80 border border-surface-border/80">
            <Link to={`/u/${user.username}`} className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar src={user.avatarUrl} name={user.name} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                <p className="text-xs text-slate-400 truncate">@{user.username}</p>
              </div>
            </Link>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-white" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          status !== "loading" && (
            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-surface border border-surface-border text-sm font-semibold text-white hover:border-brand-500/50"
            >
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
          )
        )}
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-surface-border px-4 py-2 z-40 flex items-center justify-around">
        <NavLink to="/" end className={mobileClass} aria-label="Feed">
          <Home className="w-6 h-6" />
        </NavLink>
        <NavLink to="/explore" className={mobileClass} aria-label="Explore">
          <Compass className="w-6 h-6" />
        </NavLink>
        <button onClick={handleCreate} className="p-3 rounded-full bg-gradient-brand text-white shadow-neon" aria-label="Create post">
          <PlusSquare className="w-6 h-6" />
        </button>
        {user ? (
          <>
            <NavLink to={`/u/${user.username}`} className={mobileClass} aria-label="Profile">
              <UserIcon className="w-6 h-6" />
            </NavLink>
            <button onClick={handleLogout} className="p-2.5 text-slate-400" aria-label="Sign out">
              <LogOut className="w-6 h-6" />
            </button>
          </>
        ) : (
          <NavLink to="/auth" className={mobileClass} aria-label="Sign in">
            <LogIn className="w-6 h-6" />
          </NavLink>
        )}
      </nav>
    </>
  );
};
