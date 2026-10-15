import { z } from "zod";

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z
      .object({
        requestId: z.string().optional(),
        timestamp: z.string().datetime().optional(),
        cursor: z.string().optional(),
        hasMore: z.boolean().optional(),
        total: z.number().int().nonnegative().optional(),
      })
      .optional(),
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  meta: z
    .object({
      requestId: z.string().optional(),
      timestamp: z.string().datetime().optional(),
    })
    .optional(),
});

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
};

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;
