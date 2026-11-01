import { sql } from "@/lib/db";
import { getSession, sameOrigin } from "@/lib/orcid";
import { getProject } from "@/lib/projects";

/** Change a project. Body: { action: "open", on } | { action: "delete" } | { action: "removeMember", orcid }. Owner only (a member may remove themselves). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const me = await getSession();
  if (!me) return Response.json({ error: "Sign in with ORCID first." }, { status: 401 });
  const p = await getProject((await params).id);
  if (!p) return Response.json({ error: "No such project." }, { status: 404 });
  let b: { action?: string; on?: boolean; orcid?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (b.action === "removeMember" && (b.orcid === me.orcid || p.owner === me.orcid)) {
    await sql`DELETE FROM project_members WHERE project_id = ${p.id} AND orcid = ${b.orcid ?? ""}`;
    return Response.json({ ok: true });
  }
  if (p.owner !== me.orcid) return Response.json({ error: "Only the project's owner can do that." }, { status: 403 });
  if (b.action === "open") { await sql`UPDATE projects SET open = ${b.on === true} WHERE id = ${p.id}`; return Response.json({ ok: true }); }
  if (b.action === "delete") { await sql`DELETE FROM projects WHERE id = ${p.id}`; return Response.json({ ok: true }); }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
