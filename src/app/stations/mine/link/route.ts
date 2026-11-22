import { NextResponse } from "next/server";
import { claimCookieOptions, getClaims } from "@/lib/myStations";
import { SITE } from "@/lib/site";
import { addClaim, CLAIM_COOKIE, claimSecret, decodeLink, encodeClaims, linkSecret } from "@/lib/stationClaims";

export const dynamic = "force-dynamic";

/** Opened from the BirdEcho app: adds the device in the signed link to this browser's "My stations", then shows the page. */
export async function GET(req: Request) {
  const device = decodeLink(new URL(req.url).searchParams.get("t"), linkSecret());
  if (!device) return NextResponse.redirect(`${SITE}/stations/mine?link=expired`, { status: 303, headers: { "referrer-policy": "no-referrer" } });
  const res = NextResponse.redirect(`${SITE}/stations/mine?link=added`, { status: 303, headers: { "referrer-policy": "no-referrer", "cache-control": "private, no-store" } });
  res.cookies.set(CLAIM_COOKIE, encodeClaims(addClaim(await getClaims(), device), claimSecret()), claimCookieOptions);
  return res;
}
