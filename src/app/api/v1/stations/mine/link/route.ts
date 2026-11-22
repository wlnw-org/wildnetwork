import { authenticate } from "@/lib/auth";
import { countClaimAttempt } from "@/lib/myStations";
import { SITE } from "@/lib/site";
import { encodeLink, linkSecret, LINK_MINUTES, validDeviceId } from "@/lib/stationClaims";

export const dynamic = "force-dynamic";

const no = (error: string, status: number) => Response.json({ error }, { status, headers: { "cache-control": "private, no-store" } });

/**
 * For the BirdEcho app ("Manage from anywhere"): POST with the device's own key (Authorization: Bearer wn_...) and get
 * back a link that adds the station to "My stations" in the browser it is opened in. The link carries only the device
 * id, signed, and expires after LINK_MINUTES; the key never goes into a URL.
 */
export async function POST(req: Request) {
  if (!(await countClaimAttempt(req))) return no("too-many", 429);
  const info = await authenticate(req);
  if (!info) return no("bad-key", 401);
  if (!info.deviceId || !validDeviceId(info.deviceId)) return no("not-device", 403);
  const url = `${SITE}/stations/mine/link?t=${encodeLink(info.deviceId, linkSecret())}`;
  return Response.json({ url, expiresInMinutes: LINK_MINUTES }, { headers: { "cache-control": "private, no-store" } });
}
