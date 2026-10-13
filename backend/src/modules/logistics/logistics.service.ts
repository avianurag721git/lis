import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { HomeCollectionTrip, PublicTrackPayload } from "./logistics.types";
import { estimateEtaMinutes, haversineKm } from "./geo.utils";

const memTrips = new Map<string, HomeCollectionTrip>();

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapTrip = (r: Record<string, unknown>): HomeCollectionTrip => ({
  id: r.id as string,
  tenantId: r.tenant_id as string,
  orderId: r.order_id as string,
  phlebotomistUserId: r.phlebotomist_user_id as string,
  status: r.status as HomeCollectionTrip["status"],
  destinationAddress: (r.destination_address as string | null) ?? null,
  destinationLat: r.destination_lat != null ? Number(r.destination_lat) : null,
  destinationLng: r.destination_lng != null ? Number(r.destination_lng) : null,
  lastLat: r.last_lat != null ? Number(r.last_lat) : null,
  lastLng: r.last_lng != null ? Number(r.last_lng) : null,
  lastLocationAt: r.last_location_at ? new Date(r.last_location_at as string).toISOString() : null,
  startedAt: new Date(r.started_at as string).toISOString(),
  completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null
});

export const logisticsService = {
  async startTrip(
    tenantId: string,
    orderId: string,
    phlebotomistUserId: string,
    opts?: { destinationAddress?: string; destinationLat?: number; destinationLng?: number }
  ): Promise<HomeCollectionTrip> {
    ensurePg();

    const order = await db.query(
      `SELECT id, order_number, collection_type, collection_address
       FROM order_bookings WHERE tenant_id = $1 AND id = $2`,
      [tenantId, orderId]
    );
    if (!order.rows[0]) {
      throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND, "ORDER_NOT_FOUND");
    }
    if (order.rows[0].collection_type !== "HOME_COLLECTION") {
      throw new AppError("Not a home collection order", HTTP_STATUS.BAD_REQUEST, "NOT_HOME_COLLECTION");
    }

    const existing = await db.query(
      `SELECT * FROM home_collection_trips WHERE tenant_id = $1 AND order_id = $2 AND status = 'ACTIVE'`,
      [tenantId, orderId]
    );
    if (existing.rows[0]) {
      return mapTrip(existing.rows[0]);
    }

    const id = randomUUID();
    const destAddress = opts?.destinationAddress ?? (order.rows[0].collection_address as string | null);
    const result = await db.query(
      `INSERT INTO home_collection_trips
       (id, tenant_id, order_id, phlebotomist_user_id, status, destination_address, destination_lat, destination_lng)
       VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6,$7)
       RETURNING *`,
      [id, tenantId, orderId, phlebotomistUserId, destAddress, opts?.destinationLat ?? null, opts?.destinationLng ?? null]
    );
    const trip = mapTrip(result.rows[0]);
    memTrips.set(trip.id, trip);
    return trip;
  },

  async updateLocation(
    tenantId: string,
    tripId: string,
    latitude: number,
    longitude: number
  ): Promise<{ trip: HomeCollectionTrip; etaMinutes: number | null; distanceKm: number | null }> {
    ensurePg();
    const result = await db.query(
      `UPDATE home_collection_trips
       SET last_lat = $3, last_lng = $4, last_location_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING *`,
      [tenantId, tripId, latitude, longitude]
    );
    if (!result.rows[0]) {
      throw new AppError("Active trip not found", HTTP_STATUS.NOT_FOUND, "TRIP_NOT_FOUND");
    }
    const trip = mapTrip(result.rows[0]);
    memTrips.set(trip.id, trip);

    let distanceKm: number | null = null;
    let etaMinutes: number | null = null;
    if (trip.destinationLat != null && trip.destinationLng != null) {
      distanceKm = haversineKm(latitude, longitude, trip.destinationLat, trip.destinationLng);
      etaMinutes = estimateEtaMinutes(distanceKm);
    }
    return { trip, etaMinutes, distanceKm };
  },

  async completeTrip(tenantId: string, tripId: string): Promise<HomeCollectionTrip> {
    ensurePg();
    const result = await db.query(
      `UPDATE home_collection_trips
       SET status = 'COMPLETED', completed_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING *`,
      [tenantId, tripId]
    );
    if (!result.rows[0]) {
      throw new AppError("Active trip not found", HTTP_STATUS.NOT_FOUND, "TRIP_NOT_FOUND");
    }
    const trip = mapTrip(result.rows[0]);
    memTrips.set(trip.id, trip);
    return trip;
  },

  async listActiveTrips(tenantId: string): Promise<HomeCollectionTrip[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM home_collection_trips WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY started_at DESC`,
      [tenantId]
    );
    return result.rows.map(mapTrip);
  },

  async getTripByOrder(tenantId: string, orderId: string): Promise<HomeCollectionTrip | null> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM home_collection_trips WHERE tenant_id = $1 AND order_id = $2 ORDER BY started_at DESC LIMIT 1`,
      [tenantId, orderId]
    );
    return result.rows[0] ? mapTrip(result.rows[0]) : null;
  },

  async getPublicTrack(bookingId: string): Promise<PublicTrackPayload> {
    ensurePg();
    const result = await db.query(
      `SELECT t.*, o.order_number, p.name AS patient_name
       FROM home_collection_trips t
       JOIN order_bookings o ON o.id = t.order_id AND o.tenant_id = t.tenant_id
       JOIN patients p ON p.id = o.patient_id
       WHERE t.order_id = $1
       ORDER BY t.started_at DESC
       LIMIT 1`,
      [bookingId]
    );
    if (!result.rows[0]) {
      const orderOnly = await db.query(
        `SELECT o.id, o.order_number, o.collection_address, p.name AS patient_name
         FROM order_bookings o
         JOIN patients p ON p.id = o.patient_id
         WHERE o.id = $1 AND o.collection_type = 'HOME_COLLECTION'`,
        [bookingId]
      );
      if (!orderOnly.rows[0]) {
        throw new AppError("Booking not found", HTTP_STATUS.NOT_FOUND, "BOOKING_NOT_FOUND");
      }
      return {
        bookingId,
        orderNumber: orderOnly.rows[0].order_number as string,
        patientName: orderOnly.rows[0].patient_name as string,
        status: "ACTIVE",
        phlebotomistLat: null,
        phlebotomistLng: null,
        destinationLat: null,
        destinationLng: null,
        destinationAddress: (orderOnly.rows[0].collection_address as string | null) ?? null,
        lastLocationAt: null,
        etaMinutes: null,
        distanceKm: null
      };
    }

    const row = result.rows[0];
    const trip = mapTrip(row);
    let distanceKm: number | null = null;
    let etaMinutes: number | null = null;
    if (trip.lastLat != null && trip.lastLng != null && trip.destinationLat != null && trip.destinationLng != null) {
      distanceKm = haversineKm(trip.lastLat, trip.lastLng, trip.destinationLat, trip.destinationLng);
      etaMinutes = estimateEtaMinutes(distanceKm);
    }

    return {
      bookingId,
      orderNumber: row.order_number as string,
      patientName: row.patient_name as string,
      status: trip.status,
      phlebotomistLat: trip.lastLat,
      phlebotomistLng: trip.lastLng,
      destinationLat: trip.destinationLat,
      destinationLng: trip.destinationLng,
      destinationAddress: trip.destinationAddress,
      lastLocationAt: trip.lastLocationAt,
      etaMinutes,
      distanceKm
    };
  }
};
