import { cronAuthorized } from "@/lib/auth";
import { healthProblems } from "@/lib/baseDevices";

export const dynamic = "force-dynamic";

/** Base health problems for the server monitor (deploy/monitor.sh), which emails them. CRON_SECRET only. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ problems: await healthProblems() }, { headers: { "cache-control": "no-store" } });
}
