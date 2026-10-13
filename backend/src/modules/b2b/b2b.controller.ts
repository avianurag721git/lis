import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { b2bService } from "./b2b.service";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const listFranchisees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const franchisees = await b2bService.listFranchisees(req.tenantId);
    ok(res, { franchisees });
  } catch (err) {
    next(err);
  }
};

export const upsertFranchisee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const franchisee = await b2bService.upsertFranchisee(req.tenantId, req.body);
    ok(res, { franchisee }, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const getFranchisee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const franchisee = await b2bService.getFranchisee(req.tenantId, req.params.franchiseeId!);
    ok(res, { franchisee });
  } catch (err) {
    next(err);
  }
};

export const getRateCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const rateCard = await b2bService.getRateCard(req.tenantId, req.params.franchiseeId!);
    ok(res, { rateCard });
  } catch (err) {
    next(err);
  }
};

export const setRateCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const rateCard = await b2bService.setPrices(req.tenantId, req.params.franchiseeId!, req.body);
    ok(res, { rateCard });
  } catch (err) {
    next(err);
  }
};

export const listWallet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const franchisee = await b2bService.getFranchisee(req.tenantId, req.params.franchiseeId!);
    const txOpts: { from?: string; to?: string } = {};
    if (from) txOpts.from = from;
    if (to) txOpts.to = to;
    const transactions = await b2bService.listWalletTx(req.tenantId, req.params.franchiseeId!, txOpts);
    ok(res, { franchisee, transactions });
  } catch (err) {
    next(err);
  }
};

export const createRecharge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const franchiseeId = (req.params.franchiseeId || req.body.franchiseeId) as string;
    const result = await b2bService.createWalletRecharge(
      req.tenantId,
      req.authUser.userId,
      franchiseeId,
      req.body.amountMinor,
      req.body.gateway ?? "STRIPE"
    );
    ok(res, { recharge: result });
  } catch (err) {
    next(err);
  }
};

export const confirmRecharge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const franchisee = await b2bService.confirmWalletRecharge(
      req.tenantId,
      req.authUser.userId,
      req.params.franchiseeId!,
      req.body.amountMinor,
      req.body.gateway,
      req.body.gatewayRef
    );
    ok(res, { franchisee });
  } catch (err) {
    next(err);
  }
};

export const bulkUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const franchiseeId = (req.params.franchiseeId || req.body.franchiseeId) as string;
    const csvText = typeof req.body.csv === "string" ? req.body.csv : "";
    const result = await b2bService.parseBulkCsv(req.tenantId, req.authUser.userId, franchiseeId, csvText);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const createB2BOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await b2bService.createOrder(req.tenantId, req.authUser.userId, req.body);
    ok(res, result, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const getLedger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const franchiseeId = req.params.franchiseeId!;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "json";

    const range: { from?: string; to?: string } = {};
    if (from) range.from = from;
    if (to) range.to = to;

    if (format === "csv") {
      const csv = await b2bService.exportLedgerCsv(req.tenantId, franchiseeId, range);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="ledger-${franchiseeId}.csv"`);
      res.status(HTTP_STATUS.OK).send(csv);
      return;
    }
    if (format === "pdf") {
      const pdf = await b2bService.exportLedgerPdf(req.tenantId, franchiseeId, range);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="ledger-${franchiseeId}.pdf"`);
      res.status(HTTP_STATUS.OK).send(pdf);
      return;
    }

    const ledger = await b2bService.getLedger(req.tenantId, franchiseeId, range);
    ok(res, { ledger });
  } catch (err) {
    next(err);
  }
};

export const walletWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.headers["stripe-signature"] as string | undefined;
    const gatewayHint = req.headers["x-razorpay-event-id"] ? "RAZORPAY" : undefined;
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const result = await b2bService.processWalletWebhook(raw, signature, gatewayHint);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};
