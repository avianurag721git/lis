import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { MapPin, Navigation, Radio } from "lucide-react";
import { env } from "../../utils/env";
import { useTenant } from "../../modules/tenant/tenant.context";
import { logisticsApi, HomeCollectionTrip } from "./logistics.service";
import { LiveTrackingMap, MapPoint } from "./LiveTrackingMap";

type LiveTrip = HomeCollectionTrip & { bookingId: string };

export const PhlebotomistLiveTracker = (): JSX.Element => {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [livePositions, setLivePositions] = useState<
    Record<string, { lat: number; lng: number; etaMinutes: number | null; distanceKm: number | null }>
  >({});

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["logistics-active-trips"],
    queryFn: () => logisticsApi.listActiveTrips(),
    refetchInterval: 30_000
  });

  useEffect(() => {
    if (!tenantId) return;
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-trip-ops", tenantId);

    socket.on("trip:location", (payload: { data?: { bookingId?: string; tripId?: string; latitude: number; longitude: number; etaMinutes: number | null; distanceKm: number | null } }) => {
      const data = payload.data;
      if (!data) return;
      const key = data.bookingId ?? data.tripId ?? "";
      if (!key) return;
      setLivePositions((prev) => ({
        ...prev,
        [key]: {
          lat: data.latitude,
          lng: data.longitude,
          etaMinutes: data.etaMinutes,
          distanceKm: data.distanceKm
        }
      }));
      void qc.invalidateQueries({ queryKey: ["logistics-active-trips"] });
    });

    socket.on("trip:started", () => {
      void qc.invalidateQueries({ queryKey: ["logistics-active-trips"] });
    });

    socket.on("trip:completed", () => {
      void qc.invalidateQueries({ queryKey: ["logistics-active-trips"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId, qc]);

  const enrichedTrips: LiveTrip[] = useMemo(
    () =>
      trips.map((t) => ({
        ...t,
        bookingId: t.orderId,
        lastLat: livePositions[t.orderId]?.lat ?? t.lastLat,
        lastLng: livePositions[t.orderId]?.lng ?? t.lastLng
      })),
    [trips, livePositions]
  );

  const mapPoints: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = [];
    for (const trip of enrichedTrips) {
      if (trip.lastLat != null && trip.lastLng != null) {
        pts.push({
          id: `phleb-${trip.id}`,
          lat: trip.lastLat,
          lng: trip.lastLng,
          label: `Phlebotomist — ${trip.orderId.slice(0, 8)}`,
          kind: "phleb"
        });
      }
      if (trip.destinationLat != null && trip.destinationLng != null) {
        pts.push({
          id: `dest-${trip.id}`,
          lat: trip.destinationLat,
          lng: trip.destinationLng,
          label: trip.destinationAddress ?? "Patient home",
          kind: "destination"
        });
      }
    }
    return pts;
  }, [enrichedTrips]);

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title flex items-center gap-2">
          <Radio className="h-6 w-6 text-primary" aria-hidden />
          Live phlebotomist GPS tracker
        </h1>
        <p className="page-subtitle">Real-time home collection trips across your tenant.</p>
      </div>

      <LiveTrackingMap points={mapPoints} height="480px" />

      <div className="mt-6 grid gap-3">
        {isLoading ? <p className="text-muted">Loading active trips…</p> : null}
        {!isLoading && enrichedTrips.length === 0 ? (
          <p className="text-muted">No active home collection trips right now.</p>
        ) : null}
        {enrichedTrips.map((trip) => {
          const live = livePositions[trip.orderId];
          return (
            <div key={trip.id} className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-primary" aria-hidden />
                  Order {trip.orderId.slice(0, 8)}…
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {trip.destinationAddress ?? "Address pending"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Started {new Date(trip.startedAt).toLocaleString()}
                </p>
              </div>
              <div className="text-sm">
                {trip.lastLat != null ? (
                  <>
                    <p>
                      <MapPin className="inline h-3.5 w-3.5 mr-1" aria-hidden />
                      {trip.lastLat.toFixed(5)}, {trip.lastLng?.toFixed(5)}
                    </p>
                    {live?.etaMinutes != null ? (
                      <p className="text-primary font-medium">ETA ~{live.etaMinutes} min</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">Awaiting GPS…</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
