export const dynamic = "force-dynamic";

import { lookupIp } from "@/lib/geoip";

/**
 * The visitor's approximate area: no permission prompt, nothing stored or logged. Rounded to whole degrees (about
 * 100 km). Used to centre the map and suggest a town in the alert form. From Vercel's IP headers when present, else a
 * local IP database lookup on this server (src/lib/geoip.ts). Empty object when neither knows the address.
 */
export async function GET(req: Request) {
  const h = req.headers;
  const dec = (v: string | null) => { try { return v ? decodeURIComponent(v) : null; } catch { return null; } };
  const lat = Number(h.get("x-vercel-ip-latitude")), lon = Number(h.get("x-vercel-ip-longitude"));
  let body: Record<string, unknown> = {};
  if (h.get("x-vercel-ip-latitude") && Number.isFinite(lat) && Number.isFinite(lon)) {
    body = { lat: Math.round(lat), lon: Math.round(lon), city: dec(h.get("x-vercel-ip-city")), country: h.get("x-vercel-ip-country") };
  } else {
    // Caddy sets X-Forwarded-For to the connecting address (it ignores any value the client sends).
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const g = await lookupIp(ip).catch(() => null);
    if (g) body = { lat: Math.round(g.lat), lon: Math.round(g.lon), city: g.city, country: g.country };
  }
  return Response.json(body, { headers: { "cache-control": "private, no-store" } });
}
