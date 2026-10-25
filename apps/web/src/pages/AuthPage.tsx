import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, AtSign, Loader2, Lock, Mail, Sparkles, User } from "lucide-react";
import { authApi, errorMessage } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";

const inputClass =
  "w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-surface-border text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500";

const Field: React.FC<
  {
    id: string;
    label: string;
    icon: React.ReactNode;
    hint?: string;
  } & React.InputHTMLAttributes<HTMLInputElement>
> = ({ id, label, icon, hint, ...input }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
      {label}
    </label>
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      <input id={id} required className={inputClass} {...input} />
    </div>
    {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
  </div>
);

export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const from = (location.state as { from?: string } | null)?.from || "/";

  if (status === "authenticated") return <Navigate to={from} replace />;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = isLogin
        ? await authApi.login(form.email.trim(), form.password)
        : await authApi.register({
            name: form.name.trim(),
            username: form.username.trim(),
            email: form.email.trim(),
            password: form.password,
          });
      useAuthStore.getState().setSession(result);
      // Likes and author-only posts depend on who's viewing
      void qc.invalidateQueries();
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (login: boolean) => {
    setIsLogin(login);
    setError(null);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md glass-panel rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-60 h-60 bg-gradient-brand opacity-20 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-neon mb-2">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-white tracking-tight">
            {isLogin ? "Welcome back to Novak" : "Join Novak"}
          </h2>
          <p className="text-xs text-slate-400">
            {isLogin ? "Sign in to post, like and explore." : "Share images, discovered by meaning."}
          </p>
        </div>

        <div
          className="grid grid-cols-2 p-1 rounded-xl bg-surface border border-surface-border mb-6"
          role="tablist"
        >
          {[
            ["Sign In", true],
            ["Create Account", false],
          ].map(([label, login]) => (
            <button
              key={String(label)}
              type="button"
              role="tab"
              aria-selected={isLogin === login}
              onClick={() => switchMode(login as boolean)}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                isLogin === login ? "bg-brand-500 text-white shadow-neon" : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <Field
                id="name"
                label="Full name"
                icon={<User className="w-4 h-4" />}
                value={form.name}
                onChange={set("name")}
                maxLength={60}
                autoComplete="name"
                placeholder="Ada Lovelace"
              />
              <Field
                id="username"
                label="Username"
                icon={<AtSign className="w-4 h-4" />}
                value={form.username}
                onChange={set("username")}
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]+"
                title="Letters, numbers and underscores"
                autoComplete="username"
                placeholder="ada_l"
              />
            </>
          )}

          <Field
            id="email"
            label={isLogin ? "Email or username" : "Email"}
            type={isLogin ? "text" : "email"}
            icon={<Mail className="w-4 h-4" />}
            value={form.email}
            onChange={set("email")}
            autoComplete={isLogin ? "username" : "email"}
            placeholder="you@domain.com"
          />

          <Field
            id="password"
            label="Password"
            type="password"
            icon={<Lock className="w-4 h-4" />}
            value={form.password}
            onChange={set("password")}
            minLength={isLogin ? undefined : 8}
            maxLength={128}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="••••••••"
            hint={isLogin ? undefined : "At least 8 characters, with an uppercase letter and a number."}
          />

          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-brand text-white font-semibold text-sm shadow-neon hover:opacity-95 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>{isLogin ? "Sign In" : "Create account"}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
