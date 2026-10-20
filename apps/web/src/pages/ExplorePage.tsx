import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2, Search, SearchX, Sparkles, Type, Zap } from "lucide-react";
import { PostGrid } from "../components/feed/PostGrid";
import { TrendingTags } from "../components/feed/Sidebar";
import { LoadMore } from "../components/ui/LoadMore";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { errorMessage, postsApi, searchApi } from "../lib/api";
import { postKeys } from "../lib/postCache";

const LatestGrid: React.FC = () => {
  const feed = useInfiniteQuery({
    queryKey: postKeys.feed,
    queryFn: ({ pageParam }) => postsApi.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];

  if (feed.isPending) return <Spinner />;
  if (feed.isError) return <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />;
  if (posts.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="font-heading font-semibold text-white px-1">Latest posts</h3>
      <PostGrid posts={posts} />
      <LoadMore
        hasMore={feed.hasNextPage}
        loading={feed.isFetchingNextPage}
        onLoadMore={() => void feed.fetchNextPage()}
      />
    </section>
  );
};

export const ExplorePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const [input, setInput] = useState(q);

  useEffect(() => setInput(q), [q]);

  const search = useQuery({
    queryKey: postKeys.search(q),
    queryFn: () => searchApi.search(q),
    enabled: q.length > 0,
    staleTime: 30_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = input.trim().slice(0, 200);
    setParams(next ? { q: next } : {});
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="relative glass-panel rounded-2xl p-6 overflow-hidden">
        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-xs font-semibold text-pink-400">
            <Sparkles className="w-3.5 h-3.5" />
            Semantic caption search
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Search captions by <span className="text-gradient">meaning</span>, not just keywords
          </h2>
          <form onSubmit={handleSubmit} className="relative" role="search">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={200}
              placeholder="Try 'caffeine fix' or 'climbing a mountain'"
              aria-label="Search posts"
              className="w-full pl-12 pr-28 py-3.5 rounded-xl bg-surface/90 border border-surface-border text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 text-sm"
            />
            <button
              type="submit"
              disabled={search.isFetching}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-gradient-brand text-white font-medium text-xs shadow-neon flex items-center gap-1 disabled:opacity-60"
            >
              {search.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Search
            </button>
          </form>
        </div>
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {!q ? (
        <>
          <TrendingTags title="Trending tags" />
          <LatestGrid />
        </>
      ) : search.isPending ? (
        <Spinner label="Searching…" />
      ) : search.isError ? (
        <ErrorState message={errorMessage(search.error)} onRetry={() => search.refetch()} />
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              {search.data.results.length} {search.data.results.length === 1 ? "result" : "results"} for "{q}"
            </span>
            {search.data.mode !== "keyword" ? (
              <span
                className="flex items-center gap-1 text-pink-400 font-medium"
                title="Caption-meaning matches first (with similarity score), then keyword matches"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {search.data.mode === "hybrid" ? "Semantic + keyword" : "Semantic"} ·{" "}
                {Math.round(search.data.latencyMs)} ms
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-300" role="status">
                <Type className="w-3.5 h-3.5" /> Keyword results only: semantic search is unavailable right now
              </span>
            )}
          </div>
          {search.data.results.length === 0 ? (
            <EmptyState icon={<SearchX className="w-6 h-6" />} title="Nothing found">
              <p>Try different words, or describe what the caption might say.</p>
            </EmptyState>
          ) : (
            <PostGrid posts={search.data.results} showScore />
          )}
        </section>
      )}
    </div>
  );
};
