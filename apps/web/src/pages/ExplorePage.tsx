import React, { useState } from "react";
import { Search, Sparkles, Zap, Heart, Eye } from "lucide-react";

interface VisualItem {
  id: string;
  url: string;
  title: string;
  author: string;
  likes: number;
  tags: string[];
  score?: number;
}

const EXPLORE_ITEMS: VisualItem[] = [
  {
    id: "exp-1",
    url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
    title: "Fractal geometry in organic motion",
    author: "luna_visuals",
    likes: 812,
    tags: ["geometry", "fractal", "abstract"],
    score: 0.94,
  },
  {
    id: "exp-2",
    url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80",
    title: "Aurora borealis over midnight horizon",
    author: "nordic_lens",
    likes: 1420,
    tags: ["aurora", "nightsky", "nature"],
    score: 0.91,
  },
  {
    id: "exp-3",
    url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=800&q=80",
    title: "Cyberpunk alleyways of Neo-Shinjuku",
    author: "cyber_walker",
    likes: 2150,
    tags: ["cyberpunk", "neon", "tokyo"],
    score: 0.89,
  },
  {
    id: "exp-4",
    url: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
    title: "Oil pastel digital blend portrait",
    author: "art_clara",
    likes: 670,
    tags: ["portrait", "expressionism", "art"],
    score: 0.88,
  },
  {
    id: "exp-5",
    url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
    title: "Majestic alpine waterfall and mist",
    author: "zen_nature",
    likes: 980,
    tags: ["waterfall", "alps", "mist"],
    score: 0.86,
  },
  {
    id: "exp-6",
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    title: "Minimalist concrete architecture with natural sunlight",
    author: "modern_space",
    likes: 1100,
    tags: ["minimalism", "architecture", "concrete"],
    score: 0.85,
  },
];

export const ExplorePage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState("all");
  const [isSearching, setIsSearching] = useState(false);

  const tags = ["all", "cyberpunk", "architecture", "abstract", "nature", "portrait"];

  const filteredItems = EXPLORE_ITEMS.filter((item) => {
    const matchesTag = activeTag === "all" || item.tags.includes(activeTag);
    const matchesQuery =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTag && matchesQuery;
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 300);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header & Semantic Search Bar */}
      <div className="relative glass-panel rounded-2xl p-6 border border-surface-border overflow-hidden">
        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-xs font-semibold text-pink-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Semantic Vector Search</span>
          </div>

          <h2 className="font-heading text-3xl font-extrabold text-white tracking-tight">
            Explore Visuals by <span className="text-gradient">Meaning</span>, Not Just Keywords
          </h2>

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search concepts: 'neon reflections in rain', 'tranquil pine forest'..."
              className="w-full pl-12 pr-28 py-3.5 rounded-xl bg-surface/90 border border-surface-border text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 shadow-glass transition-colors text-sm"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-gradient-brand text-white font-medium text-xs shadow-neon flex items-center space-x-1 hover:opacity-90 transition-opacity"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </form>

          {/* Quick Filter Tag Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTag(t)}
                className={`text-xs font-medium px-3.5 py-1.5 rounded-xl capitalize transition-all ${
                  activeTag === t
                    ? "bg-brand-500 text-white shadow-neon"
                    : "bg-surface/60 border border-surface-border text-slate-400 hover:text-white"
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing {filteredItems.length} results
          {searchQuery && ` for "${searchQuery}"`}
        </span>
        <span className="flex items-center space-x-1 text-pink-400 font-medium">
          <Zap className="w-3.5 h-3.5" />
          <span>Qdrant vector query latency: ~14ms</span>
        </span>
      </div>

      {/* Masonry-Style Image Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="group relative rounded-2xl overflow-hidden glass-panel border border-surface-border aspect-square cursor-pointer transition-transform duration-300 hover:-translate-y-1"
          >
            <img
              src={item.url}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4">
              <div className="flex justify-end">
                {item.score && (
                  <span className="px-2 py-0.5 rounded-full bg-pink-500/80 backdrop-blur-md text-[11px] font-bold text-white shadow-neon">
                    {(item.score * 100).toFixed(0)}% match
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-white line-clamp-1">{item.title}</p>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>@{item.author}</span>
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center space-x-1">
                      <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                      <span>{item.likes}</span>
                    </span>
                    <Eye className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
