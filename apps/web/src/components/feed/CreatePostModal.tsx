import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { errorMessage, postsApi } from "../../lib/api";
import { parseTags } from "../../lib/format";
import { postKeys } from "../../lib/postCache";
import { uploadImage, uploadsEnabled } from "../../lib/upload";
import { useAuthStore } from "../../store/useAuthStore";

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ isOpen, onClose }) => {
  const qc = useQueryClient();
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [aspectRatio, setAspectRatio] = useState(1);
  const [previewState, setPreviewState] = useState<"idle" | "ok" | "broken">("idle");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMediaUrl("");
    setCaption("");
    setTagsInput("");
    setAspectRatio(1);
    setPreviewState("idle");
    setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      postsApi.create({
        mediaUrl: mediaUrl.trim(),
        caption: caption.trim(),
        mediaType: "image",
        aspectRatio,
        tags: parseTags(tagsInput),
      }),
    onSuccess: (post) => {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setUser({ ...user, postsCount: user.postsCount + 1 });
      void qc.invalidateQueries({ queryKey: postKeys.all });
      void qc.invalidateQueries({ queryKey: ["users"] });
      qc.setQueryData(postKeys.detail(post.id), post);
      reset();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !create.isPending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, create.isPending]);

  if (!isOpen) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setPreviewState("idle");
      setMediaUrl(await uploadImage(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const urlValid = /^https:\/\/\S+$/.test(mediaUrl.trim());
  const canSubmit = urlValid && previewState === "ok" && !create.isPending && !uploading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!urlValid) return setError("Image URL must start with https://");
    if (previewState !== "ok") return setError("That image couldn't be loaded. Check the URL.");
    create.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && !create.isPending && onClose()}
    >
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto glass-panel rounded-2xl shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-post-title"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pink-400" />
            <h3 id="create-post-title" className="font-heading font-semibold text-lg text-white">
              Create new post
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="media-url" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Image
            </label>
            <div className="flex gap-2">
              <input
                id="media-url"
                type="url"
                value={mediaUrl}
                onChange={(e) => {
                  setMediaUrl(e.target.value);
                  setPreviewState("idle");
                }}
                placeholder="https://images.unsplash.com/..."
                className="flex-1 min-w-0 bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              {uploadsEnabled && (
                <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-surface border border-surface-border text-slate-300 hover:text-white hover:border-brand-500/50 cursor-pointer">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {uploadsEnabled ? "Paste a public https image URL or upload a file." : "Paste a public https image URL."}
            </p>
          </div>

          {urlValid && (
            <div className="relative rounded-xl overflow-hidden bg-black/50 border border-surface-border flex items-center justify-center min-h-[160px]">
              {previewState === "broken" ? (
                <p className="text-xs text-amber-300 p-6">This image couldn't be loaded.</p>
              ) : (
                <img
                  key={mediaUrl}
                  src={mediaUrl.trim()}
                  alt="Preview"
                  className="w-full max-h-80 object-contain"
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    if (w && h) setAspectRatio(Math.min(Math.max(w / h, 0.1), 10));
                    setPreviewState("ok");
                  }}
                  onError={() => setPreviewState("broken")}
                />
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="caption" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Caption
            </label>
            <textarea
              id="caption"
              rows={3}
              maxLength={2200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption… it is indexed so Explore can find your post by meaning."
              className="w-full bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tags" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Tags <span className="normal-case font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="travel, sunset, film"
              className="w-full bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-brand text-white font-semibold text-sm shadow-neon hover:opacity-95 disabled:opacity-50"
            >
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {create.isPending ? "Publishing…" : "Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
