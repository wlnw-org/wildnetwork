export const dynamic = "force-dynamic";

/**
 * The visitor's approximate area from Vercel's IP geolocation headers: no permission prompt, no third-party service,
 * nothing stored or logged. Rounded to whole degrees (about 100 km). Used to centre the map and suggest a town in the
 * alert form. Empty object when the headers are missing (local development, some networks).
 */
export function GET(req: Request) {
  const h = req.headers;
  const lat = Number(h.get("x-vercel-ip-latitude")), lon = Number(h.get("x-vercel-ip-longitude"));
  const dec = (v: string | null) => { try { return v ? decodeURIComponent(v) : null; } catch { return null; } };
  const body = Number.isFinite(lat) && Number.isFinite(lon) && h.get("x-vercel-ip-latitude")
    ? { lat: Math.round(lat), lon: Math.round(lon), city: dec(h.get("x-vercel-ip-city")), country: h.get("x-vercel-ip-country") }
    : {};
  return Response.json(body, { headers: { "cache-control": "private, no-store" } });
}
