import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  frequentReferralDoctors,
  quickAddReferralDoctor,
  searchReferralDoctors
} from "./referralDoctors.controller";
import { quickAddReferralDoctorSchema, searchReferralDoctorsSchema } from "./referralDoctors.validation";

const referralDoctorsRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;
const canBook = requirePermission("ORDER_CREATE", "BILLING_CREATE");

referralDoctorsRouter.get("/search", ...authed, canBook, validate(searchReferralDoctorsSchema), searchReferralDoctors);
referralDoctorsRouter.get("/frequent", ...authed, canBook, frequentReferralDoctors);
referralDoctorsRouter.post(
  "/quick-add",
  ...authed,
  canBook,
  validate(quickAddReferralDoctorSchema),
  quickAddReferralDoctor
);

export { referralDoctorsRouter };
