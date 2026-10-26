import { SITE, SITE_NAME } from "@/lib/site";

/**
 * HTML emails for species alerts. Table layout and inline styles only, so they render the same in Gmail, Outlook and
 * Apple Mail; every value from the database goes through esc(). A plain text version is always sent alongside.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const C = { ink: "#0f172a", body: "#334155", muted: "#64748b", line: "#e2e8f0", page: "#eef2f6", dark: "#0b1220", accent: "#06b6d4", accentInk: "#083344", sun: "#f59e0b" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A Wikimedia thumbnail at email width (960 is one of the sizes Wikimedia serves; arbitrary widths return 400) instead of a multi-megabyte original. */
export function emailImage(thumbUrl: string | null, imageUrl: string | null): string | null {
  if (thumbUrl && /\/\d+px-[^/]+$/.test(thumbUrl)) return thumbUrl.replace(/\/\d+px-([^/]+)$/, "/960px-$1");
  return imageUrl ?? thumbUrl;
}

function button(href: string, label: string, primary = true): string {
  const bg = primary ? C.accent : "#ffffff";
  const fg = primary ? C.accentInk : C.ink;
  const border = primary ? C.accent : C.line;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 10px 0"><tr><td bgcolor="${bg}" style="border-radius:999px;border:2px solid ${border}">
<a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:700;color:${fg};text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;
}

function stat(value: string, label: string): string {
  return `<td width="33%" valign="top" style="padding:0 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f8fafc" style="border:1px solid ${C.line};border-radius:14px;padding:14px 10px;text-align:center">
<div style="font-family:${FONT};font-size:26px;line-height:30px;font-weight:800;color:${C.ink}">${esc(value)}</div>
<div style="font-family:${FONT};font-size:12px;line-height:16px;color:${C.muted};margin-top:4px">${esc(label)}</div></td></tr></table></td>`;
}

function shell(preheader: string, inner: string, footer: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(SITE_NAME)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 4px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/apple-icon.png" width="32" height="32" alt="" style="border:0;border-radius:8px;vertical-align:middle">
<span style="font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};vertical-align:middle;padding-left:8px">${esc(SITE_NAME)}</span></a></td>
<td align="right" valign="middle" style="font-family:${FONT};font-size:12px;color:${C.muted}">Species alert</td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.10)">${inner}</td></tr>
<tr><td style="padding:22px 18px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};text-align:center">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface ArrivalEmail {
  name: string; scientificName: string; place: string; week: string; records: number; absentWeeks: number;
  imageUrl: string | null; imageCredit: string | null; speciesUrl: string; mapUrl: string; unsubscribeUrl: string;
}

export function arrivalHtml(e: ArrivalEmail): string {
  const hero = e.imageUrl
    ? `<tr><td style="padding:0;line-height:0;font-size:0"><a href="${esc(e.mapUrl)}"><img src="${esc(e.imageUrl)}" width="600" alt="${esc(e.name)}" style="display:block;width:100%;max-width:600px;height:auto;max-height:380px;object-fit:cover;border:0;border-radius:22px 22px 0 0"></a></td></tr>`
    : "";
  const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${hero}
<tr><td bgcolor="${C.dark}" style="background:${C.dark};padding:26px 30px 28px;${e.imageUrl ? "" : "border-radius:22px 22px 0 0;"}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.sun}" style="border-radius:999px;padding:6px 12px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1.5px;color:#1f1300;text-transform:uppercase">&#9679; Just arrived</td></tr></table>
<h1 style="margin:16px 0 6px;font-family:${FONT};font-size:34px;line-height:40px;font-weight:800;color:#ffffff">The ${esc(e.name)} is back near ${esc(e.place.split(",")[0])}</h1>
<p style="margin:0;font-family:${FONT};font-size:16px;line-height:24px;color:#a5f3fc"><i>${esc(e.scientificName)}</i> &middot; week of ${esc(e.week)}</p>
</td></tr>
<tr><td style="padding:26px 24px 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${stat(e.records.toLocaleString("en-GB"), e.records === 1 ? "record this week" : "records this week")}
${stat(String(e.absentWeeks), "quiet weeks before")}
${stat("5°", "square around your place")}
</tr></table></td></tr>
<tr><td style="padding:16px 30px 4px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.body}">
After ${e.absentWeeks} weeks with sensors and observers listening and no sign of it, the ${esc(e.name)} has turned up again in your area around ${esc(e.place)}.
Now is a good time to look and listen for it.</td></tr>
<tr><td style="padding:20px 30px 10px">${button(e.mapUrl, "See it on the live map")}${button(e.speciesUrl, "Arrival dates and range", false)}</td></tr>
<tr><td style="padding:6px 30px 26px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.line};padding-top:16px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted}">
Records come from acoustic sensors and open biodiversity records, and automatic identification makes mistakes.
<a href="${SITE}/methods" style="color:#0e7490">How this is measured</a>.${e.imageCredit ? `<br>Photo: ${esc(e.imageCredit)}.` : ""}</td></tr></table></td></tr>
</table>`;
  const footer = `You asked to hear when the ${esc(e.name)} arrives near ${esc(e.place)}. You will hear about it again only after it has been away for a while.<br>
<a href="${esc(e.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline">Stop this alert</a> &middot; <a href="${SITE}/privacy#alerts" style="color:${C.muted};text-decoration:underline">Privacy</a> &middot; <a href="${SITE}" style="color:${C.muted};text-decoration:underline">${esc(SITE_NAME)}</a><br>
A free, non-commercial, open source project.`;
  return shell(`${e.records} records this week after ${e.absentWeeks} quiet weeks. See where it is now.`, inner, footer);
}

export function confirmHtml(o: { name: string; place: string; confirmUrl: string; imageUrl: string | null }): string {
  const hero = o.imageUrl
    ? `<tr><td style="padding:0;line-height:0;font-size:0"><img src="${esc(o.imageUrl)}" width="600" alt="${esc(o.name)}" style="display:block;width:100%;max-width:600px;height:auto;max-height:300px;object-fit:cover;border:0;border-radius:22px 22px 0 0"></td></tr>`
    : "";
  const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${hero}
<tr><td style="padding:30px 30px 8px">
<h1 style="margin:0 0 10px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:800;color:${C.ink}">One click and you are set</h1>
<p style="margin:0;font-family:${FONT};font-size:16px;line-height:26px;color:${C.body}">Confirm that you want an email when the <b>${esc(o.name)}</b> arrives near <b>${esc(o.place)}</b>.</p></td></tr>
<tr><td style="padding:18px 30px 8px">${button(o.confirmUrl, "Yes, alert me")}</td></tr>
<tr><td style="padding:4px 30px 28px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted}">
Not you? Ignore this email. Nothing is sent without confirmation, and the request is deleted after 7 days.</td></tr></table>`;
  return shell(`Confirm your ${o.name} alert for ${o.place}.`, inner, `<a href="${SITE}" style="color:${C.muted};text-decoration:underline">${esc(SITE_NAME)}</a> &middot; <a href="${SITE}/privacy#alerts" style="color:${C.muted};text-decoration:underline">Privacy</a>`);
}
