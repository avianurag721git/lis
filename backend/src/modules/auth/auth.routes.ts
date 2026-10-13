import { Router } from "express";
import {
  authCredentialRateLimiter,
  authSessionRateLimiter
} from "../../common/middleware/rateLimit.middleware";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { login, logout, me, refresh, register } from "./auth.controller";
import { loginSchema, refreshSchema, registerSchema } from "./auth.validation";

const authRouter = Router();

authRouter.post("/register", authCredentialRateLimiter, requireTenant, validate(registerSchema), register);
authRouter.post("/login", authCredentialRateLimiter, requireTenant, validate(loginSchema), login);
authRouter.post("/refresh", authSessionRateLimiter, validate(refreshSchema), refresh);
authRouter.get("/me", authenticate, requireTenant, me);
authRouter.post("/logout", authSessionRateLimiter, authenticate, requireTenant, logout);

export { authRouter };
