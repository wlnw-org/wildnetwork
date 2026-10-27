import { getStudy, studyExport } from "@/lib/studies";

/** CSV of the GBIF-derived weekly records in a study area. Public, like the study page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getStudy((await params).id);
  if (!s) return Response.json({ error: "No such study." }, { status: 404 });
  return new Response(await studyExport(s), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wildlife-network-study-${s.id}.csv"`, "cache-control": "public, s-maxage=3600" },
  });
}
