import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Link from "next/link";
import { METHODS_VERSION, OBSERVED } from "@/lib/methods";
import { DATA_CONCEPT_DOI, DATA_RELEASES, SITE, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Open data: weekly wildlife records, effort and arrival dates",
  alternates: { canonical: "/data" },
  description: "Citable, versioned downloads of weekly bird, bat, amphibian and insect records on a 5 degree grid, with observation effort and arrival dates, from openly licensed GBIF records.",
};

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** schema.org Dataset, so the releases appear in Google Dataset Search and other dataset indexes. */
function datasetJsonLd() {
  const latest = DATA_RELEASES[0];
  if (!latest) return null;
  const creator = { "@type": "Person", name: "Arun Rajiah", email: "arunrajiah@gmail.com" };
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${SITE}/data`,
    name: "Wildlife Network open data: weekly bird, bat, amphibian and insect records, observation effort and arrival dates",
    alternateName: `${SITE_NAME} open data`,
    description:
      "Weekly counts of openly licensed (CC0 and CC BY 4.0) GBIF occurrence records per species on a global 5 degree grid, for birds (Aves), bats (Chiroptera), " +
      "amphibians (Amphibia) and insects (Insecta), with the total records per class, cell and week (observation effort) for effort correction, and seasonal " +
      "arrival, peak and departure weeks per species and cell with 90% intervals. Every row carries the GBIF species key; datasets.csv lists every contributing " +
      "GBIF dataset with its DOI. Versioned releases archived on Zenodo.",
    url: `${SITE}/data`,
    identifier: [`https://doi.org/${DATA_CONCEPT_DOI}`, ...(latest.doi ? [`https://doi.org/${latest.doi}`] : [])],
    sameAs: `https://doi.org/${DATA_CONCEPT_DOI}`,
    version: String(DATA_RELEASES.length),
    datePublished: DATA_RELEASES[DATA_RELEASES.length - 1].date,
    dateModified: latest.date,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE },
    keywords: ["bird migration", "phenology", "arrival dates", "biodiversity", "GBIF", "occurrence data", "sampling effort", "bats", "amphibians", "insects", "macroecology", "species distribution"],
    ...(latest.period ? { temporalCoverage: latest.period } : {}),
    spatialCoverage: { "@type": "Place", name: "Global, 5 degree grid", geo: { "@type": "GeoShape", box: "-90 -180 90 180" } },
    variableMeasured: ["week", "cell_lat", "cell_lon", "class", "gbif_species_key", "scientific_name", "records", "arrival_week", "arrival_low", "arrival_high", "arrival_support", "peak_week", "departure_week", "peak_per_1000"],
    isBasedOn: "https://www.gbif.org",
    citation: latest.doi ? `Rajiah, A. (${latest.date.slice(0, 4)}). Wildlife Network open data release ${latest.date}. Zenodo. https://doi.org/${latest.doi}` : undefined,
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/zip", contentUrl: latest.zip }],
    includedInDataCatalog: { "@type": "DataCatalog", name: "Zenodo", url: "https://zenodo.org" },
  };
}

