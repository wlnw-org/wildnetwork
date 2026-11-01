import { sql } from "@/lib/db";
import { getSession, sameOrigin } from "@/lib/orcid";
import { PROJECT_LIMITS, cleanEmail, cleanNeeds, newProjectId } from "@/lib/projects";
import { canEdit } from "@/lib/studies";
import { encryptToken } from "@/lib/optin";

/** Post a project. Body: { title, question, needs: string[], species?, region?, studyId?, email? }. Needs ORCID sign-in and a contact email on file. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const me = await getSession();
  if (!me) return Response.json({ error: "Sign in with ORCID first." }, { status: 401 });
  let b: { title?: string; question?: string; needs?: unknown; species?: string; region?: string; studyId?: string; email?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const title = (b.title ?? "").trim().slice(0, PROJECT_LIMITS.TITLE), question = (b.question ?? "").trim().slice(0, PROJECT_LIMITS.QUESTION);
  if (title.length < 5) return Response.json({ error: "Please give the project a title." }, { status: 400 });
  if (question.length < 20) return Response.json({ error: "Please describe the question in a sentence or two." }, { status: 400 });
  const needs = cleanNeeds(b.needs);
  if (!needs.length) return Response.json({ error: "Please pick at least one kind of help." }, { status: 400 });
  const [{ n, has_email }] = await sql<{ n: number; has_email: boolean }[]>`
    SELECT (SELECT COUNT(*)::int FROM projects WHERE owner = ${me.orcid}) AS n,
           (SELECT email_enc IS NOT NULL FROM researchers WHERE orcid = ${me.orcid}) AS has_email`;
  if (n >= PROJECT_LIMITS.PER_OWNER) return Response.json({ error: `You can keep up to ${PROJECT_LIMITS.PER_OWNER} projects.` }, { status: 400 });
  const email = b.email ? cleanEmail(b.email) : null;
  if (b.email && !email) return Response.json({ error: "That email does not look right." }, { status: 400 });
  if (!email && !has_email) return Response.json({ error: "Please give an email, so requests to join can reach you." }, { status: 400 });
  const studyId = (b.studyId ?? "").trim() || null;
  if (studyId && !(await canEdit(studyId, me.orcid))) return Response.json({ error: "You can only link a study you work on." }, { status: 400 });
  if (email) await sql`UPDATE researchers SET email_enc = ${encryptToken(email)} WHERE orcid = ${me.orcid}`;
  const id = newProjectId();
  await sql`INSERT INTO projects (id, owner, title, question, needs, species, region, study_id)
    VALUES (${id}, ${me.orcid}, ${title}, ${question}, ${needs}, ${(b.species ?? "").trim().slice(0, 120) || null}, ${(b.region ?? "").trim().slice(0, 120) || null}, ${studyId})`;
  return Response.json({ ok: true, id });
}
