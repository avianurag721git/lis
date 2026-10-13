import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { validate } from "../../common/middleware/validate.middleware";
import { logisticsService } from "./logistics.service";

export const startTripSchema = validate(
  z.object({
    body: z.object({
      orderId: z.string().uuid(),
      destinationAddress: z.string().optional(),
      destinationLat: z.number().optional(),
      destinationLng: z.number().optional()
    })
  })
);

export const tripIdParamSchema = validate(
  z.object({
    params: z.object({ tripId: z.string().uuid() })
  })
);

export const bookingIdParamSchema = validate(
  z.object({
    params: z.object({ bookingId: z.string().uuid() })
  })
);

export const orderIdParamSchema = validate(
  z.object({
    params: z.object({ orderId: z.string().uuid() })
  })
);

export const startTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const trip = await logisticsService.startTrip(req.tenantId, req.body.orderId, req.authUser.userId, {
      destinationAddress: req.body.destinationAddress,
      destinationLat: req.body.destinationLat,
      destinationLng: req.body.destinationLng
    });
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { trip } });
  } catch (err) {
    next(err);
  }
};

export const completeTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const trip = await logisticsService.completeTrip(req.tenantId, req.params.tripId as string);
    res.status(HTTP_STATUS.OK).json({ success: true, data: { trip } });
  } catch (err) {
    next(err);
  }
};

export const listActiveTrips = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const trips = await logisticsService.listActiveTrips(req.tenantId);
    res.status(HTTP_STATUS.OK).json({ success: true, data: { trips } });
  } catch (err) {
    next(err);
  }
};

export const getTripByOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const trip = await logisticsService.getTripByOrder(req.tenantId, req.params.orderId as string);
    res.status(HTTP_STATUS.OK).json({ success: true, data: { trip } });
  } catch (err) {
    next(err);
  }
};

export const getPublicTrack = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const track = await logisticsService.getPublicTrack(req.params.bookingId as string);
    res.status(HTTP_STATUS.OK).json({ success: true, data: track });
  } catch (err) {
    next(err);
  }
};
