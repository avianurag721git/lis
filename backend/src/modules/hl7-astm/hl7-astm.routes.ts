import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AppError } from "../../common/errors/AppError";
import { analyzerIngestService } from "./analyzerIngest.service";
import { env } from "../../config/env";

const ingestSchema = z.object({
  body: z.object({
    raw: z.string().min(10).max(500_000),
    tenantId: z.string().min(1).max(80).optional()
  })
});

/**
 * HTTP helpers for simulator / debugging (TCP gateway is primary path).
 */
export const hl7AstmRouter = Router();

hl7AstmRouter.get("/health", (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      enabled: env.analyzerGatewayEnabled,
      tcpPort: env.analyzerTcpPort,
      defaultTenantId: env.analyzerDefaultTenantId,
      protocols: ["HL7_v2_MLLP", "ASTM_E1394"]
    }
  });
});

hl7AstmRouter.post("/ingest", authenticate, requireTenant, validate(ingestSchema), async (req, res, next) => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const result = await analyzerIngestService.ingestRaw(req.tenantId, req.body.raw);
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { ingest: result } });
  } catch (err) {
    next(err);
  }
});
