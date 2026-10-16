import React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImageOff } from "lucide-react";
import { PostCard } from "../components/feed/PostCard";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { errorMessage, isNotFound, postsApi } from "../lib/api";
import { postKeys } from "../lib/postCache";

export const PostPage: React.FC = () => {
  const id = useParams().id ?? "";
  const valid = /^[a-f0-9]{24}$/i.test(id);
  const post = useQuery({
    queryKey: postKeys.detail(id),
    queryFn: () => postsApi.get(id),
    enabled: valid,
  });

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to feed
      </Link>
      {!valid || isNotFound(post.error) ? (
        <EmptyState icon={<ImageOff className="w-6 h-6" />} title="Post not found">
          <p>It may have been deleted, or the link is wrong.</p>
        </EmptyState>
      ) : post.isPending ? (
        <Spinner />
      ) : post.isError ? (
        <ErrorState message={errorMessage(post.error)} onRetry={() => post.refetch()} />
      ) : (
        <PostCard post={post.data} />
      )}
    </div>
  );
};
