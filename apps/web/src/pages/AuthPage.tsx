import React, { useState } from "react";
import { Sparkles, Mail, Lock, User, ArrowRight } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useNavigate } from "react-router-dom";

export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate auth success
    setAuth(
      {
        id: "demo-user-1",
        username: username || "abhishek",
        name: name || "Abhishek Kamble",
        followersCount: 1420,
        followingCount: 380,
      },
      "jwt-demo-token-12345"
    );
    navigate("/");
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md glass-panel rounded-3xl p-8 border border-surface-border shadow-2xl relative overflow-hidden">
        {/* Decorative ambient gradient */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-60 h-60 bg-gradient-brand opacity-20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand header */}
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-neon mb-2">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-white tracking-tight">
            {isLogin ? "Welcome back to Novak" : "Join the AI-Native Social Network"}
          </h2>
          <p className="text-xs text-slate-400">
            {isLogin
              ? "Sign in to access your feed, recommendations, and messages."
              : "Discover content matched with multimodal semantic embeddings."}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-surface border border-surface-border mb-6">
          <button
            type="button"
            onClick={() => setIsLogin(true)}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              isLogin ? "bg-brand-500 text-white shadow-neon" : "text-slate-400 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setIsLogin(false)}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              !isLogin ? "bg-brand-500 text-white shadow-neon" : "text-slate-400 hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Abhishek Kamble"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-surface-border text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="abhishek"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-surface-border text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              {isLogin ? "Email or Username" : "Email Address"}
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-surface-border text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-surface-border text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-4 flex items-center justify-center space-x-2 py-3 rounded-xl bg-gradient-brand text-white font-semibold text-sm shadow-neon hover:opacity-95 transition-all"
          >
            <span>{isLogin ? "Sign In" : "Get Started"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
