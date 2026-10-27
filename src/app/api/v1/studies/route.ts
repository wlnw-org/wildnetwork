import { sql } from "@/lib/db";
import { encryptToken } from "@/lib/optin";
import { getSession, sameOrigin } from "@/lib/orcid";
import { GROUP_LABEL, STUDY_LIMITS, newStudyId, snap } from "@/lib/studies";

/**
 * Create a study area. Body: { title, question?, bbox: [west, south, east, north], grp, species?: string[], email?, digest? }.
 * The box is snapped outwards to the 5 degree grid. Signed-in (ORCID) researchers only.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const me = await getSession();
  if (!me) return Response.json({ error: "Sign in with ORCID first." }, { status: 401 });
  let b: { title?: string; question?: string; bbox?: number[]; grp?: string; species?: string[]; email?: string; digest?: boolean };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const title = (b.title ?? "").trim().slice(0, 120);
  if (title.length < 3) return Response.json({ error: "Give the study a title." }, { status: 400 });
  const [w, s, e, n] = (b.bbox ?? []).map(Number);
  if (![w, s, e, n].every(Number.isFinite) || w >= e || s >= n) return Response.json({ error: "Choose an area on the map." }, { status: 400 });
  const box = { lat_min: Math.max(-90, snap(s)), lat_max: Math.min(85, snap(n - 1e-9)), lon_min: Math.max(-180, snap(w)), lon_max: Math.min(175, snap(e - 1e-9)) };
  const cells = ((box.lat_max - box.lat_min) / 5 + 1) * ((box.lon_max - box.lon_min) / 5 + 1);
  if (cells > STUDY_LIMITS.MAX_CELLS) return Response.json({ error: `That area has ${cells} cells; the limit is ${STUDY_LIMITS.MAX_CELLS}. Zoom in.` }, { status: 400 });
  const grp = b.grp && GROUP_LABEL[b.grp] ? b.grp : "avian";
  const species = (b.species ?? []).map((x) => String(x).trim()).filter((x) => /^[A-Z][a-z]+ [a-z-]+$/.test(x)).slice(0, 50);
  const email = (b.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return Response.json({ error: "That email does not look right." }, { status: 400 });
  const [{ c }] = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM studies WHERE owner = ${me.orcid}`;
  if (c >= STUDY_LIMITS.PER_OWNER) return Response.json({ error: `You already have ${c} studies.` }, { status: 400 });
  if (email) await sql`UPDATE researchers SET email_enc = ${encryptToken(email)} WHERE orcid = ${me.orcid}`;
  const id = newStudyId();
  await sql`INSERT INTO studies (id, owner, title, question, lat_min, lat_max, lon_min, lon_max, grp, species, digest)
    VALUES (${id}, ${me.orcid}, ${title}, ${(b.question ?? "").trim().slice(0, 1000) || null}, ${box.lat_min}, ${box.lat_max}, ${box.lon_min}, ${box.lon_max}, ${grp}, ${species}, ${b.digest !== false && !!email})`;
  return Response.json({ ok: true, id });
}
