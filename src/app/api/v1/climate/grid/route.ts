import { climateGrid } from "@/lib/climate";

/** Past 12 months per 5 degree cell: { base, from, to, cells: [{ lat, lon (south-west corner), t (deg C anomaly), p (rain % vs normal) }] }. */
export async function GET() {
  const data = await climateGrid();
  if (!data) return Response.json({ error: "no climate data" }, { status: 503 });
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
