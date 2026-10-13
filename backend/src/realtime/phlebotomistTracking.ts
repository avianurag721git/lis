import { Server, Socket } from "socket.io";
import { logger } from "../common/logger/logger";
import { logisticsService } from "../modules/logistics/logistics.service";
import { LocationUpdatePayload } from "../modules/logistics/logistics.types";

let ioRef: Server | null = null;

export const registerPhlebotomistTracking = (io: Server): void => {
  ioRef = io;

  io.on("connection", (socket: Socket) => {
    socket.on("join-trip", (bookingId: string) => {
      if (typeof bookingId === "string" && bookingId.trim()) {
        void socket.join(`trip:${bookingId.trim()}`);
      }
    });

    socket.on("join-trip-ops", (tenantId: string) => {
      if (typeof tenantId === "string" && tenantId.trim()) {
        void socket.join(`trip-ops:${tenantId.trim()}`);
      }
    });

    socket.on(
      "phleb:location-update",
      async (payload: {
        tenantId?: string;
        tripId?: string;
        orderId?: string;
        latitude?: number;
        longitude?: number;
      }) => {
        const tenantId = payload.tenantId?.trim();
        const tripId = payload.tripId?.trim();
        const lat = payload.latitude;
        const lng = payload.longitude;
        if (!tenantId || !tripId || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }
        try {
          const { trip, etaMinutes, distanceKm } = await logisticsService.updateLocation(
            tenantId,
            tripId,
            lat,
            lng
          );
          const update: LocationUpdatePayload = {
            tripId: trip.id,
            latitude: lat,
            longitude: lng,
            recordedAt: new Date().toISOString(),
            etaMinutes,
            distanceKm
          };
          emitTripLocation(trip.orderId, tenantId, update);
        } catch (err) {
          logger.warn({ err, tripId }, "phleb:location-update failed");
        }
      }
    );

    socket.on(
      "phleb:trip-started",
      (payload: { tenantId?: string; orderId?: string; tripId?: string }) => {
        const tenantId = payload.tenantId?.trim();
        const orderId = payload.orderId?.trim();
        if (!tenantId || !orderId) return;
        io.to(`trip-ops:${tenantId}`).emit("trip:started", {
          success: true,
          data: { orderId, tripId: payload.tripId, at: new Date().toISOString() }
        });
        io.to(`trip:${orderId}`).emit("trip:started", {
          success: true,
          data: { orderId, tripId: payload.tripId, at: new Date().toISOString() }
        });
      }
    );

    socket.on(
      "phleb:trip-completed",
      async (payload: { tenantId?: string; tripId?: string; orderId?: string }) => {
        const tenantId = payload.tenantId?.trim();
        const tripId = payload.tripId?.trim();
        const orderId = payload.orderId?.trim();
        if (!tenantId || !tripId) return;
        try {
          const trip = await logisticsService.completeTrip(tenantId, tripId);
          const oid = orderId ?? trip.orderId;
          io.to(`trip:${oid}`).emit("trip:completed", { success: true, data: { orderId: oid } });
          io.to(`trip-ops:${tenantId}`).emit("trip:completed", { success: true, data: { orderId: oid } });
        } catch (err) {
          logger.warn({ err, tripId }, "phleb:trip-completed failed");
        }
      }
    );
  });
};

export const emitTripLocation = (
  bookingId: string,
  tenantId: string,
  update: LocationUpdatePayload
): void => {
  if (!ioRef) return;
  ioRef.to(`trip:${bookingId}`).emit("trip:location", { success: true, data: update });
  ioRef.to(`trip-ops:${tenantId}`).emit("trip:location", {
    success: true,
    data: { ...update, bookingId }
  });
};
