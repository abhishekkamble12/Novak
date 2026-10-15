import React, { useState } from "react";
import { StoriesBar } from "../components/feed/StoriesBar";
import { PostCard } from "../components/feed/PostCard";
import { Post } from "../types";
import { Sparkles, TrendingUp, UserPlus } from "lucide-react";

const INITIAL_POSTS: Post[] = [
  {
    id: "post-1",
    authorId: "user-1",
    authorUsername: "elena_design",
    authorAvatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150",
    caption: "Late night generative art explorations. Blending neon aesthetics with algorithmic symmetry 🎨✨ #digitalart #generative #cyberpunk",
    mediaUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
    mediaType: "image",
    aspectRatio: 1.2,
    likesCount: 342,
    commentsCount: 28,
    hasLiked: false,
    hasSaved: false,
    moderationStatus: "approved",
    aiTags: ["generative", "neon", "abstract", "digital-art"],
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: "post-2",
    authorId: "user-2",
    authorUsername: "marcus_cyber",
    authorAvatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
    caption: "Sunset overlooking the futuristic architectural landscape. What a vibe. 🌆",
    mediaUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80",
    mediaType: "image",
    aspectRatio: 1.0,
    likesCount: 890,
    commentsCount: 64,
    hasLiked: true,
    hasSaved: true,
    moderationStatus: "approved",
    aiTags: ["cityscape", "architecture", "sunset", "skyline"],
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
  {
    id: "post-3",
    authorId: "user-3",
    authorUsername: "sophia_ai",
    authorAvatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    caption: "Exploring deep sea bioluminescence through the lens of multimodal neural vision 🌊💡",
    mediaUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
    mediaType: "image",
    aspectRatio: 1.3,
    likesCount: 1250,
    commentsCount: 112,
    hasLiked: false,
    hasSaved: false,
    moderationStatus: "approved",
    aiTags: ["bioluminescence", "ocean", "deepsea", "underwater"],
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

const SUGGESTED_CREATORS = [
  {
    username: "crypto_vision",
    name: "Alex Vance",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120",
    badge: "AI Creator",
  },
  {
    username: "luna_visuals",
    name: "Luna Croft",
    avatarUrl: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120",
    badge: "Trending",
  },
  {
    username: "zen_coder",
    name: "Dev Zen",
    avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120",
    badge: "Pro",
  },
];

export const FeedPage: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);

  const handleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, hasLiked: !p.hasLiked } : p
      )
    );
  };

  const handleSave = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, hasSaved: !p.hasSaved } : p
      )
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main Feed Column */}
      <div className="lg:col-span-2">
        <StoriesBar />
        <div className="space-y-6">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={handleLike}
              onSave={handleSave}
            />
          ))}
        </div>
      </div>

      {/* Right Sidebar Suggestions & Trends */}
      <aside className="hidden lg:flex flex-col space-y-6">
        {/* Suggested Creators */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-heading font-semibold text-sm text-white">
              Suggested Creators
            </h4>
            <button className="text-xs text-brand-400 hover:text-brand-300 font-medium">
              See All
            </button>
          </div>

          <div className="space-y-4">
            {SUGGESTED_CREATORS.map((creator) => (
              <div
                key={creator.username}
                className="flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={creator.avatarUrl}
                    alt={creator.name}
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-surface-border"
                  />
                  <div>
                    <p className="text-xs font-semibold text-white truncate max-w-[110px]">
                      {creator.username}
                    </p>
                    <span className="text-[10px] text-pink-400 font-medium">
                      {creator.badge}
                    </span>
                  </div>
                </div>
                <button className="flex items-center space-x-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-surface border border-surface-border hover:border-brand-500/50 hover:text-brand-300 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Follow</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* AI Semantic Trends */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border">
          <div className="flex items-center space-x-2 mb-4">
            <TrendingUp className="w-4 h-4 text-pink-400" />
            <h4 className="font-heading font-semibold text-sm text-white">
              Trending AI Clusters
            </h4>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              "cyberpunk-tokyo",
              "generative-3d",
              "synthwave",
              "minimalism",
              "deep-sea",
              "architectural-render",
            ].map((trend) => (
              <span
                key={trend}
                className="text-xs font-medium px-3 py-1.5 rounded-xl bg-surface/80 border border-surface-border text-slate-300 hover:text-white hover:border-brand-500/40 cursor-pointer transition-colors"
              >
                #{trend}
              </span>
            ))}
          </div>
        </div>

        {/* System & Architecture Info Badge */}
        <div className="p-4 rounded-xl bg-surface/40 border border-surface-border text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center space-x-1.5 text-pink-400 font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Lumen v1.0 Core</span>
          </div>
          <p>MERN + FastAPI + Qdrant Vector Engine with CLIP 512-dim multimodal embeddings.</p>
        </div>
      </aside>
    </div>
  );
};
