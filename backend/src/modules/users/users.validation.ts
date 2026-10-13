import { z } from "zod";
import { PERMISSIONS } from "../auth/permissions";

export const patchUserPermissionsSchema = z.object({
  params: z.object({
    userId: z.string().min(1)
  }),
  body: z.object({
    permissions: z.array(z.enum(PERMISSIONS))
  })
});

export const roleDefaultsParamsSchema = z.object({
  params: z.object({
    role: z.string().min(1)
  })
});

export const listUsersQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    role: z.string().optional()
  })
});
