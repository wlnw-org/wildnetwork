import { getAdminSession, sameOrigin } from "@/lib/orcid";
import { isLostReviewer, setVerdict, VERDICTS, type Verdict } from "@/lib/lostReview";

/** Private: a reviewer's verdict on one held lost species record. Needs a fresh ORCID sign-in (same rule as admin pages). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const a = await getAdminSession();
  if (!a || !isLostReviewer(a.session.orcid)) return Response.json({ error: "Not allowed" }, { status: 403 });
  if (!a.fresh) return Response.json({ error: "Please sign in again" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const b = (await req.json().catch(() => ({}))) as { verdict?: unknown; note?: unknown; hideArea?: unknown };
  const verdict = b.verdict === null ? null : VERDICTS.includes(b.verdict as Verdict) ? (b.verdict as Verdict) : undefined;
  if (!Number.isInteger(id) || verdict === undefined) return Response.json({ error: "Bad request" }, { status: 400 });
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null;
  const ok = await setVerdict(id, a.session.orcid, { verdict, note, hideArea: b.hideArea === true });
  return ok ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 });
}
