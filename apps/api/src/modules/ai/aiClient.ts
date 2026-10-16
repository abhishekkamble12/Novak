import {
  PostAnalyzedResultSchema,
  SemanticSearchResponseSchema,
  type PostAnalyzeJob,
  type PostAnalyzedResult,
  type SemanticSearchResponse,
} from "@novak/contracts";
import { z, type ZodType } from "zod";
import { env } from "../../config/env.js";

export class AiServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

async function request<T>(
  method: "POST" | "DELETE",
  path: string,
  body: unknown,
  schema: ZodType<T>,
  timeoutMs: number
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(new URL(path, env.AI_SERVICE_URL), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AiServiceError(`AI service unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AiServiceError(`AI service responded ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return schema.parse(await res.json());
}

export function analyzePost(job: PostAnalyzeJob): Promise<PostAnalyzedResult> {
  return request("POST", "/api/v1/analyze-post", job, PostAnalyzedResultSchema, env.AI_REQUEST_TIMEOUT_MS);
}

export function semanticSearch(
  query: string,
  limit: number,
  filterTag?: string
): Promise<SemanticSearchResponse> {
  // Search is interactive: fail fast and let the caller fall back to keyword search
  return request("POST", "/api/v1/search", { query, limit, filterTag }, SemanticSearchResponseSchema, 5000);
}

export async function deletePostVector(postId: string): Promise<void> {
  await request("DELETE", `/api/v1/posts/${encodeURIComponent(postId)}`, undefined, z.unknown(), 5000);
}
