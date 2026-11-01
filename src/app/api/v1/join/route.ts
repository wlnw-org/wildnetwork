import { getSession, sameOrigin } from "@/lib/orcid";
import { JoinError, askToJoin, cleanEmail, decideRequest, withdrawRequest, type JoinTarget } from "@/lib/projects";

/**
 * Requests to join a project or a study. Body: { action: "ask", project | study, message, email? } |
 * { action: "withdraw", id } | { action: "accept" | "decline", id, email? }.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const me = await getSession();
  if (!me) return Response.json({ error: "Sign in with ORCID first." }, { status: 401 });
  let b: { action?: string; project?: string; study?: string; id?: string; message?: string; email?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const email = b.email ? cleanEmail(b.email) : null;
  if (b.email && !email) return Response.json({ error: "That email does not look right." }, { status: 400 });
  const id = /^\d{1,18}$/.test(b.id ?? "") ? b.id! : null;
  try {
    if (b.action === "ask") {
      const target: JoinTarget | null = b.project ? { project: b.project } : b.study ? { study: b.study } : null;
      if (!target) return Response.json({ error: "Join what?" }, { status: 400 });
      return Response.json({ ok: true, message: await askToJoin(target, me, b.message ?? "", email) });
    }
    if (!id) return Response.json({ error: "Which request?" }, { status: 400 });
    if (b.action === "withdraw") { await withdrawRequest(id, me.orcid); return Response.json({ ok: true, message: "Withdrawn." }); }
    if (b.action === "accept" || b.action === "decline") return Response.json({ ok: true, message: await decideRequest(id, me, b.action === "accept", email) });
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof JoinError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
