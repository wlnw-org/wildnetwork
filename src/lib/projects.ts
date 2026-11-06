import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { sendMail } from "@/lib/alerts";
import { encryptToken, decryptToken } from "@/lib/optin";
import { orcidUrl } from "@/lib/orcid";
import { SITE } from "@/lib/site";
import { STUDY_LIMITS } from "@/lib/studies";

/**
 * Project board and requests to join. A project is a public question with the help it needs; a request to join goes to the
 * owner of a project or a study, who accepts or declines. Email addresses stay encrypted and private: they are passed on
 * only when a request is accepted, to the two people concerned.
 */
export const PROJECT_LIMITS = { PER_OWNER: 10, MEMBERS: 25, ASKS_PER_DAY: 10, TITLE: 140, QUESTION: 3000, MESSAGE: 1000 };
export const NEEDS: Record<string, string> = {
  ecology: "Ecology",
  taxonomy: "Species identification",
  fieldwork: "Field recordings",
  local: "Local knowledge",
  stats: "Statistics",
  code: "Code and data",
};

export interface Project {
  id: string; owner: string; owner_name: string; title: string; question: string; needs: string[];
  species: string | null; region: string | null; study_id: string | null; study_title: string | null; open: boolean; created: string;
}
export interface JoinRequest { id: string; orcid: string; name: string; message: string | null; created: string }
export type JoinTarget = { project: string } | { study: string };

/** The maintainer's address is public already, and the starter projects are theirs; everyone else's comes from their own sign-in. */
export const MAINTAINER = { orcid: "0009-0009-5957-5814", email: "arunrajiah@gmail.com" };
const contactEmail = (orcid: string, enc: string | null) => (enc ? decryptToken(enc) : orcid === MAINTAINER.orcid ? MAINTAINER.email : null);

const validEmail = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(e);
export const cleanEmail = (v: unknown): string | null => {
  const e = String(v ?? "").trim().toLowerCase();
  return validEmail(e) ? e : null;
};
/** Known need keys only, each once. */
export const cleanNeeds = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(String))].filter((n) => n in NEEDS) : []);
export const newProjectId = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();

const projectRows = (where: ReturnType<typeof sql>) => sql<Project[]>`
  SELECT p.id, p.owner, r.name AS owner_name, p.title, p.question, p.needs, p.species, p.region, p.study_id, s.title AS study_title, p.open,
         p.created_at::date::text AS created
  FROM projects p JOIN researchers r ON r.orcid = p.owner LEFT JOIN studies s ON s.id = p.study_id
  ${where} ORDER BY p.open DESC, p.created_at DESC, p.id LIMIT 200`;

export const listProjects = (need?: string) => projectRows(need && need in NEEDS ? sql`WHERE ${need} = ANY(p.needs)` : sql``);
export const getProject = async (id: string): Promise<Project | null> => (await projectRows(sql`WHERE p.id = ${id}`))[0] ?? null;
export const projectMembers = (id: string) => sql<{ orcid: string; name: string }[]>`
  SELECT m.orcid, r.name FROM project_members m JOIN researchers r USING (orcid) WHERE m.project_id = ${id} ORDER BY m.added_at`;

const targetCol = (t: JoinTarget) => ("project" in t ? sql`project_id = ${t.project}` : sql`study_id = ${t.study}`);

export const pendingRequests = (t: JoinTarget) => sql<JoinRequest[]>`
  SELECT q.id::text AS id, q.orcid, r.name, q.message, q.created_at::date::text AS created
  FROM join_requests q JOIN researchers r USING (orcid) WHERE ${targetCol(t)} AND q.status = 'pending' ORDER BY q.created_at`;

/** The signed-in researcher's own request and whether a contact email is on file, for the join panel. */
export async function joinState(t: JoinTarget, orcid: string) {
  const [[mine], [me]] = await Promise.all([
    sql<{ id: string; status: string }[]>`SELECT id::text AS id, status FROM join_requests WHERE ${targetCol(t)} AND orcid = ${orcid}`,
    sql<{ has_email: boolean }[]>`SELECT email_enc IS NOT NULL AS has_email FROM researchers WHERE orcid = ${orcid}`,
  ]);
  return { request: mine ?? null, hasEmail: !!me?.has_email };
}

async function targetInfo(t: JoinTarget) {
  const [row] = "project" in t
    ? await sql<{ owner: string; title: string; open: boolean; email_enc: string | null }[]>`
        SELECT p.owner, p.title, p.open, r.email_enc FROM projects p JOIN researchers r ON r.orcid = p.owner WHERE p.id = ${t.project}`
    : await sql<{ owner: string; title: string; open: boolean; email_enc: string | null }[]>`
        SELECT s.owner, s.title, true AS open, r.email_enc FROM studies s JOIN researchers r ON r.orcid = s.owner WHERE s.id = ${t.study}`;
  return row ?? null;
}
const targetUrl = (t: JoinTarget) => ("project" in t ? `${SITE}/projects/${t.project}` : `${SITE}/studies/${t.study}`);
const saveEmail = (orcid: string, email: string) => sql`UPDATE researchers SET email_enc = ${encryptToken(email)} WHERE orcid = ${orcid}`;

