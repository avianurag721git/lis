import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { collectSample, listSamples, rapidScanSample, receiveSample, transitSample } from "./samples.controller";
import { collectSampleSchema, rapidScanSchema, receiveSampleSchema, transitSampleSchema } from "./samples.validation";

const samplesRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

samplesRouter.get("/", ...authed, requirePermission("SAMPLE_RECEIVE", "SAMPLE_COLLECT"), listSamples);
samplesRouter.post("/collect", ...authed, requirePermission("SAMPLE_COLLECT"), validate(collectSampleSchema), collectSample);
samplesRouter.post("/transit", ...authed, requirePermission("SAMPLE_COLLECT"), validate(transitSampleSchema), transitSample);
samplesRouter.post("/receive", ...authed, requirePermission("SAMPLE_RECEIVE"), validate(receiveSampleSchema), receiveSample);
samplesRouter.post("/rapid-scan", ...authed, requirePermission("SAMPLE_COLLECT", "SAMPLE_RECEIVE"), validate(rapidScanSchema), rapidScanSample);

export { samplesRouter };
