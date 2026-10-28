import { PLACE_GROUPS, placeReport } from "@/lib/places";

/** GET /api/v1/places/report?lat=13.08&lon=80.27&group=avian : the report for the 5 degree cell around a point. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return Response.json({ error: "lat and lon required" }, { status: 400 });
  const g = p.get("group") ?? "avian";
  const grp = (PLACE_GROUPS as readonly string[]).includes(g) ? g : "avian";
  return Response.json(await placeReport(lat, lon, grp), { headers: { "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
}
