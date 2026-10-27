import { ORCID_ENABLED, getSession } from "@/lib/orcid";

export const dynamic = "force-dynamic";

/** Who is signed in (ORCID iD and name), for client components. Never cached. */
export async function GET() {
  const s = await getSession();
  return Response.json({ enabled: ORCID_ENABLED, user: s }, { headers: { "cache-control": "private, no-store" } });
}
