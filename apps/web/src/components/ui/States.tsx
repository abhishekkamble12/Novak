import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400" role="status">
    <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
    {label && <span>{label}</span>}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="glass-panel rounded-2xl p-8 text-center space-y-3">
    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
    <p className="text-sm text-slate-300">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="text-xs font-semibold px-4 py-2 rounded-lg bg-surface border border-surface-border hover:border-brand-500/50"
      >
        Try again
      </button>
    )}
  </div>
);

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <div className="glass-panel rounded-2xl p-10 text-center space-y-3">
    <div className="mx-auto w-12 h-12 rounded-2xl bg-surface flex items-center justify-center text-brand-400">
      {icon}
    </div>
    <h3 className="font-heading font-semibold text-white">{title}</h3>
    {children && <div className="text-sm text-slate-400 space-y-3">{children}</div>}
  </div>
);
