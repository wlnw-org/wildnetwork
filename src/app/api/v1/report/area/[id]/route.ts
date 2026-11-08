import { AREA_GROUPS, areaGeo, areaReport, areaReportCsv, getArea, parsePeriod } from "@/lib/areaReport";

/** An area report as JSON, or ?format=csv (checklist), geojson or kml (boundary and stations). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const area = await getArea(id);
  if (!area) return Response.json({ error: "Unknown area." }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const group = sp.get("group") && AREA_GROUPS[sp.get("group")!] ? sp.get("group")! : "all";
  const r = await areaReport(area, parsePeriod(sp.get("from") ?? undefined, sp.get("to") ?? undefined), group);
  const cache = { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" };
  const file = area.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "area";
  switch (sp.get("format")) {
    case "csv": return new Response(areaReportCsv(r), { headers: { ...cache, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}-checklist.csv"` } });
    case "geojson": return new Response(areaGeo(r, "geojson"), { headers: { ...cache, "content-type": "application/geo+json", "content-disposition": `attachment; filename="${file}.geojson"` } });
    case "kml": return new Response(areaGeo(r, "kml"), { headers: { ...cache, "content-type": "application/vnd.google-earth.kml+xml", "content-disposition": `attachment; filename="${file}.kml"` } });
    default: return Response.json(r, { headers: cache });
  }
}
