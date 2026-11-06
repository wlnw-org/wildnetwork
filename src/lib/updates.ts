import { sql } from "@/lib/db";
import { ALERTS_ENABLED, emailHash, encryptEmail, newToken, sendMail } from "@/lib/alerts";
import { SITE, SITE_NAME } from "@/lib/site";
import type { Update } from "@/data/updates";

/**
 * Update emails: a short note every week or two about what changed on the site. Same mail setup as species alerts
 * (Resend, the shared daily cap, encrypted addresses, confirm first, one-click unsubscribe). Nothing is sent from the
 * site itself except the confirmation; updates go out only when Arun runs scripts/send-update.mts.
 */
export const UPDATES_ENABLED = ALERTS_ENABLED;
export const UPDATE_LIMITS = { PER_IP_PER_DAY: 5 };

export const updateUnsubscribeUrl = (token: string) => `${SITE}/updates/unsubscribe?token=${token}`;
/** For the one-click List-Unsubscribe POST that mail clients send (RFC 8058). */
export const updateOneClickUrl = (token: string) => `${SITE}/api/v1/updates?token=${token}`;
export const validToken = (t: string) => /^[A-Za-z0-9_-]{10,64}$/.test(t);

export type SubscribeResult = { ok: true; message: string } | { ok: false; status: number; error: string };

export async function subscribe(rawEmail: string, ipHash: string): Promise<SubscribeResult> {
  if (!UPDATES_ENABLED) return { ok: false, status: 503, error: "Update emails are not available yet." };
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return { ok: false, status: 400, error: "Please enter a valid email address." };
  await sql`DELETE FROM update_subs WHERE confirmed_at IS NULL AND created_at < now() - interval '7 days'`;
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM update_subs WHERE created_ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= UPDATE_LIMITS.PER_IP_PER_DAY) return { ok: false, status: 429, error: "Too many sign-ups from here today. Please try tomorrow." };
  const [row] = await sql<{ token: string; confirmed: boolean; fresh: boolean }[]>`
    INSERT INTO update_subs (email_enc, email_hash, token, created_ip_hash)
    VALUES (${encryptEmail(email)}, ${emailHash(email)}, ${newToken()}, ${ipHash})
    ON CONFLICT (email_hash) DO UPDATE SET email_hash = EXCLUDED.email_hash
    RETURNING token, confirmed_at IS NOT NULL AS confirmed, (xmax = 0) AS fresh`;
  if (row.confirmed) return { ok: true, message: "You are already signed up for updates." };
  // One confirmation per address per request window: a repeat sign-up does not send another email (unconfirmed rows expire after 7 days).
  if (!row.fresh) return { ok: true, message: "A confirmation email was already sent to this address. Check your inbox and spam folder." };
  const confirmUrl = `${SITE}/updates/confirm?token=${row.token}`;
  const sent = await sendMail("update-confirm", email, `Confirm ${SITE_NAME} updates`,
    `Someone (hopefully you) asked ${SITE_NAME} to send this address a short update every week or two about what is new on the site.\n\n` +
    `Confirm: ${confirmUrl}\n\n` +
    `If this was not you, ignore this email: nothing is sent without confirmation and the request is deleted after 7 days.\n\n${SITE_NAME}, ${SITE}`);
  if (!sent) return { ok: false, status: 503, error: "Could not send the confirmation email right now. Please try again later." };
  return { ok: true, message: "Almost done: check your inbox and confirm." };
}

export async function unsubscribe(token: string): Promise<void> {
  await sql`DELETE FROM update_subs WHERE token = ${token}`;
}

export async function confirm(token: string): Promise<boolean> {
  if (!validToken(token)) return false;
  const rows = await sql`UPDATE update_subs SET confirmed_at = COALESCE(confirmed_at, now()) WHERE token = ${token} RETURNING id`;
  return rows.length > 0;
}

/** The plain-text email for one update. */
export function updateText(u: Update, token: string): string {
  const date = new Date(u.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return [
    `${SITE_NAME} update, ${date}`, "", u.title, "",
    ...u.items.map((i) => `- ${i.text}${i.href ? `\n  ${i.href.startsWith("/") ? SITE + i.href : i.href}` : ""}`),
    "", `All updates: ${SITE}/updates`, "",
    `You get this because you signed up at ${SITE}/updates. Stop these emails: ${updateUnsubscribeUrl(token)}`,
  ].join("\n");
}
