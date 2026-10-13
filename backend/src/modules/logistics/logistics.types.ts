export type TripStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export type HomeCollectionTrip = {
  id: string;
  tenantId: string;
  orderId: string;
  phlebotomistUserId: string;
  status: TripStatus;
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
  status: TripStatus;
  phlebotomistLat: number | null;
  phlebotomistLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationAddress: string | null;
  lastLocationAt: string | null;
  etaMinutes: number | null;
  distanceKm: number | null;
};

export type LocationUpdatePayload = {
  tripId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  etaMinutes: number | null;
  distanceKm: number | null;
};
