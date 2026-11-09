// Tells the maintainer about new lost species flags: one short email at most every hour, from the status background task.
// The email names the species and source only; no places or coordinates leave the private review page.
import { sql } from "@/lib/db";
import { sendMail } from "@/lib/alerts";
import { MAINTAINER } from "@/lib/projects";
import { SITE } from "@/lib/site";

export async function notifyLostFlags(): Promise<number> {
  let rows: { id: number; scientific_name: string; source_system: string }[];
  try {
    rows = await sql`
      SELECT f.id, s.scientific_name, f.source_system FROM lost_flags f JOIN lost_species s ON s.id = f.lost_id
      WHERE f.notified_at IS NULL ORDER BY f.first_seen LIMIT 200`;
  } catch { return 0; /* tables not created yet */ }
  if (!rows.length) return 0;
  const lines = [...new Map(rows.map((r) => [`${r.scientific_name} (${r.source_system.startsWith("dataset:") ? "uploaded dataset" : r.source_system})`, 0])).keys()];
  const text = [
    `${rows.length} new record${rows.length === 1 ? "" : "s"} of lost species ${rows.length === 1 ? "was" : "were"} held back for review:`,
    "", ...lines.map((l) => `- ${l}`), "",
    "Most will be misidentifications. Nothing has been published.",
    `Review them at ${SITE}/admin/lost`,
  ].join("\n");
  const ok = await sendMail("lost-flag", MAINTAINER.email, `Lost species: ${rows.length} record${rows.length === 1 ? "" : "s"} to review`, text);
  if (ok) await sql`UPDATE lost_flags SET notified_at = now() WHERE id = ANY(${rows.map((r) => r.id)})`;
  return ok ? rows.length : 0;
}
