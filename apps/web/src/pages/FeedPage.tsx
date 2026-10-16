import React from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { PostCard } from "../components/feed/PostCard";
import { AboutCard, SuggestedCreators, TrendingTags } from "../components/feed/Sidebar";
import { LoadMore } from "../components/ui/LoadMore";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { errorMessage, postsApi } from "../lib/api";
import { postKeys } from "../lib/postCache";
import { useAuthStore } from "../store/useAuthStore";

export const FeedPage: React.FC<{ onCreate: () => void }> = ({ onCreate }) => {
  const signedIn = useAuthStore((s) => s.status === "authenticated");
  const feed = useInfiniteQuery({
    queryKey: postKeys.feed,
    queryFn: ({ pageParam }) => postsApi.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {feed.isPending ? (
          <Spinner label="Loading your feed…" />
        ) : feed.isError ? (
          <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState icon={<ImagePlus className="w-6 h-6" />} title="No posts yet">
            <p>Be the first to share something. AI will tag it and make it searchable.</p>
            {signedIn ? (
              <button
                onClick={onCreate}
                className="px-4 py-2 rounded-xl bg-gradient-brand text-white text-sm font-semibold shadow-neon"
              >
                Create a post
              </button>
            ) : (
              <Link
                to="/auth"
                className="inline-block px-4 py-2 rounded-xl bg-gradient-brand text-white text-sm font-semibold shadow-neon"
              >
                Sign in to post
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
            <LoadMore
              hasMore={feed.hasNextPage}
              loading={feed.isFetchingNextPage}
              onLoadMore={() => void feed.fetchNextPage()}
            />
          </>
        )}
      </div>

      <aside className="hidden lg:flex flex-col gap-6 sticky top-6 self-start">
        <SuggestedCreators />
        <TrendingTags />
        <AboutCard />
      </aside>
    </div>
  );
};
