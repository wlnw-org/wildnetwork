import { nearbyAreas } from "@/lib/areaReport";

/** Named protected areas around a point (OpenStreetMap, any country), nearest first. ?lat&lon[&km=100] */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat")), lon = Number(sp.get("lon")), km = Number(sp.get("km") ?? 100);
  if (!sp.get("lat") || !sp.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return Response.json({ error: "lat and lon are required." }, { status: 400 });
  try {
    // Rounded to 0.1 degree so nearby visitors share the cached answer.
    const hits = await nearbyAreas(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10, Number.isFinite(km) ? km : 100);
    return Response.json(hits, { headers: { "cache-control": "public, s-maxage=2592000, stale-while-revalidate=2592000" } });
  } catch {
    return Response.json({ error: "Protected areas could not be listed right now. Try again in a minute, or search by name." }, { status: 502 });
  }
}
