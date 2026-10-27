import { ORCID_ENABLED, exchangeCode, readState, setSession } from "@/lib/orcid";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!ORCID_ENABLED) return Response.redirect(`${SITE}/research`, 302);
  const p = new URL(req.url).searchParams;
  const next = readState(p.get("state"));
  const code = p.get("code");
  if (!next || !code) return Response.redirect(`${SITE}/research?signin=failed`, 302);
  try {
    await setSession(await exchangeCode(code));
  } catch (e) {
    console.error("orcid", e);
    return Response.redirect(`${SITE}/research?signin=failed`, 302);
  }
  return Response.redirect(`${SITE}${next}`, 302);
}
