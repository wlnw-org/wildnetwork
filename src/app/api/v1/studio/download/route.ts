import { recordUse } from "@/lib/appUsage";
import { STUDIO_DOWNLOADS } from "@/lib/site";

/** Download buttons on /studio: counted per system, then redirected to the newest installer on GitHub. */
export async function GET(req: Request) {
  const os = new URL(req.url).searchParams.get("os") ?? "";
  const href = (STUDIO_DOWNLOADS as Record<string, string>)[os];
  if (!href) return Response.json({ error: `Unknown os. Use one of: ${Object.keys(STUDIO_DOWNLOADS).join(", ")}.` }, { status: 400 });
  await recordUse(req, "studio", "download", "latest", os);
  return Response.redirect(href, 302);
}