export default function Data() {
  const latest = DATA_RELEASES[0];
  const ld = datasetJsonLd();
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Open data</h1>
        <p className="mt-2"><HelpLink to="/help/site/data" /></p>
        <p className="mt-3">
          Versioned files for research and teaching: weekly records per species on a 5 degree grid, the observation effort behind them, and seasonal arrival
          dates. Built only from records their publishers released under CC0 or CC BY 4.0 through GBIF, so you may reuse them under CC BY 4.0 with credit.
        </p>

        <section id="get" className="mt-6 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
          <h2 className="text-lg font-semibold text-slate-100">Get the data</h2>
          <ul className="mt-2 space-y-2 text-sm">
            <li><b>Open data releases</b> (below): every species, cell and week in one zip, with a DOI on Zenodo (<a href={`https://doi.org/${DATA_CONCEPT_DOI}`} className="text-cyan-400 hover:underline">{DATA_CONCEPT_DOI}</a>, always the newest). Best for papers.</li>
            <li><b>CSV per species</b>: every <Link href="/species" className="text-cyan-400 hover:underline">species page</Link> has a Download box with its weekly records for the last 12 months and its arrival dates per area.</li>
            <li><b>CSV per place</b>: a <Link href="/report" className="text-cyan-400 hover:underline">site report</Link> downloads the weekly records of a station or a 5 degree area for your own dates. <Link href="/studies" className="text-cyan-400 hover:underline">Study areas</Link> export a whole box.</li>
            <li><b>Contributed datasets</b>: each <Link href="/datasets" className="text-cyan-400 hover:underline">dataset</Link> has its own Darwin Core CSV, licence and citation.</li>
            <li><b>API</b>: JSON and CSV for scripts, R and Python (<Link href="/developers" className="text-cyan-400 hover:underline">Developers and API page</Link>). <code className="text-slate-200">/api/v1/records?species=…&amp;format=csv</code> gives the same open weekly records as the species pages.</li>
          </ul>
          <p className="mt-2 text-xs text-slate-400">Downloads hold GBIF records under CC0 or CC BY 4.0 and contributed datasets under their own licence. BirdWeather detections are never in a download. Sending data in, or connecting a national system: see <Link href="/institutions" className="text-cyan-400 hover:underline">for institutions</Link>.</p>
        </section>

        {latest ? (
          <section className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100">Latest release: {fmt(latest.date)}</h2>
            <p className="mt-1 text-sm text-slate-400">Weeks {latest.weeks} · methods {latest.methods ?? METHODS_VERSION}{latest.doi ? <> · DOI <a href={`https://doi.org/${latest.doi}`} className="text-cyan-400 hover:underline">{latest.doi}</a></> : null}</p>
            <ul className="mt-3 text-sm space-y-1">
              <li><b>weekly_records.csv</b>: {latest.rows.weekly.toLocaleString("en-GB")} rows (week, cell, class, species, records)</li>
              <li><b>effort.csv</b>: {latest.rows.effort.toLocaleString("en-GB")} rows (all records of a class per cell and week)</li>
              <li><b>arrivals.csv</b>: {latest.rows.arrivals.toLocaleString("en-GB")} rows (arrival, peak and departure week per species and cell)</li>
              {latest.rows.taxa ? <li><b>taxa.csv</b>: {latest.rows.taxa.toLocaleString("en-GB")} species with their GBIF species keys (every file carries the key: join on it, not on names)</li> : null}
              <li><b>datasets.csv</b>: {latest.rows.datasets.toLocaleString("en-GB")} contributing GBIF datasets with DOIs, for citation</li>
            </ul>
            {latest.notes && <p className="mt-2 text-sm text-slate-400">{latest.notes}</p>}
            <p className="mt-3 flex flex-wrap gap-3">
              <a href={latest.zip} className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Download (zip)</a>
              <a href={latest.url} className="inline-block rounded-md border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5">Release notes</a>
            </p>
          </section>
        ) : (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">The first release is being prepared.</p>
        )}

        {DATA_RELEASES.length > 1 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100">Earlier releases</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm">
              {DATA_RELEASES.slice(1).map((r) => (
                <li key={r.date}>{fmt(r.date)}: <a href={r.zip} className="text-cyan-400 hover:underline">zip</a>{r.doi ? <>, DOI <a href={`https://doi.org/${r.doi}`} className="text-cyan-400 hover:underline">{r.doi}</a></> : null}</li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mt-8 text-xl font-semibold text-slate-100">What is in it</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Birds, bats, amphibians and insects (other mammals from release 6 on); human and machine observations with coordinates and no geospatial issues.</li>
          <li>Counts are records, not animals. Use <b>effort.csv</b> to turn them into shares and to judge coverage: Wildlife Network treats a cell-week as watched by observers at {OBSERVED.MIN_EFFORT_WEEK} bird records ({OBSERVED.SMALL_MIN_EFFORT_WEEK} for other classes).</li>
          <li>Arrival dates follow the rule on the <Link href="/methods#measures" className="text-cyan-400 hover:underline">methods page</Link>, applied to these records alone.</li>
          <li>The last two weeks are left out because GBIF receives records late.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">What is not in it</h2>
        <p className="mt-2">
          BirdWeather acoustic detections. They power much of the live map with BirdWeather&apos;s agreement, but redistribution has not been agreed, so they are
          not in any release or bulk download.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Citing</h2>
        <p className="mt-2">
          Cite the release you used{latest?.doi ? " by its DOI" : ""} (to refer to the data in general, the DOI{" "}
          <a href={`https://doi.org/${DATA_CONCEPT_DOI}`} className="text-cyan-400 hover:underline">{DATA_CONCEPT_DOI}</a> always points to the newest release), and the GBIF datasets listed in datasets.csv as GBIF asks
          (<a href="https://www.gbif.org/citation-guidelines" className="text-cyan-400 hover:underline">GBIF citation guidelines</a>). Each release folder has a CITATION.cff file.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Live access</h2>
        <p className="mt-2">
          For current figures use the open API (<Link href="/developers" className="text-cyan-400 hover:underline">documentation and R and Python examples</Link>): <code className="text-slate-200">/api/v1/coverage</code> (who watches each cell), <code className="text-slate-200">/api/v1/arrivals?species=…&amp;format=csv</code>,{" "}
          <code className="text-slate-200">/api/v1/species/…/movement</code>, <code className="text-slate-200">/api/v1/records?lat=…&amp;lon=…&amp;format=csv</code> (open weekly records only). API responses mix sources and are for viewing; for analysis, use the releases.
        </p>
      </div>
    </main>
  );
}
