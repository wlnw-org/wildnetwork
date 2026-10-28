import { getNames } from "@/lib/names";

/** GET /api/v1/names?names=Hirundo rustica,Turdus merula (max 200) -> { [scientificName]: { es, fr, de, pt, hi, ta } } */
export async function GET(req: Request) {
  const list = (new URL(req.url).searchParams.get("names") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  return Response.json(await getNames(list), { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
