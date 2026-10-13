/** Haversine distance in km between two WGS84 coordinates. */
export const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Rough urban ETA at ~25 km/h average speed. */
export const estimateEtaMinutes = (distanceKm: number): number => {
  if (distanceKm <= 0) return 0;
  const speedKmh = 25;
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
};
