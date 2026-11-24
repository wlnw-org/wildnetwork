import { hashIp } from "@/lib/auth";
import { clientIp } from "@/lib/devices";
import { createClass } from "@/lib/quizClass";
import { isArea } from "@/lib/xenocanto";

/** POST {area} -> { code } : a new class for the daily bird sound. No account; a keyed hash of the address limits it to 20 a day. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isArea(body?.area)) return Response.json({ error: "area must be africa, america, asia, australia or europe" }, { status: 400 });
  const r = await createClass(body.area, hashIp("quiz-class", clientIp(req)));
  return Response.json(r, { status: "error" in r ? 429 : 200, headers: { "cache-control": "no-store" } });
}
