import { UserRole } from "../../modules/auth/auth.types";
import type { Permission } from "../../modules/auth/permissions";
import type { SaasRequestContext } from "../../modules/saas/saas.types";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        userId: string;
        email: string;
        role: UserRole;
        tenantId: string;
        permissions: Permission[];
        name?: string;
      };
      tenantId?: string;
      saasContext?: SaasRequestContext;
    }
  }
}

export {};
