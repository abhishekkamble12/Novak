import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Camera, Loader2, Pencil, UserX } from "lucide-react";
import type { UserSummary } from "@novak/contracts";
import { PostGrid } from "../components/feed/PostGrid";
import { Avatar } from "../components/ui/Avatar";
import { LoadMore } from "../components/ui/LoadMore";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { errorMessage, isNotFound, usersApi } from "../lib/api";
import { postKeys } from "../lib/postCache";
import { useAuthStore } from "../store/useAuthStore";

const inputClass =
  "w-full bg-surface border border-surface-border rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500";

const EditProfile: React.FC<{ user: UserSummary; onDone: () => void }> = ({ user, onDone }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: user.name, bio: user.bio ?? "", avatarUrl: user.avatarUrl ?? "" });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      usersApi.updateMe({ name: form.name.trim(), bio: form.bio.trim(), avatarUrl: form.avatarUrl.trim() }),
    onSuccess: (updated) => {
      useAuthStore.getState().setUser(updated);
      qc.setQueryData(["users", updated.username], updated);
      // Author name/avatar are embedded in every post
      void qc.invalidateQueries({ queryKey: postKeys.all });
      onDone();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate();
      }}
      className="w-full space-y-3"
    >
      <input
        className={inputClass}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        maxLength={60}
        required
        placeholder="Name"
        aria-label="Name"
      />
      <textarea
        className={`${inputClass} resize-none`}
        rows={2}
        value={form.bio}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
        maxLength={160}
        placeholder="Bio"
        aria-label="Bio"
      />
      <div className="relative">
        <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          className={`${inputClass} pl-9`}
          type="url"
          value={form.avatarUrl}
          onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
          placeholder="Avatar image URL (https)"
          aria-label="Avatar URL"
        />
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-brand text-white text-sm font-semibold disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export const ProfilePage: React.FC = () => {
  const username = (useParams().username ?? "").toLowerCase();
  const viewer = useAuthStore((s) => s.user);
  const isMe = viewer?.username === username;
  const [editing, setEditing] = useState(false);

  const profile = useQuery({
    queryKey: ["users", username],
    queryFn: () => usersApi.get(username),
    enabled: Boolean(username),
  });

  const posts = useInfiniteQuery({
    queryKey: postKeys.user(username),
    queryFn: ({ pageParam }) => usersApi.posts(username, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: profile.isSuccess,
  });

  if (profile.isPending) return <Spinner label="Loading profile…" />;
  if (profile.isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        {isNotFound(profile.error) ? (
          <EmptyState icon={<UserX className="w-6 h-6" />} title="User not found">
            <p>@{username} doesn't exist or was removed.</p>
          </EmptyState>
        ) : (
          <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />
        )}
      </div>
    );
  }

  // The signed-in user's own record is the freshest copy (post count, edits)
  const user = isMe && viewer ? viewer : profile.data;
  const items = posts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      <section className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <Avatar src={user.avatarUrl} name={user.name} size="xl" />
        <div className="flex-1 min-w-0 text-center sm:text-left space-y-2 w-full">
          {editing ? (
            <EditProfile user={user} onDone={() => setEditing(false)} />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h1 className="font-heading text-2xl font-bold text-white truncate">{user.name}</h1>
                {isMe && (
                  <button
                    onClick={() => setEditing(true)}
                    className="self-center sm:self-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-surface border border-surface-border hover:border-brand-500/50"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit profile
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-400">@{user.username}</p>
              {user.bio && <p className="text-sm text-slate-200 whitespace-pre-line">{user.bio}</p>}
              <div className="flex items-center justify-center sm:justify-start gap-5 text-sm text-slate-300 pt-1">
                <span>
                  <strong className="text-white">{user.postsCount}</strong>{" "}
                  {user.postsCount === 1 ? "post" : "posts"}
                </span>
                <span className="flex items-center gap-1 text-slate-400 text-xs">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Joined{" "}
                  {new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {posts.isPending ? (
        <Spinner />
      ) : posts.isError ? (
        <ErrorState message={errorMessage(posts.error)} onRetry={() => posts.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Camera className="w-6 h-6" />} title="No posts yet">
          {isMe && <p>Your posts will show up here.</p>}
        </EmptyState>
      ) : (
        <>
          <PostGrid posts={items} />
          <LoadMore
            hasMore={posts.hasNextPage}
            loading={posts.isFetchingNextPage}
            onLoadMore={() => void posts.fetchNextPage()}
          />
        </>
      )}
    </div>
  );
};
