import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  getProfile,
  getReviewQueue,
  putProfile,
  rejectRerun,
  verifyBatch,
  verifySingle
} from "./pathologist.controller";

const verifySingleSchema = z.object({
  body: z.object({
    labResultId: z.string().uuid(),
    digitalSignatureUrl: z.string().min(1).max(2000).optional().nullable(),
    medicalLicenseNumber: z.string().min(2).max(80).optional().nullable(),
    pathologistName: z.string().min(2).max(120).optional().nullable(),
    clinicalImpression: z.string().trim().max(2000).optional().nullable()
  })
});

const verifyBatchSchema = z.object({
  body: z
    .object({
      orderIds: z.array(z.string().uuid()).optional(),
      labResultIds: z.array(z.string().uuid()).optional(),
      digitalSignatureUrl: z.string().min(1).max(2000).optional().nullable(),
      medicalLicenseNumber: z.string().min(2).max(80).optional().nullable(),
      pathologistName: z.string().min(2).max(120).optional().nullable()
    })
    .refine((b) => (b.orderIds?.length ?? 0) > 0 || (b.labResultIds?.length ?? 0) > 0, {
      message: "orderIds or labResultIds required"
    })
});

const rejectSchema = z.object({
  body: z.object({
    labResultId: z.string().uuid(),
    note: z.string().trim().min(3).max(2000)
  })
});

const profileSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    medicalLicenseNumber: z.string().trim().min(2).max(80),
    digitalSignatureUrl: z.string().min(1).max(2000).optional().nullable()
  })
});

const pathologistRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

pathologistRouter.get("/review-queue", ...authed, requirePermission("PATHOLOGIST_VERIFY"), getReviewQueue);
pathologistRouter.post("/verify-single", ...authed, requirePermission("PATHOLOGIST_VERIFY"), validate(verifySingleSchema), verifySingle);
pathologistRouter.post("/verify-batch", ...authed, requirePermission("PATHOLOGIST_VERIFY"), validate(verifyBatchSchema), verifyBatch);
pathologistRouter.post("/reject-rerun", ...authed, requirePermission("PATHOLOGIST_VERIFY"), validate(rejectSchema), rejectRerun);
pathologistRouter.get("/profile", ...authed, requirePermission("PATHOLOGIST_VERIFY"), getProfile);
pathologistRouter.put("/profile", ...authed, requirePermission("PATHOLOGIST_VERIFY"), validate(profileSchema), putProfile);

export { pathologistRouter };
