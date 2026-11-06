import { sql } from "@/lib/db";
import { exportCsv, getDataset } from "@/lib/datasets";

/** GET: a live dataset's records as Darwin Core style CSV, under the dataset's own licence. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const d = await getDataset((await ctx.params).id);
  if (!d || d.status !== "live") return Response.json({ error: "Not found." }, { status: 404 });
  await sql`UPDATE datasets SET downloads = downloads + 1 WHERE id = ${d.id}`;
  return new Response(await exportCsv(d), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wildlife-network-${d.id}.csv"`, "cache-control": "no-store" },
  });
}
