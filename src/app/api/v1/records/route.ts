import { openRecordsCsv, openRows, parseOpenQuery } from "@/lib/openRecords";

/**
 * GET /api/v1/records?species=Hirundo rustica | lat=..&lon=.. [&from=YYYY-MM-DD&to=..][&group=avian][&format=csv]
 * Weekly records per 5 degree cell that may be reused: GBIF (CC0 / CC BY 4.0) and contributed datasets under CC0 or
 * CC BY 4.0. BirdWeather-derived counts are never included. See src/lib/openRecords.ts.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const q = parseOpenQuery(p);
  if (!q) return Response.json({ error: "species, or lat and lon, required" }, { status: 400 });
  const cache = { "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" };
  if (p.get("format") === "csv") {
    const name = (q.species ?? `${q.cell!.lat}_${q.cell!.lon}`).replace(/[^A-Za-z0-9_-]+/g, "_");
    return new Response(await openRecordsCsv(q), {
      headers: { ...cache, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wildlife-network-open-records-${name}.csv"` },
    });
  }
  return Response.json({ query: q, licence: "GBIF records under CC0 or CC BY 4.0, contributed datasets under CC0 or CC BY 4.0", records: await openRows(q) }, { headers: cache });
}
