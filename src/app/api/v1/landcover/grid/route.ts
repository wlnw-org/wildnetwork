import { landcoverGrid } from "@/lib/landcover";

/** Every 1 degree land square: { classes, source, licence, cells: [[lat, lon (south-west corner), ...percent per class]] }. */
export async function GET() {
  const data = await landcoverGrid();
  if (!data) return Response.json({ error: "no land cover data" }, { status: 503 });
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=604800, stale-while-revalidate=2592000" } });
}
