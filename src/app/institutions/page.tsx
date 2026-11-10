import type { Metadata } from "next";
import Link from "next/link";
import CopyBlock from "@/components/CopyBlock";
import { DATA_CONCEPT_DOI, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "For institutions and GBIF nodes: connecting a national system",
  alternates: { canonical: "/institutions" },
  description: "How a national biodiversity system, GBIF node, park or museum can send detection data to Wildlife Network, take open data out, which licences are accepted, how sensitive species are protected and how credit works.",
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) =>
  href.startsWith("/") ? <Link href={href} className="text-cyan-400 hover:underline">{children}</Link> : <a href={href} className="text-cyan-400 hover:underline">{children}</a>;
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="mt-10 mb-2 text-xl font-semibold text-slate-100 scroll-mt-6">{children}</h2>;

export default function Institutions() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">For institutions and GBIF nodes</h1>
        <p className="mt-3">
          This page is for a national biodiversity system, a GBIF node, a park, a museum or a university team that wants to connect to Wildlife Network. It
          covers how to send data in, how to take data out, which licences we accept, how sensitive species are protected, and how credit works. Everything
          here is free and needs no agreement to start.
        </p>
        <ul className="mt-4 list-disc pl-5 space-y-1 text-sm">
          <li><a href="#in" className="text-cyan-400 hover:underline">Sending data in</a></li>
          <li><a href="#out" className="text-cyan-400 hover:underline">Taking data out</a></li>
          <li><a href="#licences" className="text-cyan-400 hover:underline">Licences</a></li>
          <li><a href="#privacy" className="text-cyan-400 hover:underline">Privacy and sensitive species</a></li>
          <li><a href="#credit" className="text-cyan-400 hover:underline">Credit</a></li>
        </ul>

        <H2 id="in">Sending data in</H2>
        <p>Pick the route that matches how your data is produced. All three use the open <A href="https://github.com/arunrajiah/wildlife-detection-exchange">WDX</A> format or a plain table.</p>
        <h3 className="mt-5 font-semibold text-slate-100">1. Past surveys and field seasons: a contributed dataset</h3>
        <p>
          Upload a table of detections or observations (BirdNET, Kaleidoscope or any CSV) at <A href="/datasets/new">/datasets/new</A>. Names are matched to
          the GBIF backbone, records are checked for range, season and bursts, and the dataset gets its own page, citation and Darwin Core download. Signing in
          needs an ORCID iD, so each dataset is credited to a real person. For large or repeated loads, create an <b>upload key</b> on the dataset page and send
          rows from a script (up to 2,000 per request):
        </p>
        <CopyBlock>{`curl -X POST ${SITE}/api/v1/datasets/DATASET_ID \\
  -H "Authorization: Bearer YOUR_UPLOAD_KEY" -H "content-type: application/json" \\
  -d '{"action":"records","rows":[{"site":"Pond A","lat":-8.75,"lon":26.75,"ts":"2025-06-01T05:12:00Z","name":"Pycnonotus barbatus","confidence":0.92}]}'

curl -X POST ${SITE}/api/v1/datasets/DATASET_ID \\
  -H "Authorization: Bearer YOUR_UPLOAD_KEY" -H "content-type: application/json" -d '{"action":"submit"}'`}</CopyBlock>
        <p className="mt-2 text-sm text-slate-400">The same key also accepts WDX events with <code>{'"action": "events"'}</code>. A key can add records, run the checks and submit that one dataset, nothing else.</p>

        <h3 className="mt-5 font-semibold text-slate-100">2. A live system: push WDX events</h3>
        <p>
          If your system already produces detections as they happen, register a key for it and post WDX events (one event, an array or NDJSON, up to 5,000
          per request). Keys are tied to one source system, so a key can only write that system&apos;s records.
        </p>
        <CopyBlock>{`curl -X POST ${SITE}/api/v1/register \\
  -H 'content-type: application/json' \\
  -d '{"name":"national-acoustic-network","source":"other"}'

curl -X POST ${SITE}/api/v1/events \\
  -H "Authorization: Bearer wn_YOUR_KEY" \\
  -H "content-type: application/x-ndjson" \\
  --data-binary @events.wdx.ndjson`}</CopyBlock>
        <p className="mt-2 text-sm text-slate-400">Field details are in the <A href="/developers">Developers and API page</A> and the <A href="https://github.com/arunrajiah/wildlife-detection-exchange">WDX schema</A>.</p>

        <h3 className="mt-5 font-semibold text-slate-100">3. Recorders in the field: the wdx-agent</h3>
        <p>
          For BirdNET-Pi, BirdNET-Go, camera traps (SpeciesNet), bat detectors (BatDetect2) or any software that writes a table, the free{" "}
          <A href="https://github.com/arunrajiah/wdx-agent">wdx-agent</A> runs next to it, registers the station and sends new detections. Coordinates are
          rounded to about 1 km before they leave the device. Step by step: <A href="/contribute">Contribute data</A>.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Publishing to GBIF already? Records published to GBIF under CC0 or CC BY 4.0 reach Wildlife Network on their own, usually one to two weeks after
          GBIF receives them. There is no need to send them twice.
        </p>

        <H2 id="out">Taking data out</H2>
        <ul className="list-disc pl-5 space-y-2">
          <li><b>Open data releases</b>: weekly records, effort and arrival dates on a 5 degree grid, versioned on Zenodo with a DOI (<A href={`https://doi.org/${DATA_CONCEPT_DOI}`}>{DATA_CONCEPT_DOI}</A>, always the newest). See <A href="/data">Open data</A>.</li>
          <li><b>API</b>: JSON and CSV for arrivals, coverage, movement and open weekly records (<code className="text-slate-200">/api/v1/records</code>). See the <A href="/developers">Developers and API page</A> and <A href="/openapi.json">OpenAPI file</A>.</li>
          <li><b>Contributed datasets</b>: each dataset page has a Darwin Core CSV under the owner&apos;s licence, with positions rounded to the precision the owner chose.</li>
          <li><b>Places and parks</b>: a <A href="/report">site report</A> shows what was recorded around a point for any dates, with a CSV of the open records.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-400">
          BirdWeather detections power much of the live map with BirdWeather&apos;s agreement, but they are never in a download, a release or a bulk export.
        </p>

        <H2 id="licences">Licences</H2>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>CC0</b> and <b>CC BY 4.0</b>: accepted for every route. These records count in every measure and may appear in open downloads, with credit.</li>
          <li><b>CC BY-NC 4.0</b>: accepted for contributed datasets only. They count in the measures and are downloadable from the dataset&apos;s own page under that licence, but are left out of the open weekly records and the releases.</li>
          <li>Records pulled from GBIF and iNaturalist are limited to CC0 and CC BY.</li>
        </ul>

        <H2 id="privacy">Privacy and sensitive species</H2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Every measure works on 5 degree cells (about 550 km). Exact points are never needed to take part.</li>
          <li>The wdx-agent rounds station coordinates to about 1 km. Dataset owners choose the precision of their public download (1, 10, 25 or 50 km).</li>
          <li>Sensitive species on our <A href="https://github.com/wlnw-org/wildnetwork/blob/main/scripts/sensitive_species.txt">published list</A> are rounded to 1 degree in dataset downloads and are never named against a station in site reports. Tell us which species are sensitive in your country and we add them.</li>
          <li>Station owners and institutions can ask for a species, a station or a place to be hidden: email arunrajiah@gmail.com and it is done within two days.</li>
          <li>What the site itself collects about visitors is on the <A href="/privacy">privacy page</A>.</li>
        </ul>

        <H2 id="credit">Credit</H2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Each contributed dataset has its own page and citation, and is named on the species pages and site reports that use it.</li>
          <li>GBIF records are credited by dataset, with DOIs, in the About panel and in every release (datasets.csv).</li>
          <li>Downloads carry a citation line. Releases have a CITATION.cff file and a DOI.</li>
          <li>Your data stays yours. Sending it here does not transfer any rights; you can withdraw a dataset or a station at any time.</li>
        </ul>

        <p className="mt-10 text-sm text-slate-400">
          Questions, or a national list of sensitive species to add? Email arunrajiah@gmail.com. Researchers: see also <A href="/research">Research</A>.
        </p>
      </div>
    </main>
  );
}