export class JoinError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function askToJoin(t: JoinTarget, me: { orcid: string; name: string }, message: string, email: string | null): Promise<string> {
  const info = await targetInfo(t);
  if (!info) throw new JoinError("That project or study no longer exists.", 404);
  if (info.owner === me.orcid) throw new JoinError("You already run this one.");
  if (!info.open) throw new JoinError("This project is closed to new people.");
  const member = "project" in t
    ? await sql`SELECT 1 FROM project_members WHERE project_id = ${t.project} AND orcid = ${me.orcid}`
    : await sql`SELECT 1 FROM study_members WHERE study_id = ${t.study} AND orcid = ${me.orcid}`;
  if (member.length) throw new JoinError("You are already on this one.");
  const text = message.trim().slice(0, PROJECT_LIMITS.MESSAGE);
  if (text.length < 10) throw new JoinError("Please say in a sentence or two what you would bring.");
  const [{ asks }] = await sql<{ asks: number }[]>`SELECT COUNT(*)::int AS asks FROM join_requests WHERE orcid = ${me.orcid} AND created_at > now() - interval '1 day'`;
  if (asks >= PROJECT_LIMITS.ASKS_PER_DAY) throw new JoinError("That is a lot of requests for one day. Please try again tomorrow.", 429);
  const [mine] = await sql<{ has_email: boolean }[]>`SELECT email_enc IS NOT NULL AS has_email FROM researchers WHERE orcid = ${me.orcid}`;
  if (!email && !mine?.has_email) throw new JoinError("Please give an email, so the owner can reach you if they accept.");
  if (email) await saveEmail(me.orcid, email);
  const added = await sql`
    INSERT INTO join_requests (project_id, study_id, orcid, message)
    VALUES (${"project" in t ? t.project : null}, ${"study" in t ? t.study : null}, ${me.orcid}, ${text}) ON CONFLICT DO NOTHING RETURNING id`;
  if (!added.length) throw new JoinError("You have already asked. The owner's reply stands.");
  const ownerEmail = contactEmail(info.owner, info.email_enc);
  const mailed = ownerEmail && await sendMail("join", ownerEmail, `${me.name} asked to join "${info.title}"`,
    `${me.name} (${orcidUrl(me.orcid)}) asked to join "${info.title}":\n\n${text}\n\nAccept or decline: ${targetUrl(t)}\n\nIf you accept, you each receive the other's email address.\n\nWildlife Network, ${SITE}`).catch(() => false);
  return mailed ? "Sent. The owner has been emailed." : "Sent. The owner will see it when they next open this page.";
}

/** The requester may withdraw while it is pending; the row goes, so they can ask again later. */
export async function withdrawRequest(id: string, orcid: string): Promise<void> {
  await sql`DELETE FROM join_requests WHERE id = ${id}::bigint AND orcid = ${orcid} AND status = 'pending'`;
}

/** Owner accepts or declines. Accepting adds the member and introduces the two by email. */
export async function decideRequest(id: string, me: { orcid: string; name: string }, accept: boolean, email: string | null): Promise<string> {
  const [q] = await sql<{ project_id: string | null; study_id: string | null; orcid: string; name: string; email_enc: string | null }[]>`
    SELECT q.project_id, q.study_id, q.orcid, r.name, r.email_enc FROM join_requests q JOIN researchers r USING (orcid) WHERE q.id = ${id}::bigint AND q.status = 'pending'`;
  if (!q) throw new JoinError("That request has already been answered.", 404);
  const t: JoinTarget = q.project_id ? { project: q.project_id } : { study: q.study_id! };
  const info = await targetInfo(t);
  if (!info || info.owner !== me.orcid) throw new JoinError("Only the owner can answer this request.", 403);
  if (!accept) {
    await sql`UPDATE join_requests SET status = 'declined', message = NULL, decided_at = now() WHERE id = ${id}::bigint`;
    return "Declined.";
  }
  const ownerEmail = email ?? contactEmail(info.owner, info.email_enc);
  if (!ownerEmail) throw new JoinError("Please give your email first: it is sent to the person you accept.");
  if (email) await saveEmail(me.orcid, email);
  const [{ c }] = "project" in t
    ? await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM project_members WHERE project_id = ${t.project}`
    : await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM study_members WHERE study_id = ${t.study}`;
  if (c >= ("project" in t ? PROJECT_LIMITS.MEMBERS : STUDY_LIMITS.MEMBERS)) throw new JoinError("This one already has the maximum number of collaborators.");
  await sql.begin(async (tx) => {
    await tx`UPDATE join_requests SET status = 'accepted', message = NULL, decided_at = now() WHERE id = ${id}::bigint`;
    if ("project" in t) await tx`INSERT INTO project_members (project_id, orcid) VALUES (${t.project}, ${q.orcid}) ON CONFLICT DO NOTHING`;
    else await tx`INSERT INTO study_members (study_id, orcid) VALUES (${t.study}, ${q.orcid}) ON CONFLICT DO NOTHING`;
  });
  const theirEmail = contactEmail(q.orcid, q.email_enc);
  const toThem = theirEmail && await sendMail("join", theirEmail, `You have joined "${info.title}"`,
    `${me.name} accepted your request to join "${info.title}".\n\nYou can reach them at ${ownerEmail}.\nPage: ${targetUrl(t)}\n\nWildlife Network, ${SITE}`).catch(() => false);
  const toOwner = theirEmail && await sendMail("join", ownerEmail, `${q.name} has joined "${info.title}"`,
    `${q.name} (${orcidUrl(q.orcid)}) is now on "${info.title}".\n\nYou can reach them at ${theirEmail}.\nPage: ${targetUrl(t)}\n\nWildlife Network, ${SITE}`).catch(() => false);
  return toThem && toOwner
    ? `Accepted. You have each been sent the other's email address.`
    : `Accepted, but the introduction email could not be sent. Please contact ${q.name} through their ORCID page.`;
}
