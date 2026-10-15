import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Compass,
  PlusSquare,
  MessageCircle,
  Heart,
  User as UserIcon,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";

interface NavbarProps {
  onOpenCreateModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreateModal }) => {
  const location = useLocation();
  const { user } = useAuthStore();

  const navItems = [
    { label: "Feed", path: "/", icon: Home },
    { label: "Explore", path: "/explore", icon: Compass, badge: "AI" },
    { label: "Messages", path: "/messages", icon: MessageCircle, count: 2 },
    { label: "Notifications", path: "/notifications", icon: Heart },
    { label: "Profile", path: "/profile", icon: UserIcon },
  ];

  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 glass-panel border-r border-surface-border p-6 z-40 justify-between">
        <div className="flex flex-col space-y-8">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-neon transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-heading text-2xl font-extrabold tracking-tight text-white group-hover:text-pink-400 transition-colors">
                Lumen
              </span>
              <span className="block text-[10px] tracking-wider uppercase text-pink-400/80 font-semibold">
                AI Social Network
              </span>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav className="flex flex-col space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-brand-500/15 text-white border border-brand-500/30 shadow-neon"
                      : "text-slate-400 hover:text-white hover:bg-surface hover:border-surface-border border border-transparent"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-5 h-5 ${isActive ? "text-brand-400" : ""}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gradient-brand text-white shadow-neon-cyan">
                      {item.badge}
                    </span>
                  )}
                  {item.count && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30">
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Create Post Action Button */}
            <button
              onClick={onOpenCreateModal}
              className="mt-4 w-full flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl bg-gradient-brand text-white font-semibold shadow-neon hover:opacity-95 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <PlusSquare className="w-5 h-5" />
              <span>Create Post</span>
            </button>
          </nav>
        </div>

        {/* User Mini Profile in Sidebar */}
        {user && (
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-surface/80 border border-surface-border/80">
            <img
              src={user.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
              alt={user.name}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-brand-500/40"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">@{user.username}</p>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-surface-border px-4 py-2 z-40 flex items-center justify-around">
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`p-2.5 rounded-xl ${isActive ? "text-brand-400" : "text-slate-400"}`}
            >
              <Icon className="w-6 h-6" />
            </Link>
          );
        })}

        <button
          onClick={onOpenCreateModal}
          className="p-3 rounded-full bg-gradient-brand text-white shadow-neon"
        >
          <PlusSquare className="w-6 h-6" />
        </button>

        {navItems.slice(2, 4).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`p-2.5 rounded-xl ${isActive ? "text-brand-400" : "text-slate-400"}`}
            >
              <Icon className="w-6 h-6" />
            </Link>
          );
        })}
      </nav>
    </>
  );
};
