import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const dashboardQuerySchema = z.object({
  query: z.object({
    from: dateOnly.optional(),
    to: dateOnly.optional()
  })
});
