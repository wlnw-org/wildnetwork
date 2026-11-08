import { recordUse } from "@/lib/appUsage";

/** Studio's update check (tauri.conf.json updater endpoint, one per app start): counted, then GitHub's latest.json is passed
 * through. On any failure it answers 502 so the updater falls back to its second endpoint, GitHub itself. */
const LATEST = "https://github.com/wlnw-org/wlnw-studio/releases/latest/download/latest.json";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  await recordUse(req, "studio", "check", q.get("v"), [q.get("target"), q.get("arch")].filter(Boolean).join("-"));
  try {
    const r = await fetch(LATEST, { next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return new Response(null, { status: 502 });
    return new Response(await r.text(), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { return new Response(null, { status: 502 }); }
}
