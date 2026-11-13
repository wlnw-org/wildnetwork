/**
 * Sends one entry of src/data/updates.ts to confirmed update subscribers. Dry run unless --send is given.
 *   pnpm exec tsx --env-file=.env.production.local scripts/send-update.mts            # newest update, dry run: prints counts
 *   pnpm exec tsx --env-file=.env.production.local scripts/send-update.mts 2026-11-07 # a given update, dry run
 *   pnpm exec tsx --env-file=.env.production.local scripts/send-update.mts --send     # send it
 * Mail shares the daily cap with species alerts (src/lib/alerts.ts). When the cap is reached it stops; run it again the
 * next day and it continues with the people who have not had this update yet (update_subs.last_sent).
 */
import { UPDATES } from "../src/data/updates";
import { sql } from "../src/lib/db";
import { sendMail } from "../src/lib/alerts";
import { tryDecrypt } from "../src/lib/optin";
import { updateOneClickUrl, updateText, UPDATES_ENABLED } from "../src/lib/updates";
import { SITE_NAME } from "../src/lib/site";

const args = process.argv.slice(2);
const send = args.includes("--send");
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? UPDATES[0]?.date;
const u = UPDATES.find((x) => x.date === date);
if (!u) throw new Error(`No update dated ${date} in src/data/updates.ts`);

const [{ confirmed, pending, unconfirmed }] = await sql<{ confirmed: number; pending: number; unconfirmed: number }[]>`
  SELECT COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS confirmed,
         COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL AND (last_sent IS NULL OR last_sent < ${u.date}::date))::int AS pending,
         COUNT(*) FILTER (WHERE confirmed_at IS NULL)::int AS unconfirmed
  FROM update_subs`;
console.log(`Update ${u.date}: "${u.title}"`);
console.log(`Confirmed subscribers: ${confirmed}. Not yet sent this update: ${pending}. Unconfirmed (never mailed): ${unconfirmed}.`);

if (!send) {
  console.log("\nDry run. Preview of the email:\n");
  console.log(updateText(u, "TOKEN"));
  console.log("\nRun with --send to send it.");
} else {
  if (!UPDATES_ENABLED) throw new Error("RESEND_API_KEY and ALERTS_FROM must be set.");
  const due = await sql<{ id: number; email_enc: string; token: string }[]>`
    SELECT id, email_enc, token FROM update_subs
    WHERE confirmed_at IS NOT NULL AND (last_sent IS NULL OR last_sent < ${u.date}::date) ORDER BY id`;
  let sent = 0;
  for (const s of due) {
    const to = tryDecrypt(s.email_enc);
    if (!to) continue; // encrypted with an older key
    const ok = await sendMail("update", to, `${SITE_NAME}: ${u.title}`, updateText(u, s.token), updateOneClickUrl(s.token));
    if (!ok) { console.log("Stopped: daily mail cap reached or a mail error. Run again tomorrow to continue."); break; }
    await sql`UPDATE update_subs SET last_sent = ${u.date}::date WHERE id = ${s.id}`;
    sent++;
  }
  console.log(`Sent ${sent} of ${due.length}.`);
}
await sql.end();
