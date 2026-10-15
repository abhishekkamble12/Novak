import React from "react";
import { Plus } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";

const MOCK_STORIES = [
  {
    id: "story-1",
    username: "sophia_ai",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop",
    hasUnseen: true,
  },
  {
    id: "story-2",
    username: "dev_alex",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop",
    hasUnseen: true,
  },
  {
    id: "story-3",
    username: "elena_design",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop",
    hasUnseen: false,
  },
  {
    id: "story-4",
    username: "marcus_cyber",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop",
    hasUnseen: true,
  },
  {
    id: "story-5",
    username: "nova_synth",
    avatarUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop",
    hasUnseen: false,
  },
];

export const StoriesBar: React.FC = () => {
  const { user } = useAuthStore();

  return (
    <div className="w-full glass-panel rounded-2xl p-4 border border-surface-border overflow-x-auto no-scrollbar mb-6">
      <div className="flex items-center space-x-4 min-w-max">
        {/* Current User Story / Add Story */}
        <div className="flex flex-col items-center space-y-1.5 cursor-pointer group">
          <div className="relative">
            <img
              src={user?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"}
              alt="Your story"
              className="w-16 h-16 rounded-full object-cover p-0.5 border-2 border-dashed border-brand-500/50 group-hover:border-brand-500 transition-colors"
            />
            <div className="absolute bottom-0 right-0 p-1 rounded-full bg-brand-500 text-white shadow-neon">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </div>
          <span className="text-xs text-slate-300 font-medium">Your Story</span>
        </div>

        {/* Stories from following */}
        {MOCK_STORIES.map((story) => (
          <div
            key={story.id}
            className="flex flex-col items-center space-y-1.5 cursor-pointer group transition-transform duration-200 hover:scale-105"
          >
            <div
              className={`p-0.5 rounded-full ${
                story.hasUnseen
                  ? "bg-gradient-brand shadow-neon"
                  : "bg-surface-border"
              }`}
            >
              <div className="p-0.5 bg-background rounded-full">
                <img
                  src={story.avatarUrl}
                  alt={story.username}
                  className="w-14 h-14 rounded-full object-cover"
                />
              </div>
            </div>
            <span className="text-xs text-slate-300 font-medium truncate max-w-[70px]">
              {story.username}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
