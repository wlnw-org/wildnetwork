import { clearSession, sameOrigin } from "@/lib/orcid";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  await clearSession();
  return Response.json({ ok: true });
}
