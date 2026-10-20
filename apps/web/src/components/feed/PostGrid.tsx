import React from "react";
import { Link } from "react-router-dom";
import { Heart, ShieldAlert } from "lucide-react";
import type { PostDto } from "@novak/contracts";
import { compactNumber } from "../../lib/format";

export const PostGrid: React.FC<{ posts: PostDto[]; showScore?: boolean }> = ({ posts, showScore }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
    {posts.map((post) => (
      <Link
        key={post.id}
        to={`/p/${post.id}`}
        className="group relative rounded-xl sm:rounded-2xl overflow-hidden bg-surface aspect-square"
      >
        <img
          src={post.mediaUrl}
          alt={post.caption || `Post by ${post.authorUsername}`}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {post.moderationStatus === "flagged" && (
          <span className="absolute top-2 left-2 p-1 rounded-full bg-amber-500/80" title="Under review">
            <ShieldAlert className="w-3.5 h-3.5 text-white" />
          </span>
        )}
        {showScore && typeof post.score === "number" && (
          <span
            className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-pink-500/80 text-[11px] font-bold text-white"
            title="Cosine similarity between your query and the caption (not a probability)"
          >
            {post.score.toFixed(2)}
          </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
          <p className="text-xs font-semibold text-white line-clamp-2">{post.caption}</p>
          <div className="flex items-center justify-between text-[11px] text-slate-300 mt-1">
            <span>@{post.authorUsername}</span>
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
              {compactNumber(post.likesCount)}
            </span>
          </div>
        </div>
      </Link>
    ))}
  </div>
);
