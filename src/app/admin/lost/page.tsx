import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LostVerdict from "@/components/LostVerdict";
import SignInAgain from "@/components/SignInAgain";
import { getAdminSession, ORCID_ENABLED } from "@/lib/orcid";
import { isLostReviewer, listFlags, REWILD_CONTACT, rewildEmail, VERDICT_LABEL, type LostFlag } from "@/lib/lostReview";

export const metadata: Metadata = { title: "Lost species to review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = (d: Date | string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const SOURCE: Record<string, string> = { inaturalist: "iNaturalist", gbif: "GBIF", birdweather: "BirdWeather", "birdweather-optin": "BirdWeather (opted-in station)", obis: "OBIS", orcasound: "Orcasound", acartia: "Acartia" };
const sourceName = (s: string) => (s.startsWith("dataset:") ? "Uploaded dataset" : SOURCE[s] ?? `Device or tool (${s})`);
const safeUrl = (u: string | null) => (u && (/^https:\/\//.test(u) || u.startsWith("/")) ? u : null);

function sourceLink(f: LostFlag): string | null {
  if (f.source_system === "inaturalist" && f.source_record) return `https://www.inaturalist.org/observations/${encodeURIComponent(f.source_record)}`;
  return safeUrl(f.source_url);
}

function Flag({ f }: { f: LostFlag }) {
  const link = sourceLink(f);
  const media = safeUrl(f.media_url);
  const where = f.latitude != null && f.longitude != null
    ? f.kind === "count" ? `5 degree square centred on ${f.latitude.toFixed(1)}, ${f.longitude.toFixed(1)}` : `${f.latitude.toFixed(3)}, ${f.longitude.toFixed(3)}`
    : "Unknown";
  return (
    <li className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg text-slate-100"><i>{f.scientific_name}</i>{f.common_name && <span className="text-slate-300">, {f.common_name}</span>}</p>
        <span className="text-xs text-slate-400">{f.verdict ? `${VERDICT_LABEL[f.verdict]}${f.reviewed_at ? `, ${fmt(f.reviewed_at)}` : ""}` : "Not reviewed"}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {[f.class_name, f.red_list && `Red List ${f.red_list}`, f.countries && `Last known from ${f.countries}${f.region ? ` (${f.region})` : ""}`].filter(Boolean).join(". ")}
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-slate-400">Source </dt><dd className="inline">{sourceName(f.source_system)}{link && <> (<a href={link} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">open record</a>)</>}</dd></div>
        <div><dt className="inline text-slate-400">Name received </dt><dd className="inline"><i>{f.name_received}</i></dd></div>
        <div><dt className="inline text-slate-400">When </dt><dd className="inline">{f.observed_at ? fmt(f.observed_at) : f.period ?? "Unknown"}</dd></div>
        <div><dt className="inline text-slate-400">Where (private) </dt><dd className="inline">{where}</dd></div>
        {f.count != null && <div><dt className="inline text-slate-400">{f.kind === "count" ? "Detections counted " : "Individuals "}</dt><dd className="inline">{f.count}</dd></div>}
        {f.confidence != null && <div><dt className="inline text-slate-400">Model confidence </dt><dd className="inline">{f.confidence.toFixed(2)}</dd></div>}
        <div><dt className="inline text-slate-400">First held </dt><dd className="inline">{fmt(f.first_seen)}</dd></div>
      </dl>
      <div className="mt-3">
        {media && f.media_type?.startsWith("image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media} alt={`Photo sent as ${f.name_received}`} className="max-h-72 rounded-md border border-white/10" referrerPolicy="no-referrer" />
        ) : media && f.media_type?.startsWith("audio") ? (
          <audio controls preload="none" src={media} className="w-full max-w-md" />
        ) : media ? (
          <a href={media} target="_blank" rel="noreferrer" className="text-sm text-cyan-400 hover:underline">Open the media file</a>
        ) : (
          <p className="text-sm text-slate-500">{f.kind === "count" ? "A count from an aggregate, with no photo or recording here. Only the source can check it." : "No photo or recording was sent with this record."}</p>
        )}
      </div>
      <LostVerdict id={f.id} verdict={f.verdict} note={f.note} hideArea={f.hide_area}
        rewild={{ ...rewildEmail(f), to: REWILD_CONTACT, sentAt: f.rewild_sent_at ? new Date(f.rewild_sent_at).toISOString() : null }} />
    </li>
  );
}

/** Private review queue for held records of lost species (src/lib/lost.ts). Reviewers only, fresh ORCID sign-in. */
export default async function LostReview() {
  const a = await getAdminSession();
  if (!a || !isLostReviewer(a.session.orcid)) {
    if (!a && ORCID_ENABLED) return (
      <main className="flex-1 bg-slate-950 text-slate-300"><div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-2xl font-semibold text-slate-100">Lost species to review</h1>
        <p className="mt-3"><a href="/api/auth/orcid?next=/admin/lost" className="text-cyan-400 hover:underline">Sign in with ORCID</a> to continue.</p>
      </div></main>
    );
    notFound();
  }
  if (!a.fresh) return <SignInAgain next="/admin/lost" />;
  const flags = await listFlags().catch(() => [] as LostFlag[]);
  const open = flags.filter((f) => !f.verdict).length;
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-4xl px-5 py-10 text-[15px]">
        <p className="text-sm"><Link href="/admin" className="text-cyan-400 hover:underline">Admin</Link></p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">Lost species to review</h1>
        <p className="mt-2 max-w-2xl">These records name a species that has not been confirmed in the wild for 10 years or more. They are held back from the map, the data downloads and every other public page. Most will be identification mistakes.</p>
        <p className="mt-2 max-w-2xl">A verdict here publishes nothing. Before anything is called a possible rediscovery, an expert must confirm it and Re:wild must be told.</p>
        <p className="mt-4 text-sm text-slate-400">{open} not reviewed, {flags.length} in all. Places are shown only to reviewers.</p>
        {flags.length === 0 ? <p className="mt-6 text-slate-400">Nothing held yet.</p> : <ul className="mt-6 space-y-4">{flags.map((f) => <Flag key={f.id} f={f} />)}</ul>}
        <p className="mt-10 text-xs text-slate-500">Watch list: species marked lost in Lindken et al. 2024, Global Change Biology, data CC0 (doi.org/10.5061/dryad.v6wwpzh31), from the Re:wild and IUCN SSC lost species list.</p>
      </div>
    </main>
  );
}
