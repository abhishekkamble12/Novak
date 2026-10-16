import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, Users } from "lucide-react";
import { postsApi, usersApi } from "../../lib/api";
import { Avatar } from "../ui/Avatar";

export const SuggestedCreators: React.FC = () => {
  const { data } = useQuery({ queryKey: ["users", "suggestions"], queryFn: usersApi.suggestions });
  if (!data?.length) return null;

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-brand-400" />
        <h4 className="font-heading font-semibold text-sm text-white">Creators to explore</h4>
      </div>
      <div className="space-y-3">
        {data.map((u) => (
          <Link key={u.id} to={`/u/${u.username}`} className="flex items-center gap-3 group">
            <Avatar src={u.avatarUrl} name={u.name} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate group-hover:underline">{u.username}</p>
              <p className="text-[11px] text-slate-400">
                {u.postsCount} {u.postsCount === 1 ? "post" : "posts"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export const TrendingTags: React.FC<{ title?: string }> = ({ title = "Trending this week" }) => {
  const { data } = useQuery({ queryKey: ["tags", "trending"], queryFn: postsApi.trendingTags });
  if (!data?.length) return null;

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-pink-400" />
        <h4 className="font-heading font-semibold text-sm text-white">{title}</h4>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.map(({ tag, count }) => (
          <Link
            key={tag}
            to={`/explore?q=${encodeURIComponent(tag)}`}
            className="text-xs font-medium px-3 py-1.5 rounded-xl bg-surface/80 border border-surface-border text-slate-300 hover:text-white hover:border-brand-500/40"
            title={`${count} posts`}
          >
            #{tag}
          </Link>
        ))}
      </div>
    </div>
  );
};

export const AboutCard: React.FC = () => (
  <div className="p-4 rounded-xl bg-surface/40 border border-surface-border text-[11px] text-slate-400 space-y-1">
    <div className="flex items-center gap-1.5 text-pink-400 font-semibold">
      <Sparkles className="w-3.5 h-3.5" />
      <span>How Novak works</span>
    </div>
    <p>Every post is moderated and tagged by AI, then indexed with CLIP embeddings so Explore can find it by meaning.</p>
  </div>
);
