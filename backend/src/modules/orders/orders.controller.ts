import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ordersService } from "./orders.service";
import { emitOrderBooked } from "../../realtime/sampleEvents";
import { getOrderPipelineStatus } from "./orderLifecycle.util";
import { routeParam } from "../../common/http/routeParam";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const bookOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const data = await ordersService.book(req.tenantId, req.authUser.userId, req.body);
    emitOrderBooked(req.tenantId, data.order.id);
    ok(res, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const listOrderCatalog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const data = await ordersService.listCatalog(req.tenantId);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const listHomeCollectionOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const data = await ordersService.listHomeCollection(req.tenantId);
    ok(res, { orders: data });
  } catch (err) {
    next(err);
  }
};

export const getOrderPipeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const orderId = routeParam(req.params.orderId);
    if (!orderId) {
      throw new AppError("orderId required", HTTP_STATUS.BAD_REQUEST, "ORDER_ID_REQUIRED");
    }
    const pipeline = await getOrderPipelineStatus(req.tenantId, orderId);
    ok(res, { pipeline });
  } catch (err) {
    if (err instanceof Error && err.message === "ORDER_NOT_FOUND") {
      next(new AppError("Order not found", HTTP_STATUS.NOT_FOUND, "ORDER_NOT_FOUND"));
      return;
    }
    next(err);
  }
};
