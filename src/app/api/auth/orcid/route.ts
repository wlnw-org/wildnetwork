import { ORCID_ENABLED, authorizeUrl } from "@/lib/orcid";

export const dynamic = "force-dynamic";

/** Start ORCID sign-in. ?next=/path to return to afterwards (same site only). */
export function GET(req: Request) {
  if (!ORCID_ENABLED) return Response.json({ error: "Sign-in is not available yet." }, { status: 503 });
  const next = new URL(req.url).searchParams.get("next") ?? "/research";
  return Response.redirect(authorizeUrl(next), 302);
}
