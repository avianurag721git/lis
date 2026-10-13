import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { logger } from "../common/logger/logger";
import { env } from "../config/env";
import { Sample } from "../modules/orders/orders.types";
import { registerPhlebotomistTracking } from "./phlebotomistTracking";

let io: Server | null = null;

export const initRealtime = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins,
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    socket.on("join-tenant", (tenantId: string) => {
      if (typeof tenantId === "string" && tenantId.trim()) {
        void socket.join(`tenant:${tenantId.trim()}`);
      }
    });
    socket.on("join-order", (orderId: string) => {
      if (typeof orderId === "string" && orderId.trim()) {
        void socket.join(`order:${orderId.trim()}`);
      }
    });
  });

  registerPhlebotomistTracking(io);

  logger.info("Socket.io realtime ready");
  return io;
};

export const emitDashboardStatsUpdate = (
  tenantId: string,
  reason: string,
  extra?: Record<string, unknown>
): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("dashboard:stats-update", {
    success: true,
    data: {
      reason,
      at: new Date().toISOString(),
      ...(extra ?? {})
    }
  });
};

export const emitSampleUpdated = (tenantId: string, sample: Sample): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("sample:updated", { success: true, data: { sample } });
  io.to(`order:${sample.orderId}`).emit("order:pipeline-update", {
    success: true,
    data: { orderId: sample.orderId, sampleId: sample.id, status: sample.status }
  });
  emitDashboardStatsUpdate(tenantId, "sample-updated", { sampleId: sample.id, status: sample.status });
};

export const emitLabResultQueueUpdate = (
  tenantId: string,
  payload: { orderId: string; activatedBy: string; count: number }
): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("lab-result:queue-update", { success: true, data: payload });
  io.to(`order:${payload.orderId}`).emit("order:pipeline-update", {
    success: true,
    data: { orderId: payload.orderId, reason: "processing-activated", count: payload.count }
  });
  emitDashboardStatsUpdate(tenantId, "lab-queue-update", payload);
};

export const emitOrderPipelineUpdate = (
  tenantId: string,
  orderId: string,
  pipeline: unknown
): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("order:pipeline-update", { success: true, data: { orderId, pipeline } });
  io.to(`order:${orderId}`).emit("order:pipeline-update", { success: true, data: { orderId, pipeline } });
};

export const emitLabResultApproved = (tenantId: string, result: unknown): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("lab-result:technician-approved", { success: true, data: { result } });
  emitDashboardStatsUpdate(tenantId, "technician-approved");
};

export const emitLabResultPathologistVerified = (tenantId: string, verified: unknown[]): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("lab-result:pathologist-verified", { success: true, data: { verified } });
  emitDashboardStatsUpdate(tenantId, "pathologist-verified", { count: verified.length });
};

export const emitOrderBooked = (tenantId: string, orderId: string): void => {
  emitDashboardStatsUpdate(tenantId, "order-booked", { orderId });
};

export const emitKioskTokenCreated = (
  tenantId: string,
  payload: {
    tokenId: string;
    tokenLabel: string;
    orderNumber: string;
    patientName: string;
    amountMinor: number;
  }
): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("kiosk:token-created", {
    success: true,
    data: { ...payload, at: new Date().toISOString() }
  });
  emitDashboardStatsUpdate(tenantId, "kiosk-token-created", payload);
};

/** Live feed when an analyzer (HL7/ASTM) pushes results into a DRAFT lab result. */
export const emitAnalyzerDataReceived = (tenantId: string, payload: Record<string, unknown>): void => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit("analyzer:data-received", {
    success: true,
    data: {
      at: new Date().toISOString(),
      ...payload
    }
  });
  emitDashboardStatsUpdate(tenantId, "analyzer-data", {
    barcode: payload.barcode,
    labResultIds: payload.labResultIds
  });
};
