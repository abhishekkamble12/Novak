import React, { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/** Fetches the next page when scrolled into view; the button is the keyboard/no-IO fallback. */
export const LoadMore: React.FC<LoadMoreProps> = ({ hasMore, loading, onLoadMore }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !loading) onLoadMore();
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-6">
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-surface border border-surface-border text-slate-300 hover:border-brand-500/50 disabled:opacity-60"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
};
