import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { UserRole } from "../auth/auth.types";
import { billingService } from "./billing.service";
import { cashierService } from "../cashier/cashier.service";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const createInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId || !req.authUser.role) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const body = req.body as {
      orderId?: string;
      patientId?: string;
      patient?: {
        name?: string;
        phone?: string;
        mobile?: string;
        gender?: "MALE" | "FEMALE" | "OTHER" | null;
        ageYears?: number | null;
      };
      items?: Array<{ itemType: "TEST" | "PACKAGE"; testId?: string; packageId?: string; quantity?: number }>;
      discountMinor?: number;
      taxRatePercent?: number;
      taxExempt?: boolean;
      referredDoctor?: string | null;
      referralDoctorId?: string | null;
      patientGstin?: string | null;
      interstate?: boolean;
      payments?: Array<{
        amountMinor: number;
        method: "CASH" | "UPI" | "CARD" | "TPA" | "ONLINE";
        tpaInsurer?: string | null;
        tpaClaimId?: string | null;
        transactionReference?: string | null;
      }>;
    };

    if (body.orderId) {
      const result = await billingService.createInvoice(
        req.tenantId,
        req.authUser.userId,
        req.authUser.role as UserRole,
        {
          orderId: body.orderId,
          ...(body.discountMinor !== undefined ? { discountMinor: body.discountMinor } : {}),
          ...(body.taxRatePercent !== undefined ? { taxRatePercent: body.taxRatePercent } : {}),
          ...(body.taxExempt !== undefined ? { taxExempt: body.taxExempt } : {}),
          ...(body.patientGstin !== undefined ? { patientGstin: body.patientGstin } : {}),
          ...(body.interstate !== undefined ? { interstate: body.interstate } : {}),
          ...(body.payments !== undefined ? { payments: body.payments } : {}),
          ...(body.referredDoctor !== undefined ? { referredDoctor: body.referredDoctor } : {}),
          ...(body.referralDoctorId !== undefined ? { referralDoctorId: body.referralDoctorId } : {})
        }
      );
      ok(res, result, HTTP_STATUS.CREATED);
      return;
    }

    if (!body.items?.length) {
      throw new AppError("orderId or items required", HTTP_STATUS.BAD_REQUEST, "ORDER_OR_ITEMS_REQUIRED");
    }

    const result = await billingService.createWalkInOrderAndInvoice(
      req.tenantId,
      req.authUser.userId,
      req.authUser.role as UserRole,
      {
        items: body.items,
        ...(body.patientId !== undefined ? { patientId: body.patientId } : {}),
        ...(body.patient !== undefined ? { patient: body.patient } : {}),
        ...(body.discountMinor !== undefined ? { discountMinor: body.discountMinor } : {}),
        ...(body.taxRatePercent !== undefined ? { taxRatePercent: body.taxRatePercent } : {}),
        ...(body.taxExempt !== undefined ? { taxExempt: body.taxExempt } : {}),
        ...(body.referredDoctor !== undefined ? { referredDoctor: body.referredDoctor } : {}),
        ...(body.referralDoctorId !== undefined ? { referralDoctorId: body.referralDoctorId } : {}),
        ...(body.payments !== undefined ? { payments: body.payments } : {})
      }
    );
    ok(res, result, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const approveDiscount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId || !req.authUser.role) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await billingService.approveDiscount(
      req.tenantId,
      req.authUser.userId,
      req.authUser.role as UserRole,
      req.params.orderId!
    );
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const queue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const orders = await cashierService.listUnpaidOrders(req.tenantId, (req.authUser?.role as UserRole) ?? "LAB_MANAGER");
    ok(res, { orders });
  } catch (err) {
    next(err);
  }
};
