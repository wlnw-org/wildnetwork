import type { Metadata } from "next";
import Link from "next/link";
import WorldMap from "@/components/WorldMap";
import { sql } from "@/lib/db";
import { REGION } from "@/lib/methods";
import { REGIONS } from "@/lib/regions";
import { INDEXED_GROUPS, SITE, SITE_DESCRIPTION, SITE_NAME, SOCIAL, speciesSlug } from "@/lib/site";

// The species list below is read from the arrivals table; refreshed hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  // Only the home page carries these; other pages would otherwise share the home page's title and URL in link previews.
  openGraph: { type: "website", url: "/", title: "Wildlife Network: live map of bird and wildlife migration", description: SITE_DESCRIPTION },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: "en",
      publisher: { "@type": "Person", name: "Arun Rajiah", url: "https://www.arunrajiah.com" } },
    { "@type": "Organization", "@id": `${SITE}/#org`, name: SITE_NAME, url: SITE, logo: `${SITE}/logo.svg`, sameAs: SOCIAL.map((s) => s.href) },
    { "@type": "WebApplication", name: SITE_NAME, url: SITE, applicationCategory: "EducationalApplication", operatingSystem: "Any",
      description: SITE_DESCRIPTION, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isAccessibleForFree: true,
      codeRepository: "https://github.com/wlnw-org/wildnetwork", license: "https://www.gnu.org/licenses/agpl-3.0.html" },
  ],
};

/** Species whose well supported arrival falls in the last eight weeks, newest first: crawlable links from the home page. */
async function arrivingNow(): Promise<{ name: string; common: string | null; region: string }[]> {
  const rows = await sql<{ scientific_name: string; vernacular_name: string | null; region: string }[]>`
    SELECT DISTINCT ON (p.scientific_name) p.scientific_name, p.vernacular_name,
      ${REGION} AS region
    FROM phenology p JOIN species_group g USING (scientific_name)
    WHERE g.grp IN ${sql([...INDEXED_GROUPS])} AND COALESCE(p.arrival_support, 0) >= 0.5
      AND make_date(EXTRACT(YEAR FROM now())::int, EXTRACT(MONTH FROM p.arrival_week)::int, 1) BETWEEN date_trunc('month', now()) - interval '1 month' AND now()
    ORDER BY p.scientific_name, p.arrival_support DESC LIMIT 400`.catch(() => []);
  return rows.slice(0, 40).map((r) => ({ name: r.scientific_name, common: r.vernacular_name, region: r.region }));
}

export default async function Home() {
  const arriving = await arrivingNow();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* The map is drawn in the browser; this gives screen readers and crawlers the same orientation in words. */}
      <div className="sr-only">
        <h1>Wildlife Network: a live map of bird, bat and wildlife movement</h1>
        <p>{SITE_DESCRIPTION}</p>
        <nav aria-label="Pages">
          <Link href="/species">Species: migration and arrival dates</Link>
          <Link href="/arrivals">When do birds arrive? Arrival dates by region</Link>
          <Link href="/places">Birds and wildlife near you: city reports</Link>
          <Link href="/research">Research: study areas, expert review, starter code</Link>
          <Link href="/methods">Methods</Link>
          <Link href="/validation">Validation</Link>
          <Link href="/contribute">Contribute data</Link>
          <Link href="/data">Open data</Link>
          <Link href="/developers">API for developers and researchers</Link>
          <Link href="/stations">Stations</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <nav aria-label="Arrival dates by region">
          {REGIONS.map((r) => <Link key={r.slug} href={`/arrivals/${r.slug}`}>When birds arrive in {r.name}</Link>)}
          <Link href="/arrivals/uk">When birds arrive in the UK</Link>
          <Link href="/arrivals/india">Migratory birds in India</Link>
        </nav>
        {arriving.length > 0 && (
          <section aria-label="Arriving around now">
            <h2>Arriving around now</h2>
            <ul>{arriving.map((a) => <li key={a.name}><Link href={`/species/${speciesSlug(a.name)}`}>{a.common ?? a.name}</Link> ({a.region})</li>)}</ul>
          </section>
        )}
      </div>
      <WorldMap />
    </>
  );
}
