import { sql } from "@/lib/db";
import { getSession, sameOrigin } from "@/lib/orcid";
import { STUDY_LIMITS, getStudy } from "@/lib/studies";

/**
 * Change a study. Body: { action: "addMember", orcid } | { action: "removeMember", orcid } | { action: "digest", on } |
 * { action: "delete" }. Owner only (a member may remove themselves).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const me = await getSession();
  if (!me) return Response.json({ error: "Sign in with ORCID first." }, { status: 401 });
  const s = await getStudy((await params).id);
  if (!s) return Response.json({ error: "No such study." }, { status: 404 });
  let b: { action?: string; orcid?: string; on?: boolean };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const owner = s.owner === me.orcid;
  const orcid = (b.orcid ?? "").trim().replace(/^https?:\/\/orcid\.org\//, "");
  if (b.action === "removeMember" && orcid === me.orcid) {
    await sql`DELETE FROM study_members WHERE study_id = ${s.id} AND orcid = ${orcid}`;
    return Response.json({ ok: true });
  }
  if (!owner) return Response.json({ error: "Only the study's owner can do that." }, { status: 403 });
  if (b.action === "addMember") {
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) return Response.json({ error: "Enter an ORCID iD like 0000-0002-1825-0097." }, { status: 400 });
    const [known] = await sql`SELECT 1 FROM researchers WHERE orcid = ${orcid}`;
    if (!known) return Response.json({ error: "That researcher has not signed in to Wildlife Network yet. Ask them to sign in once with ORCID, then add them." }, { status: 400 });
    const [{ c }] = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM study_members WHERE study_id = ${s.id}`;
    if (c >= STUDY_LIMITS.MEMBERS) return Response.json({ error: "This study has the maximum number of collaborators." }, { status: 400 });
    await sql`INSERT INTO study_members (study_id, orcid) VALUES (${s.id}, ${orcid}) ON CONFLICT DO NOTHING`;
    return Response.json({ ok: true });
  }
  if (b.action === "removeMember") { await sql`DELETE FROM study_members WHERE study_id = ${s.id} AND orcid = ${orcid}`; return Response.json({ ok: true }); }
  if (b.action === "digest") { await sql`UPDATE studies SET digest = ${b.on === true} WHERE id = ${s.id}`; return Response.json({ ok: true }); }
  if (b.action === "delete") { await sql`DELETE FROM studies WHERE id = ${s.id}`; return Response.json({ ok: true }); }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
