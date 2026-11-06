import { sql } from "@/lib/db";
import { getSession, sameOrigin } from "@/lib/orcid";
import { DATASET_LIMITS, datasetFields, newDatasetId } from "@/lib/datasets";

/** GET: live datasets (public). */
export async function GET() {
  const rows = await sql`SELECT id, title, institution, license, grp, records, species, sites, first_day::text, last_day::text, doi, live_at::text
    FROM datasets WHERE status = 'live' ORDER BY live_at DESC`;
  return Response.json({ datasets: rows }, { headers: { "cache-control": "public, s-maxage=600" } });
}

/** POST: describe a new dataset (draft). Needs ORCID sign-in. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const me = await getSession();
  if (!me) return Response.json({ error: "Sign in with ORCID first." }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const v = datasetFields(b);
  if ("error" in v) return Response.json({ error: v.error }, { status: 400 });
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM datasets WHERE owner = ${me.orcid}`;
  if (n >= DATASET_LIMITS.PER_OWNER) return Response.json({ error: `You can keep up to ${DATASET_LIMITS.PER_OWNER} datasets.` }, { status: 400 });
  const id = newDatasetId(v.title);
  const people = v.people.length ? v.people : [{ name: me.name, orcid: me.orcid }];
  await sql`INSERT INTO datasets ${sql({ id, owner: me.orcid, ...v, people: sql.json(people as never) } as never)}`;
  return Response.json({ ok: true, id });
}
