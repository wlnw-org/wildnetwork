import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { xcPool } from "@/lib/xcPool";
import { isArea, parseNear, pickNear, XcError, type Near, type XcClip } from "@/lib/xenocanto";

// Browsers keep a success for an hour and a failure not at all, so an XC outage is retried on the next panel open.
const withoutCoords = (c: XcClip): XcClip => { const o = { ...c }; delete o.lat; delete o.lon; return o; };
// The cache holds a pool per species and area; each response is the best two for the viewer's country, without coordinates.
const ok = (pool: XcClip[], near: Near | null, sMaxAge: number) =>
  Response.json({ clips: pickNear(pool, near).map(withoutCoords), credit: "Recordings courtesy of xeno-canto.org" }, {
    headers: { "cache-control": `public, max-age=${sMaxAge >= 3600 ? 3600 : 0}, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 7}` },
  });

/**
 * ?species=Eudynamys scolopaceus&area=asia&near=13,80 -> { clips: up to 2 xeno-canto recordings }.
 * The browser sends a continent and a point rounded to whole degrees (about 100 km); recordings from the country of the
 * nearest one come first. Coordinates never go to xeno-canto. For sensitive species both are ignored.
 * The XC key (XENO_CANTO_API_KEY) stays here. Any failure returns an empty list, so the panel just hides Listen.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const name = (p.get("species") ?? "").trim().replace(/\s+/g, " ");
  const key = process.env.XENO_CANTO_API_KEY;
  if (!key || !/^[A-Za-z-]+ [a-z-]+$/.test(name) || name.length > 80) return ok([], null, 3600);
  const areaParam = p.get("area");
  const sensitive = isSensitiveTaxon([name, name.split(" ")[0]]);
  const area = isArea(areaParam) && !sensitive ? areaParam : null;
  const near = sensitive ? null : parseNear(p.get("near"));
  try {
    const pool = await xcPool(name, area, key);
    return ok(pool ?? [], pool ? near : null, 86400);
  } catch (e) {
    if (!(e instanceof XcError)) console.error("recordings", e);
    return ok([], null, 600);
  }
}
