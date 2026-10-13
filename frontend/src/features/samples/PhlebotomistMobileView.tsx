import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { MapPin, Navigation, Play, Square, Ticket } from "lucide-react";
import { labAudio } from "../../lib/audio";
import { env } from "../../utils/env";
import { useTenant } from "../../modules/tenant/tenant.context";
import { ordersApi } from "../orders/orders.service";
import { samplesApi } from "./samples.service";
import { logisticsApi, HomeCollectionTrip } from "../logistics/logistics.service";
import { useGeolocationWatch } from "../logistics/LiveTrackingMap";
import { OrderPipelineTracker } from "../../components/OrderPipelineTracker";

const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const rows = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!rows[0]) return null;
    return { lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon) };
  } catch {
    return null;
  }
};

export const PhlebotomistMobileView = (): JSX.Element => {
  const qc = useQueryClient();
  const { tenantId } = useTenant();
  const [tempBySample, setTempBySample] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [activeTrips, setActiveTrips] = useState<Record<string, HomeCollectionTrip>>({});
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [socketRef, setSocketRef] = useState<Socket | null>(null);
  const [kioskAlert, setKioskAlert] = useState<string | null>(null);
  const [scanBarcode, setScanBarcode] = useState("");
  const [activeOrderId, setActiveOrderId] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["home-collection"],
    queryFn: () => ordersApi.homeCollection(),
    refetchInterval: 15000
  });

  useEffect(() => {
    if (!tenantId) return;
    const socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", tenantId);
    socket.on("kiosk:token-created", (payload: { data?: { tokenLabel?: string; patientName?: string } }) => {
      if (payload.data?.tokenLabel) {
        setKioskAlert(`${payload.data.tokenLabel} — ${payload.data.patientName ?? "Walk-in"}`);
      }
    });
    setSocketRef(socket);
    return () => {
      socket.disconnect();
    };
  }, [tenantId]);

  const emitLocation = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      if (!trackingOrderId || !tenantId || !socketRef) return;
      const trip = activeTrips[trackingOrderId];
      if (!trip) return;
      socketRef.emit("phleb:location-update", {
        tenantId,
        tripId: trip.id,
        orderId: trackingOrderId,
        latitude: coords.latitude,
        longitude: coords.longitude
      });
    },
    [activeTrips, socketRef, tenantId, trackingOrderId]
  );

  useGeolocationWatch(Boolean(trackingOrderId), emitLocation);

  const startTripMutation = useMutation({
    mutationFn: async (input: { orderId: string; collectionAddress: string | null }) => {
      let destinationLat: number | undefined;
      let destinationLng: number | undefined;
      if (input.collectionAddress) {
        const geo = await geocodeAddress(input.collectionAddress);
        if (geo) {
          destinationLat = geo.lat;
          destinationLng = geo.lng;
        }
      }
      return logisticsApi.startTrip({
        orderId: input.orderId,
        ...(input.collectionAddress ? { destinationAddress: input.collectionAddress } : {}),
        ...(destinationLat != null && destinationLng != null ? { destinationLat, destinationLng } : {})
      });
    },
    onSuccess: (trip, vars) => {
      setActiveTrips((prev) => ({ ...prev, [vars.orderId]: trip }));
      setTrackingOrderId(vars.orderId);
      socketRef?.emit("phleb:trip-started", {
        tenantId,
        orderId: vars.orderId,
        tripId: trip.id
      });
      setMsg("GPS tracking started — patient can follow live map.");
    },
    onError: () => setMsg("Could not start trip tracking")
  });

  const completeTripMutation = useMutation({
    mutationFn: (input: { orderId: string; tripId: string }) => logisticsApi.completeTrip(input.tripId),
    onSuccess: (trip, vars) => {
      socketRef?.emit("phleb:trip-completed", {
        tenantId,
        tripId: trip.id,
        orderId: vars.orderId
      });
      setActiveTrips((prev) => {
        const next = { ...prev };
        delete next[vars.orderId];
        return next;
      });
      if (trackingOrderId === vars.orderId) setTrackingOrderId(null);
      setMsg("Trip completed.");
    },
    onError: () => setMsg("Could not complete trip")
  });

  const collectMutation = useMutation({
    mutationFn: (sampleId: string) => samplesApi.collect({ sampleId }),
    onSuccess: async () => {
      labAudio.success();
      setMsg("Marked COLLECTED");
      await qc.invalidateQueries({ queryKey: ["home-collection"] });
    },
    onError: () => {
      labAudio.error();
      setMsg("Collect failed");
    }
  });

  const scanMutation = useMutation({
    mutationFn: (barcode: string) => samplesApi.rapidScan({ barcode }),
    onSuccess: async (result) => {
      labAudio.success();
      setMsg(`${result.sample.barcode} → ${result.action}`);
      setActiveOrderId(result.sample.orderId);
      setScanBarcode("");
      await qc.invalidateQueries({ queryKey: ["home-collection"] });
      scanRef.current?.focus();
    },
    onError: () => {
      labAudio.error();
      setMsg("Barcode scan failed");
      setScanBarcode("");
      scanRef.current?.focus();
    }
  });

  const onScanSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!scanBarcode.trim()) return;
    scanMutation.mutate(scanBarcode.trim());
  };

  const transitMutation = useMutation({
    mutationFn: (input: { sampleId: string; temperatureCelsius: number }) => samplesApi.transit(input),
    onSuccess: async () => {
      setMsg("Marked IN_TRANSIT + temperature logged");
      await qc.invalidateQueries({ queryKey: ["home-collection"] });
    },
    onError: () => setMsg("Transit update failed")
  });

  const trackUrl = (orderId: string): string => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/track-phleb/${orderId}`;
  };

  return (
    <section className="page-shell phlebo-mobile">
      <div className="page-head">
        <h1 className="page-title">Phlebotomist — home collection</h1>
        <p className="page-subtitle">Start GPS tracking, collect samples, then log transit temperature.</p>
      </div>
      {kioskAlert ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center gap-2 text-sm font-medium">
          <Ticket className="h-4 w-4 text-amber-600" aria-hidden />
          New BYOD kiosk token: {kioskAlert}
        </div>
      ) : null}
      {msg ? <p className="text-muted">{msg}</p> : null}

      <div className="card mb-4">
        <form onSubmit={onScanSubmit}>
          <label className="form-label">
            Rapid barcode scan (collection)
            <input
              ref={scanRef}
              value={scanBarcode}
              onChange={(e) => {
                if (e.target.value.length > scanBarcode.length) labAudio.blip();
                setScanBarcode(e.target.value);
              }}
              placeholder="Scan tube barcode…"
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={scanMutation.isPending}>
            Scan & collect
          </button>
        </form>
      </div>

      {activeOrderId ? <OrderPipelineTracker orderId={activeOrderId} className="mb-4" /> : null}

      {isLoading ? <p>Loading…</p> : null}
      {error ? <p className="status-error">Unable to load home collection list.</p> : null}

      {orders.length === 0 && !isLoading ? <p className="text-muted">No open home-collection orders.</p> : null}

      {orders.map((row) => {
        const trip = activeTrips[row.order.id];
        const isTracking = trackingOrderId === row.order.id;
        const collectionAddress = row.collectionAddress ?? null;

        return (
          <div className="card" key={row.order.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="card-title" style={{ marginBottom: 4 }}>
                  {row.patientName}
                </h2>
                <p className="text-muted" style={{ marginTop: 0 }}>
                  {row.order.orderNumber} · {row.patientPhone ?? "no phone"} · {row.order.status}
                </p>
                {collectionAddress ? (
                  <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                    {collectionAddress}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                {!trip ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5"
                    onClick={() =>
                      startTripMutation.mutate({
                        orderId: row.order.id,
                        collectionAddress: collectionAddress ?? null
                      })
                    }
                    disabled={startTripMutation.isPending}
                  >
                    <Play className="h-4 w-4" aria-hidden />
                    Start GPS trip
                  </button>
                ) : (
                  <>
                    <span className={`text-xs font-medium ${isTracking ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {isTracking ? "● Live GPS active" : "Trip started"}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5"
                      onClick={() => completeTripMutation.mutate({ orderId: row.order.id, tripId: trip.id })}
                      disabled={completeTripMutation.isPending}
                    >
                      <Square className="h-4 w-4" aria-hidden />
                      End trip
                    </button>
                  </>
                )}
                <a
                  href={trackUrl(row.order.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary inline-flex items-center gap-1"
                >
                  <Navigation className="h-3.5 w-3.5" aria-hidden />
                  Patient track link
                </a>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tube</th>
                    <th>Barcode</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {row.samples.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {s.tubeColor}
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          {s.sampleType}
                        </div>
                      </td>
                      <td>
                        <code>{s.barcode}</code>
                      </td>
                      <td>{s.status}</td>
                      <td>
                        {s.status === "PENDING_COLLECTION" ? (
                          <button type="button" onClick={() => collectMutation.mutate(s.id)} disabled={collectMutation.isPending}>
                            Collect
                          </button>
                        ) : null}
                        {s.status === "COLLECTED" || s.status === "IN_TRANSIT" ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              style={{ width: 72 }}
                              type="number"
                              step="0.1"
                              placeholder="°C"
                              value={tempBySample[s.id] ?? ""}
                              onChange={(e) => setTempBySample((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                transitMutation.mutate({
                                  sampleId: s.id,
                                  temperatureCelsius: Number(tempBySample[s.id])
                                })
                              }
                              disabled={transitMutation.isPending || !tempBySample[s.id]}
                            >
                              Transit
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
};
