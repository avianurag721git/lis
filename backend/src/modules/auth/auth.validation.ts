import { z } from "zod";
import { REGISTER_ROLES } from "./permissions";

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email(),
    password: z.string().min(8).max(72),
    role: z.enum(REGISTER_ROLES)
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(72)
  })
});

/** Refresh token may come from HttpOnly cookie; body is optional. */
export const refreshSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().min(20).optional()
    })
    .optional()
    .default({})
});
