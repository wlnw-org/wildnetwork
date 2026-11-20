import { GROUP_MAX, loadStations, stationFeed, stationIdFromSlug } from "@/lib/stations";

/**
 * GET /api/v1/stations/feed?ids=<slug or source:deploymentId>,... (max 20): newest detections of public stations, for the
 * live feed on station pages. Same rules as GET /api/v1/events?deployment=, plus sensitive taxa unnamed and test stations,
 * BirdWeather, hidden-position and observer sources left out.
 */
export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, GROUP_MAX);
  const ids = raw.map(stationIdFromSlug).filter((x): x is string => !!x);
  const stations = await loadStations(ids);
  const rows = await stationFeed(stations);
  return Response.json({ stations: stations.map((s) => ({ id: s.id, slug: s.slug, name: s.name, lastHeard: s.lastHeard })), rows }, {
    headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
