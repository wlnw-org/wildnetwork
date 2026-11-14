import { speciesTracks } from "@/lib/tracks";

/**
 * Tracked journeys of one species: GET /api/v1/species/<scientific name>/tracks -> { species, datasets: [{ id, title, doi,
 * citation, licence }], tracks: [{ dataset, animal, from, to, points: [[lon, lat], ...] (one a day, 0.1 degree) }] }.
 * 404 when no open tracking dataset covers the species. Source: Movebank Data Repository (CC0 / CC BY).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name);
  const data = await speciesTracks(name);
  if (!data) return Response.json({ error: "no tracks" }, { status: 404, headers: { "cache-control": "public, s-maxage=86400" } });
  const tracks = data.tracks.map((t) => ({ dataset: t.dataset, animal: t.animal, from: t.from, to: t.to, points: t.points }));
  return Response.json({ species: data.species, datasets: data.datasets, tracks, source: "Movebank Data Repository" },
    { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
