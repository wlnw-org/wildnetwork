import { searchAreas } from "@/lib/areaReport";

/** Named areas with a boundary (districts, protected areas, parks, towns) from OpenStreetMap, for area reports. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return Response.json([]);
  try {
    return Response.json(await searchAreas(q), { headers: { "cache-control": "public, s-maxage=604800, stale-while-revalidate=2592000" } });
  } catch {
    return Response.json({ error: "Search is not available right now. Try again in a minute, or draw the area." }, { status: 502 });
  }
}
