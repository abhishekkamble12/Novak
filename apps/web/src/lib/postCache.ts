import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PostDto, SearchResponse } from "@novak/contracts";
import type { Page } from "./api";

/**
 * Every query holding posts lives under the "posts" key prefix, in one of three shapes:
 * infinite pages (feed, profile grid), a search response, or a single post.
 */
export const postKeys = {
  all: ["posts"] as const,
  feed: ["posts", "feed"] as const,
  user: (username: string) => ["posts", "user", username] as const,
  detail: (id: string) => ["posts", "detail", id] as const,
  search: (q: string, tag?: string) => ["posts", "search", q, tag ?? null] as const,
};

type PostsData = InfiniteData<Page<PostDto>> | SearchResponse | PostDto;

function mapPosts(data: PostsData, fn: (post: PostDto) => PostDto | null): PostsData {
  const apply = (posts: PostDto[]) => posts.map(fn).filter((p): p is PostDto => p !== null);

  if ("pages" in data) {
    return { ...data, pages: data.pages.map((pg) => ({ ...pg, items: apply(pg.items) })) };
  }
  if ("results" in data) {
    return { ...data, results: apply(data.results) };
  }
  return fn(data) ?? data;
}

export function updatePost(qc: QueryClient, id: string, patch: (post: PostDto) => PostDto) {
  qc.setQueriesData<PostsData>({ queryKey: postKeys.all }, (data) =>
    data ? mapPosts(data, (p) => (p.id === id ? patch(p) : p)) : data
  );
}

export function removePost(qc: QueryClient, id: string) {
  qc.setQueriesData<PostsData>({ queryKey: postKeys.all }, (data) =>
    data ? mapPosts(data, (p) => (p.id === id ? null : p)) : data
  );
  qc.removeQueries({ queryKey: postKeys.detail(id) });
}
