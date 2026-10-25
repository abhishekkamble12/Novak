import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Heart,
  Link2,
  Loader2,
  MoreHorizontal,
  SearchCheck,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { PostDto } from "@novak/contracts";
import { errorMessage, postsApi } from "../../lib/api";
import { compactNumber, timeAgo } from "../../lib/format";
import { removePost, updatePost } from "../../lib/postCache";
import { useAuthStore } from "../../store/useAuthStore";
import { Avatar } from "../ui/Avatar";

const badge = "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border";

/** Processing and review state. Only the author sees it; other viewers just see the post. */
export const StatusBadge: React.FC<{ post: PostDto; isOwner: boolean }> = ({ post, isOwner }) => {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => postsApi.reprocess(post.id),
    onSuccess: (updated) => updatePost(qc, post.id, () => updated),
  });

  if (!isOwner) return null;

  if (post.processingStatus === "pending") {
    return (
      <span className={`${badge} text-sky-300 bg-sky-500/10 border-sky-500/20`} role="status">
        <Loader2 className="w-3 h-3 animate-spin" /> Processing
      </span>
    );
  }
  if (post.processingStatus === "failed") {
    return (
      <span className={`${badge} text-rose-300 bg-rose-500/10 border-rose-500/20`} role="status">
        <AlertTriangle className="w-3 h-3" />
        {retry.isError ? "Retry failed" : "Not searchable yet"}
        <button
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="ml-1 underline hover:text-white disabled:opacity-60"
        >
          {retry.isPending ? "Retrying…" : "Retry"}
        </button>
      </span>
    );
  }
  if (post.moderationStatus === "flagged") {
    return (
      <span
        title={post.moderationReason}
        className={`${badge} text-amber-300 bg-amber-500/10 border-amber-500/20`}
      >
        <ShieldAlert className="w-3 h-3" /> Held for review · only you can see this
      </span>
    );
  }
  if (post.searchIndexed) {
    return (
      <span title="Your caption is indexed for semantic search">
        <SearchCheck className="w-4 h-4 text-emerald-400" aria-label="Indexed for search" />
      </span>
    );
  }
  return null;
};

export const PostCard: React.FC<{ post: PostDto }> = ({ post }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const viewer = useAuthStore((s) => s.user);
  const isOwner = viewer?.id === post.authorId;
  const [burst, setBurst] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  };

  const like = useMutation({
    mutationFn: (liked: boolean) => (liked ? postsApi.like(post.id) : postsApi.unlike(post.id)),
    onMutate: (liked) => {
      const previous = { hasLiked: post.hasLiked, likesCount: post.likesCount };
      updatePost(qc, post.id, (p) => ({
        ...p,
        hasLiked: liked,
        likesCount: Math.max(0, p.likesCount + (liked ? 1 : -1)),
      }));
      return previous;
    },
    onSuccess: (res) =>
      updatePost(qc, post.id, (p) => ({ ...p, hasLiked: res.liked, likesCount: res.likesCount })),
    onError: (err, _liked, previous) => {
      if (previous) updatePost(qc, post.id, (p) => ({ ...p, ...previous }));
      flash(errorMessage(err));
    },
  });

  const remove = useMutation({
    mutationFn: () => postsApi.remove(post.id),
    onSuccess: () => {
      removePost(qc, post.id);
      if (viewer) {
        useAuthStore.getState().setUser({ ...viewer, postsCount: Math.max(0, viewer.postsCount - 1) });
      }
    },
    onError: (err) => flash(errorMessage(err)),
  });

  const toggleLike = (liked: boolean) => {
    if (!viewer) {
      navigate("/auth");
      return;
    }
    if (!like.isPending) like.mutate(liked);
  };

  const handleDoubleClick = () => {
    if (!post.hasLiked) toggleLike(true);
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
  };

  const copyLink = async () => {
    setMenuOpen(false);
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      flash(url);
    }
  };

  const tags = [...new Set([...post.tags, ...post.aiTags])];

  return (
    <article className="glass-panel rounded-2xl overflow-hidden shadow-glass">
      <header className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Link to={`/u/${post.authorUsername}`} className="flex items-center gap-3 min-w-0">
            <Avatar src={post.authorAvatarUrl} name={post.authorName} />
            <div className="min-w-0">
              <span className="block font-semibold text-sm text-white hover:underline truncate">
                {post.authorUsername}
              </span>
              <span className="text-[11px] text-slate-400">{timeAgo(post.createdAt)}</span>
            </div>
          </Link>
          {/* Outside the link: the badge can contain a Retry button */}
          <StatusBadge post={post} isOwner={isOwner} />
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
            aria-label="Post options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 glass-panel rounded-xl py-1 z-20 shadow-glass text-sm">
              <button
                onClick={copyLink}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface"
              >
                <Link2 className="w-4 h-4" /> Copy link
              </button>
              {isOwner && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm("Delete this post? This can't be undone.")) remove.mutate();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-rose-400 hover:bg-surface"
                >
                  <Trash2 className="w-4 h-4" /> Delete post
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div
        className="relative bg-black select-none overflow-hidden break-words"
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={post.mediaUrl}
          alt={post.caption || `Post by ${post.authorUsername}`}
          className="w-full object-cover max-h-[640px]"
          style={{ aspectRatio: String(Math.min(Math.max(post.aspectRatio, 0.8), 1.91)) }}
          loading="lazy"
        />
        {burst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-ping">
            <Heart className="w-24 h-24 text-rose-500 fill-rose-500" />
          </div>
        )}
        {remove.isPending && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="p-4 space-y-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => toggleLike(!post.hasLiked)}
            className={`p-1 -ml-1 transition-transform active:scale-125 ${
              post.hasLiked ? "text-rose-500" : "text-slate-300 hover:text-white"
            }`}
            aria-pressed={post.hasLiked}
            aria-label={post.hasLiked ? "Unlike" : "Like"}
          >
            <Heart className={`w-6 h-6 ${post.hasLiked ? "fill-rose-500" : ""}`} />
          </button>
          <span className="text-sm font-semibold text-white">
            {compactNumber(post.likesCount)} {post.likesCount === 1 ? "like" : "likes"}
          </span>
          {notice && <span className="ml-auto text-xs text-slate-400 truncate">{notice}</span>}
        </div>

        {post.caption && (
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line break-words">
            <Link to={`/u/${post.authorUsername}`} className="font-semibold text-white mr-2">
              {post.authorUsername}
            </Link>
            {post.caption}
          </p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <Link
                key={tag}
                to={`/explore?q=${encodeURIComponent(tag)}`}
                className="flex items-center gap-1 text-[11px] font-medium bg-surface/80 text-pink-300 px-2.5 py-1 rounded-full border border-pink-500/20 hover:border-pink-500/50"
              >
                {post.aiTags.includes(tag) && <Sparkles className="w-3 h-3 text-pink-400" />}#{tag}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
};
