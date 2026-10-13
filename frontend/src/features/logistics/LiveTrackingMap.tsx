import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const phlebIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const destIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const FitBounds = (props: { points: Array<[number, number]> }): null => {
  const map = useMap();
  const sig = props.points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (props.points.length === 0) return;
    if (props.points.length === 1) {
      map.setView(props.points[0]!, 14);
      return;
    }
    map.fitBounds(L.latLngBounds(props.points), { padding: [40, 40] });
  }, [map, sig]);
  return null;
};

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: "phleb" | "destination";
};

export const LiveTrackingMap = (props: {
  points: MapPoint[];
  height?: string;
  showRoute?: boolean;
}): JSX.Element => {
  const { points, height = "420px", showRoute = true } = props;
  const defaultCenter = useMemo<[number, number]>(() => {
    if (points.length > 0) return [points[0]!.lat, points[0]!.lng];
    return [28.6139, 77.209];
  }, [points]);

  const route = useMemo<[number, number][]>(() => {
    const phleb = points.find((p) => p.kind === "phleb");
    const dest = points.find((p) => p.kind === "destination");
    if (!phleb || !dest) return [];
    return [
      [phleb.lat, phleb.lng],
      [dest.lat, dest.lng]
    ];
  }, [points]);

  const boundsPoints = useMemo<[number, number][]>(() => points.map((p) => [p.lat, p.lng]), [points]);

  return (
    <div className="rounded-xl overflow-hidden border border-border/60" style={{ height }}>
      <MapContainer center={defaultCenter} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={boundsPoints} />
        {showRoute && route.length === 2 ? <Polyline positions={route} color="#2563eb" weight={4} dashArray="8 8" /> : null}
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={p.kind === "phleb" ? phlebIcon : destIcon}>
            <Popup>{p.label}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export const useGeolocationWatch = (
  enabled: boolean,
  onPosition: (coords: { latitude: number; longitude: number }) => void
): void => {
  const cbRef = useRef(onPosition);
  cbRef.current = onPosition;

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        cbRef.current({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);
};
