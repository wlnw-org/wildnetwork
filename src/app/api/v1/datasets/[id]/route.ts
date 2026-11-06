import { sql } from "@/lib/db";
import { getSession, sameOrigin } from "@/lib/orcid";
import { DATASET_LIMITS, DatasetError, addRecords, canManage, datasetFields, decide, getDataset, goLive, isReviewer, keyMatches, KEY_ACTIONS, matchNames, newUploadKey, revokeUploadKey, wdxToRows, reopen, runChecks, submit, withdraw } from "@/lib/datasets";
import type { UploadRow } from "@/lib/uploadParse";

export const maxDuration = 300;

type Body = { action?: string; events?: unknown[]; names?: string[]; rows?: UploadRow[]; rename?: Record<string, string>; species?: string; site?: string; status?: string; note?: string } & Record<string, unknown>;

/** Owner and reviewer actions on one dataset. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const d = await getDataset((await ctx.params).id);
  // An upload key (desktop tools, scripts) may add, check and submit records of its own dataset; everything else needs the owner signed in.
  const byKey = !!d && keyMatches(d, req);
  const me = byKey ? null : await getSession();
  if (!byKey) {
    if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!me) return Response.json({ error: "Sign in with ORCID first, or send the dataset's upload key." }, { status: 401 });
  }
  if (!d || (!byKey && !canManage(d, me!.orcid))) return Response.json({ error: "Not found." }, { status: 404 });
  let b: Body;
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (byKey && !KEY_ACTIONS.includes(String(b.action))) return Response.json({ error: `An upload key can only: ${KEY_ACTIONS.join(", ")}.` }, { status: 403 });
  const reviewer = !byKey && isReviewer(me!.orcid);
  try {
    switch (b.action) {
      case "update": {
        const v = datasetFields(b);
        if ("error" in v) return Response.json({ error: v.error }, { status: 400 });
        // The licence and checking rules are fixed once records count anywhere.
        const locked = d.status === "live" ? { license: d.license, min_conf: d.min_conf, method: d.method } : {};
        await sql`UPDATE datasets SET ${sql({ ...v, ...locked, people: sql.json(v.people as never), updated_at: new Date() } as never)} WHERE id = ${d.id}`;
        return Response.json({ ok: true });
      }
      case "names": {
        if (!Array.isArray(b.names)) return Response.json({ error: "names must be a list." }, { status: 400 });
        return Response.json({ matches: await matchNames(b.names.map(String)) });
      }
      case "records": {
        if (!Array.isArray(b.rows) || b.rows.length > DATASET_LIMITS.CHUNK) return Response.json({ error: `Send up to ${DATASET_LIMITS.CHUNK} rows at a time.` }, { status: 400 });
        return Response.json(await addRecords(d, b.rows, b.rename && typeof b.rename === "object" ? b.rename : {}));
      }
      case "events": {
        if (!Array.isArray(b.events) || b.events.length > DATASET_LIMITS.CHUNK) return Response.json({ error: `Send up to ${DATASET_LIMITS.CHUNK} WDX events at a time.` }, { status: 400 });
        return Response.json(await addRecords(d, wdxToRows(b.events), {}));
      }
      case "key": return Response.json({ key: await newUploadKey(d.id) });
      case "revokeKey": await revokeUploadKey(d.id); return Response.json({ ok: true });
      case "clear": {
        if (d.status !== "draft") return Response.json({ error: "Only a draft can be emptied." }, { status: 400 });
        await sql`DELETE FROM dataset_records WHERE dataset_id = ${d.id}`;
        await sql`UPDATE datasets SET records = 0, species = 0, sites = 0, first_day = NULL, last_day = NULL, checks = NULL WHERE id = ${d.id}`;
        return Response.json({ ok: true });
      }
      case "check": return Response.json({ checks: await runChecks(d) });
      case "submit": return Response.json({ status: await submit(d) });
      case "reopen": await reopen(d.id); return Response.json({ ok: true });
      case "withdraw": await withdraw(d.id); return Response.json({ ok: true });
      case "approve":
        if (!reviewer || d.status !== "review") return Response.json({ error: "Not allowed." }, { status: 403 });
        await goLive(d.id); return Response.json({ ok: true });
      case "return":
        if (!reviewer || d.status !== "review") return Response.json({ error: "Not allowed." }, { status: 403 });
        await reopen(d.id, String(b.note ?? "").slice(0, 1000) || null); return Response.json({ ok: true });
      case "decide": {
        const status = b.status === "confirmed" ? "confirmed" : b.status === "rejected" ? "rejected" : null;
        // Owners may drop their own flagged records; only a reviewer can confirm them.
        if (!status || (status === "confirmed" && !reviewer) || !b.species || !b.site) return Response.json({ error: "Not allowed." }, { status: 403 });
        return Response.json({ changed: await decide(d, String(b.species), String(b.site), status) });
      }
      default: return Response.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof DatasetError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
