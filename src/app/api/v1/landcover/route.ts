import { cellLandcover } from "@/lib/landcover";

/** Land cover of the 1 degree square holding a point: GET /api/v1/landcover?lat=&lon= -> { cell, shares: { forest: %, ... }, source, licence }. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  if (!q.get("lat") || !q.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  const data = await cellLandcover(lat, lon);
  if (!data) return Response.json({ error: "no land cover here (open sea or no data)" }, { status: 404 });
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=604800" } });
}
