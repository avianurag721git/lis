import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import {
  bookingIdParamSchema,
  completeTrip,
  getPublicTrack,
  getTripByOrder,
  listActiveTrips,
  orderIdParamSchema,
  startTrip,
  startTripSchema,
  tripIdParamSchema
} from "./logistics.controller";

const logisticsRouter = Router();
const logisticsPublicRouter = Router();

logisticsRouter.post("/trips/start", authenticate, requireTenant, startTripSchema, startTrip);
logisticsRouter.post("/trips/:tripId/complete", authenticate, requireTenant, tripIdParamSchema, completeTrip);
logisticsRouter.get("/trips/active", authenticate, requireTenant, listActiveTrips);
logisticsRouter.get("/trips/by-order/:orderId", authenticate, requireTenant, orderIdParamSchema, getTripByOrder);

logisticsPublicRouter.get("/track/:bookingId", bookingIdParamSchema, getPublicTrack);

export { logisticsRouter, logisticsPublicRouter };
