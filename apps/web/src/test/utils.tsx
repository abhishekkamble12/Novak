import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PostDto } from "@novak/contracts";

export function renderWithProviders(ui: React.ReactElement, { route = "/" } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

export const makePost = (overrides: Partial<PostDto> = {}): PostDto => ({
  id: "p1",
  authorId: "u1",
  authorUsername: "ada",
  authorName: "Ada",
  caption: "Golden hour on the beach",
  mediaUrl: "https://example.com/a.jpg",
  mediaType: "image",
  aspectRatio: 1,
  tags: [],
  likesCount: 0,
  commentsCount: 0,
  hasLiked: false,
  moderationStatus: "approved",
  processingStatus: "completed",
  searchIndexed: true,
  aiTags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});
