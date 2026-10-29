import { NextFunction, Request, Response } from "express";
import fs from "fs";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { UserRole } from "../auth/auth.types";
import { cashierService } from "./cashier.service";
import { routeParam } from "../../common/http/routeParam";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

const roleOf = (req: Request): UserRole => (req.authUser?.role as UserRole) ?? "STAFF";

export const listCashierQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const orders = await cashierService.listUnpaidOrders(req.tenantId, roleOf(req));
    ok(res, { orders });
  } catch (err) {
    next(err);
  }
};

export const getCashierBill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const bill = await cashierService.getBill(req.tenantId, routeParam(req.params.orderId)!, roleOf(req));
    ok(res, { bill });
  } catch (err) {
    next(err);
  }
};

export const adjustCashierBill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const bill = await cashierService.adjustItems(req.tenantId, req.authUser.userId, roleOf(req), {
      orderId: routeParam(req.params.orderId)!,
      ...req.body
    });
    ok(res, { bill });
  } catch (err) {
    next(err);
  }
};

export const createCashierInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await cashierService.createTaxInvoice(
      req.tenantId,
      req.authUser.userId,
      roleOf(req),
      routeParam(req.params.orderId)!,
      req.body
    );
    ok(res, result, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const collectCashierPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await cashierService.collectPayment(req.tenantId, req.authUser.userId, roleOf(req), {
      orderId: routeParam(req.params.orderId)!,
      ...req.body
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const listCashierPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const payments = await cashierService.listPayments(req.tenantId, routeParam(req.params.orderId)!);
    ok(res, { payments });
  } catch (err) {
    next(err);
  }
};

export const downloadCashierInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const { filePath, fileName } = await cashierService.getInvoicePdfPath(req.tenantId, routeParam(req.params.orderId)!);
    const buf = await fs.promises.readFile(filePath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.status(HTTP_STATUS.OK).send(buf);
  } catch (err) {
    next(err);
  }
};

export const listCashierInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const invoices = await cashierService.listInvoices(req.tenantId, {
      ...(q !== undefined ? { q } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(limitRaw !== undefined && Number.isFinite(limitRaw) ? { limit: limitRaw } : {})
    });
    ok(res, { invoices });
  } catch (err) {
    next(err);
  }
};
