import { AREA_GROUPS, nearbyChecklist } from "@/lib/areaReport";

/**
 * Species known within km of a point from GBIF (CC0 or CC BY 4.0): ?lat&lon[&km=25 (5 to 50)][&group][&since=2000-01-01].
 * The point is rounded to 0.1 degree (about 10 km) before anything is looked up. Sensitive species are left out.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Math.round(Number(sp.get("lat")) * 10) / 10, lon = Math.round(Number(sp.get("lon")) * 10) / 10;
  if (!sp.get("lat") || !sp.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return Response.json({ error: "lat and lon are required." }, { status: 400 });
  const km = Math.min(50, Math.max(5, Number(sp.get("km")) || 25));
  const group = sp.get("group") && AREA_GROUPS[sp.get("group")!] ? sp.get("group")! : "all";
  const since = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("since") ?? "") ? sp.get("since")! : "2000-01-01";
  try {
    const r = await nearbyChecklist(lat, lon, km, group, since);
    return Response.json({ query: { lat, lon, km, group, since }, licence: "GBIF records under CC0 or CC BY 4.0", ...r },
      { headers: { "cache-control": "public, s-maxage=2592000, stale-while-revalidate=2592000", "access-control-allow-origin": "*" } });
  } catch {
    return Response.json({ error: "GBIF did not answer. Try again in a minute." }, { status: 502 });
  }
}
