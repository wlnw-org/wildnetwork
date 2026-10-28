import { searchPlaces } from "@/lib/places";

/** GET /api/v1/places?q=chen : place suggestions for the map search (Open-Meteo geocoder, looked up server side). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const places = await searchPlaces(q).catch(() => []);
  return Response.json({ places }, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
