import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { bookOrder, getOrderPipeline, listHomeCollectionOrders, listOrderCatalog } from "./orders.controller";
import { bookOrderSchema } from "./orders.validation";
import { z } from "zod";

const orderIdParams = z.object({ params: z.object({ orderId: z.string().uuid() }) });

const ordersRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

ordersRouter.get("/catalog", ...authed, requirePermission("ORDER_CREATE"), listOrderCatalog);
ordersRouter.get("/home-collection", ...authed, requirePermission("ORDER_CREATE", "SAMPLE_COLLECT"), listHomeCollectionOrders);
ordersRouter.get("/:orderId/pipeline", ...authed, requirePermission("ORDER_CREATE", "SAMPLE_COLLECT", "SAMPLE_RECEIVE", "RESULT_ENTRY", "PATHOLOGIST_VERIFY"), validate(orderIdParams), getOrderPipeline);
ordersRouter.post("/book", ...authed, requirePermission("ORDER_CREATE"), validate(bookOrderSchema), bookOrder);

export { ordersRouter };
