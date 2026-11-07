import { parseReportQuery, siteReport, siteReportCsv } from "@/lib/siteReport";

/**
 * GET /api/v1/report?lat=12.74&lon=80.25&km=10&from=2027-01-01&to=2027-03-31[&from2=..&to2=..][&group=avian][&format=csv]
 * What stations within km of a point recorded in a period, optionally against a second period. See src/lib/siteReport.ts.
 */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const q = parseReportQuery(params);
  if (!q) return Response.json({ error: "lat and lon required" }, { status: 400 });
  const cache = { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" };
  if (params.format === "csv") {
    return new Response(await siteReportCsv(q), {
      headers: { ...cache, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wildlife-network-site-report-${q.lat}-${q.lon}.csv"` },
    });
  }
  return Response.json(await siteReport(q, { openOnly: true }), { headers: cache });
}
