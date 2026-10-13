import { Router } from "express";
import { authenticate } from "../../../../common/middleware/auth.middleware";
import { requireTenant } from "../../../../common/middleware/tenant.middleware";
import { validate } from "../../../../common/middleware/validate.middleware";
import { getInvoiceById, getInvoicePayments, postInvoice } from "./invoice.controller";
import { createInvoiceBodySchema } from "./invoice.validation";

const invoiceRouter = Router();

invoiceRouter.post("/", authenticate, requireTenant, validate(createInvoiceBodySchema), postInvoice);
invoiceRouter.get("/:id", authenticate, requireTenant, getInvoiceById);
invoiceRouter.get("/:id/payments", authenticate, requireTenant, getInvoicePayments);

export { invoiceRouter };
