import React, { useState } from "react";
import { X, Sparkles, Image as ImageIcon, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { mediaUrl: string; caption: string }) => Promise<void>;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<"idle" | "analyzing" | "passed" | "flagged">("idle");

  if (!isOpen) return null;

  const handleSimulateAiCheck = () => {
    if (!caption) return;
    setAiAnalysisStatus("analyzing");
    setTimeout(() => {
      if (caption.toLowerCase().includes("hate") || caption.toLowerCase().includes("kill")) {
        setAiAnalysisStatus("flagged");
      } else {
        setAiAnalysisStatus("passed");
      }
    }, 600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaUrl) return;

    try {
      setIsSubmitting(true);
      await onSubmit({ mediaUrl, caption });
      setMediaUrl("");
      setCaption("");
      setAiAnalysisStatus("idle");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl glass-panel rounded-2xl border border-surface-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-pink-400" />
            <h3 className="font-heading font-semibold text-lg text-white">Create New Post</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Media URL Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Media Image URL
            </label>
            <div className="flex space-x-2">
              <input
                type="url"
                required
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="flex-1 bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
              <button
                type="button"
                onClick={() =>
                  setMediaUrl(
                    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80"
                  )
                }
                className="px-3 py-2 text-xs font-medium rounded-xl bg-surface border border-surface-border text-slate-300 hover:text-white hover:border-brand-500/50"
              >
                Sample Image
              </button>
            </div>
          </div>

          {/* Media Preview Box */}
          {mediaUrl && (
            <div className="relative rounded-xl overflow-hidden aspect-video bg-black/50 border border-surface-border flex items-center justify-center">
              <img
                src={mediaUrl}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={() => setMediaUrl("")}
              />
            </div>
          )}

          {/* Caption Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Caption & AI Tags
            </label>
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                if (aiAnalysisStatus !== "idle") setAiAnalysisStatus("idle");
              }}
              onBlur={handleSimulateAiCheck}
              placeholder="Write a captivating story... AI will automatically generate CLIP semantic embeddings and safety tags."
              className="w-full bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
            />
          </div>

          {/* AI Pre-Check Pill */}
          {aiAnalysisStatus !== "idle" && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-surface/90 border border-surface-border text-xs">
              {aiAnalysisStatus === "analyzing" && (
                <>
                  <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                  <span className="text-slate-300">AI Guardrail evaluating safety guidelines...</span>
                </>
              )}
              {aiAnalysisStatus === "passed" && (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300 font-medium">
                    Passed AI Moderation. Ready for instant vector indexing.
                  </span>
                </>
              )}
              {aiAnalysisStatus === "flagged" && (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300 font-medium">
                    Warning: Post may require manual moderator review.
                  </span>
                </>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-surface-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !mediaUrl}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-brand text-white font-semibold text-sm shadow-neon hover:opacity-95 disabled:opacity-50 transition-opacity"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Publish Post</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
