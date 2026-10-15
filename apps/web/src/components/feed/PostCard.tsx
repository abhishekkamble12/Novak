import React, { useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Sparkles,
  ShieldCheck,
  MoreHorizontal,
} from "lucide-react";
import { Post } from "../../types";

interface PostCardProps {
  post: Post;
  onLike?: (postId: string) => void;
  onSave?: (postId: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onLike, onSave }) => {
  const [isLiked, setIsLiked] = useState(post.hasLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isSaved, setIsSaved] = useState(post.hasSaved);
  const [showHeartBurst, setShowHeartBurst] = useState(false);

  const handleLikeToggle = () => {
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : prev - 1));
    if (onLike) onLike(post.id);
  };

  const handleDoubleTap = () => {
    if (!isLiked) {
      setIsLiked(true);
      setLikesCount((prev) => prev + 1);
      if (onLike) onLike(post.id);
    }
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
  };

  const handleSaveToggle = () => {
    setIsSaved(!isSaved);
    if (onSave) onSave(post.id);
  };

  return (
    <article className="glass-panel rounded-2xl border border-surface-border overflow-hidden mb-6 transition-all duration-300 hover:border-slate-700/60 shadow-glass">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-3">
          <img
            src={post.authorAvatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
            alt={post.authorUsername}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-brand-500/30"
          />
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-sm text-white hover:underline cursor-pointer">
                {post.authorUsername}
              </span>
              {post.moderationStatus === "approved" && (
                <span title="Content verified safe by AI Moderation">
                  <ShieldCheck
                    className="w-4 h-4 text-emerald-400"
                    aria-label="Verified safe"
                  />
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              {new Date(post.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        <button className="text-slate-400 hover:text-white p-1 rounded-lg">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Media with Double-tap gesture */}
      <div
        className="relative bg-black select-none overflow-hidden cursor-pointer"
        onDoubleClick={handleDoubleTap}
      >
        <img
          src={post.mediaUrl}
          alt={post.caption}
          className="w-full object-cover max-h-[580px] transition-transform duration-500 hover:scale-[1.01]"
          loading="lazy"
        />

        {/* Heart Burst Animation */}
        {showHeartBurst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-ping">
            <Heart className="w-24 h-24 text-rose-500 fill-rose-500 drop-shadow-neon" />
          </div>
        )}

        {/* AI Tag Overlay Badges */}
        {post.aiTags && post.aiTags.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 pointer-events-none">
            {post.aiTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center space-x-1 text-[11px] font-medium bg-black/60 backdrop-blur-md text-pink-300 px-2.5 py-1 rounded-full border border-pink-500/20"
              >
                <Sparkles className="w-3 h-3 text-pink-400" />
                <span>#{tag}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLikeToggle}
              className={`p-1 transition-transform active:scale-125 ${
                isLiked ? "text-rose-500" : "text-slate-300 hover:text-white"
              }`}
            >
              <Heart
                className={`w-6 h-6 ${isLiked ? "fill-rose-500 stroke-rose-500" : ""}`}
              />
            </button>
            <button className="text-slate-300 hover:text-white p-1 transition-colors">
              <MessageCircle className="w-6 h-6" />
            </button>
            <button className="text-slate-300 hover:text-white p-1 transition-colors">
              <Share2 className="w-6 h-6" />
            </button>
          </div>

          <button
            onClick={handleSaveToggle}
            className={`p-1 transition-colors ${
              isSaved ? "text-amber-400" : "text-slate-300 hover:text-white"
            }`}
          >
            <Bookmark
              className={`w-6 h-6 ${isSaved ? "fill-amber-400 stroke-amber-400" : ""}`}
            />
          </button>
        </div>

        {/* Likes Count */}
        <p className="text-sm font-semibold text-white">
          {likesCount.toLocaleString()} {likesCount === 1 ? "like" : "likes"}
        </p>

        {/* Caption */}
        <p className="text-sm text-slate-200 leading-relaxed">
          <span className="font-semibold text-white mr-2">{post.authorUsername}</span>
          {post.caption}
        </p>

        {/* Comment Link */}
        {post.commentsCount > 0 && (
          <button className="text-xs text-slate-400 hover:text-slate-200 block">
            View all {post.commentsCount} comments
          </button>
        )}
      </div>
    </article>
  );
};
