import { COUNTRY_YEARS, OWN_PAGE, countryBySlug, hasPage, inName } from "@/lib/countries";

/** GET /api/v1/countries/spain : what the map's country panel shows (from src/data/country-seasons.json). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const c = countryBySlug((await params).slug);
  if (!c) return Response.json({ error: "unknown country" }, { status: 404 });
  const m = new Date().getUTCMonth() + 1, next = (m % 12) + 1;
  const visitor = (x: (typeof c.migrants)[number]) => ({ scientificName: x[0], vernacularName: x[1], status: x[2], arrive: x[4], leave: x[5] });
  return Response.json({
    slug: c.slug, name: c.name, inName: inName(c), records: c.records, years: COUNTRY_YEARS, visitors: c.migrants.length,
    page: hasPage(c) || OWN_PAGE.has(c.slug) ? `/arrivals/${c.slug}` : null,
    arriving: c.migrants.filter((x) => x[4] === m || x[4] === next).slice(0, 8).map(visitor),
    here: c.migrants.filter((x) => x[4] !== m && x[4] !== next && x[6][m - 1] >= 0.5).slice(0, 8).map(visitor),
    top: c.top.slice(0, 10).map(([sci, en, n, months]) => ({ scientificName: sci, vernacularName: en, records: n, months })),
  }, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
