import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { validate } from "../../common/middleware/validate.middleware";
import { ocrService } from "./ocr.service";

export const parsePrescriptionSchema = validate(
  z.object({
    body: z.object({
      base64: z.string().min(100),
      mimeType: z.string().optional()
    })
  })
);

export const parsePrescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const result = await ocrService.parsePrescription(req.tenantId, req.body);
    res.status(HTTP_STATUS.OK).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
