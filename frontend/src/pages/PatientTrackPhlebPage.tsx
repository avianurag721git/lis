import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { Clock, MapPin, Truck } from "lucide-react";
import { env } from "../utils/env";
import { logisticsApi, PublicTrackPayload } from "../features/logistics/logistics.service";
import { LiveTrackingMap, MapPoint } from "../features/logistics/LiveTrackingMap";

export const PatientTrackPhlebPage = (): JSX.Element => {
  const { bookingId = "" } = useParams();
  const [track, setTrack] = useState<PublicTrackPayload | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-track", bookingId],
    queryFn: () => logisticsApi.getPublicTrack(bookingId),
    enabled: Boolean(bookingId),
    refetchInterval: 60_000
  });

  useEffect(() => {
    if (data) setTrack(data);
  }, [data]);

  useEffect(() => {
    if (!bookingId) return;
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-trip", bookingId);

    socket.on(
      "trip:location",
      (payload: {
        data?: {
          latitude: number;
          longitude: number;
          etaMinutes: number | null;
          distanceKm: number | null;
          recordedAt: string;
        };
      }) => {
        const loc = payload.data;
        if (!loc) return;
        setTrack((prev) =>
          prev
            ? {
                ...prev,
                phlebotomistLat: loc.latitude,
                phlebotomistLng: loc.longitude,
                etaMinutes: loc.etaMinutes,
                distanceKm: loc.distanceKm,
                lastLocationAt: loc.recordedAt
              }
            : prev
        );
      }
    );

    socket.on("trip:completed", () => {
      setTrack((prev) => (prev ? { ...prev, status: "COMPLETED" } : prev));
    });

    return () => {
      socket.disconnect();
    };
  }, [bookingId]);

  const mapPoints: MapPoint[] = useMemo(() => {
    if (!track) return [];
    const pts: MapPoint[] = [];
    if (track.phlebotomistLat != null && track.phlebotomistLng != null) {
      pts.push({
        id: "phleb",
        lat: track.phlebotomistLat,
        lng: track.phlebotomistLng,
        label: "Phlebotomist",
        kind: "phleb"
      });
    }
    if (track.destinationLat != null && track.destinationLng != null) {
      pts.push({
        id: "dest",
        lat: track.destinationLat,
        lng: track.destinationLng,
        label: track.destinationAddress ?? "Your location",
        kind: "destination"
      });
    }
    return pts;
  }, [track]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 px-4 py-5 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" aria-hidden />
            Track your phlebotomist
          </h1>
          {track ? (
            <p className="text-sm text-muted-foreground mt-1">
              {track.patientName} · Booking {track.orderNumber}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 space-y-5">
        {isLoading ? <p className="text-muted-foreground">Loading live tracking…</p> : null}
        {error ? <p className="text-destructive">Unable to load tracking for this booking.</p> : null}

        {track?.status === "COMPLETED" ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
            Collection visit completed. Thank you!
          </div>
        ) : null}

        <LiveTrackingMap points={mapPoints} height="360px" />

        {track ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p className="font-medium mt-1">{track.status === "ACTIVE" ? "On the way" : track.status}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden /> ETA
              </p>
              <p className="font-medium mt-1">
                {track.etaMinutes != null ? `~${track.etaMinutes} minutes` : "Calculating…"}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> Address
              </p>
              <p className="font-medium mt-1 text-sm">{track.destinationAddress ?? "—"}</p>
            </div>
          </div>
        ) : null}

        {!track?.phlebotomistLat && !isLoading ? (
          <p className="text-sm text-muted-foreground">
            Your phlebotomist will appear on the map once they start the visit and share their location.
          </p>
        ) : null}
      </main>
    </div>
  );
};
