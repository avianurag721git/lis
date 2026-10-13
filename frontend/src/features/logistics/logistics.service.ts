import { httpClient } from "../../services/http";
import axios from "axios";
import { env } from "../../utils/env";

export type HomeCollectionTrip = {
  id: string;
  tenantId: string;
  orderId: string;
  phlebotomistUserId: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  destinationAddress: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type PublicTrackPayload = {
  bookingId: string;
  orderNumber: string;
  patientName: string;
  status: string;
  phlebotomistLat: number | null;
  phlebotomistLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationAddress: string | null;
  lastLocationAt: string | null;
  etaMinutes: number | null;
  distanceKm: number | null;
};

export const logisticsApi = {
  startTrip: async (input: {
    orderId: string;
    destinationAddress?: string;
    destinationLat?: number;
    destinationLng?: number;
  }): Promise<HomeCollectionTrip> => {
    const res = await httpClient.post<{ success: boolean; data: { trip: HomeCollectionTrip } }>(
      "/api/logistics/trips/start",
      input
    );
    return res.data.data.trip;
  },

  completeTrip: async (tripId: string): Promise<HomeCollectionTrip> => {
    const res = await httpClient.post<{ success: boolean; data: { trip: HomeCollectionTrip } }>(
      `/api/logistics/trips/${tripId}/complete`
    );
    return res.data.data.trip;
  },

  listActiveTrips: async (): Promise<HomeCollectionTrip[]> => {
    const res = await httpClient.get<{ success: boolean; data: { trips: HomeCollectionTrip[] } }>(
      "/api/logistics/trips/active"
    );
    return res.data.data.trips;
  },

  getTripByOrder: async (orderId: string): Promise<HomeCollectionTrip | null> => {
    const res = await httpClient.get<{ success: boolean; data: { trip: HomeCollectionTrip | null } }>(
      `/api/logistics/trips/by-order/${orderId}`
    );
    return res.data.data.trip;
  },

  getPublicTrack: async (bookingId: string): Promise<PublicTrackPayload> => {
    const res = await axios.get<{ success: boolean; data: PublicTrackPayload }>(
      `${env.apiUrl}/api/logistics/track/${bookingId}`
    );
    return res.data.data;
  }
};
