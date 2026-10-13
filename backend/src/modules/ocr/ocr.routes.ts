import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { parsePrescription, parsePrescriptionSchema } from "./ocr.controller";

const ocrRouter = Router();

ocrRouter.post("/parse-prescription", authenticate, requireTenant, parsePrescriptionSchema, parsePrescription);

export { ocrRouter };
