import { AREA_LIMITS, areaFromGeoJson, areaFromOsm, areasToday } from "@/lib/areaReport";
import { hashIp } from "@/lib/auth";
import { clientIp } from "@/lib/devices";

/**
 * Create an area for a report: { osm: "R123" } for an OpenStreetMap boundary (shared, stored once), or
 * { name, geojson, source: "drawn" | "upload" } for a boundary drawn on the map or read from a KML/GeoJSON file in the browser.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { osm?: string; name?: string; geojson?: unknown; source?: string } | null;
  if (!b) return Response.json({ error: "Bad request." }, { status: 400 });
  const ipHash = hashIp("areas", clientIp(req));
  try {
    if (await areasToday(ipHash) >= AREA_LIMITS.PER_DAY) return Response.json({ error: "Too many new areas from this network today. Try again tomorrow." }, { status: 429 });
    if (typeof b.osm === "string") return Response.json({ id: await areaFromOsm(b.osm, ipHash) });
    if (JSON.stringify(b.geojson ?? null).length > 2_000_000) return Response.json({ error: "That file is too large. Simplify the boundary first." }, { status: 413 });
    const id = await areaFromGeoJson(String(b.name ?? ""), b.geojson, b.source === "drawn" ? "drawn" : "upload", ipHash);
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not create that area." }, { status: 400 });
  }
}
