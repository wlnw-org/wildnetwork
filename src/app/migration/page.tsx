import type { Metadata } from "next";
import Link from "next/link";
import HelpLink from "@/components/HelpLink";
import { TR } from "@/components/TR";
import PLACES from "@/data/places.json";
import { compass, radarNight, type RadarNight } from "@/lib/radar";
import { SITE } from "@/lib/site";

// The radar import runs once a day (Europe 05:00, US 06:00 UTC); an hourly refresh is plenty.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Bird migration last night: weather radar over Europe and the US" },
  description: "How many birds flew over Europe and the United States last night, which way they went, and where the night was unusually busy, from weather radars. Updated every day.",
  alternates: { canonical: "/migration" },
};

type Region = { key: "europe" | "us"; label: string; radars: RadarNight[] };

/** Nearest city on our places list within 250 km, for a readable radar name. */
function near(r: { lat: number; lon: number }): string | null {
  let best: { name: string; d: number } | null = null;
  for (const p of PLACES as { name: string; lat: number; lon: number }[]) {
    const dLat = (p.lat - r.lat) * 111, dLon = (p.lon - r.lon) * 111 * Math.cos((r.lat * Math.PI) / 180);
    const d = Math.hypot(dLat, dLon);
    if (d <= 250 && (!best || d < best.d)) best = { name: p.name, d };
  }
  return best?.name ?? null;
}

/** Traffic-weighted mean direction of movement over a region's radars, or null when there is too little to say. */
function mainHeading(rs: RadarNight[]): number | null {
  let x = 0, y = 0;
  for (const r of rs) if (r.dir != null) { x += r.vid * Math.sin((r.dir * Math.PI) / 180); y += r.vid * Math.cos((r.dir * Math.PI) / 180); }
  const total = rs.reduce((s, r) => s + r.vid, 0);
  if (total < 1 || Math.hypot(x, y) < 0.3 * total) return null; // birds went every which way
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export default async function MigrationPage() {
  const data = await radarNight().catch(() => null);
  const ok = (data?.radars ?? []).filter((r) => !r.clutter);
  const regions: Region[] = [
    { key: "europe", label: "Europe", radars: ok.filter((r) => r.radar.length !== 4) },
    { key: "us", label: "United States", radars: ok.filter((r) => r.radar.length === 4) },
  ];
  const date = data?.night ? new Date(data.night + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage", name: "Bird migration last night", url: `${SITE}/migration`,
    ...(data?.night ? { dateModified: data.night } : {}),
    isPartOf: { "@id": `${SITE}/#website` },
  };

  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Bird migration last night" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/map" /></p>
        <p className="mt-3">
          <TR k="Most migrating birds fly at night, out of sight. Weather radars in Europe and the United States see them as a cloud of echoes, so we can tell how many birds were in the air and which way they flew. The data is about two days old." />
        </p>
        {date ? <p className="mt-3 text-lg text-slate-200"><TR k="Night of {date}" v={{ date }} /></p> : <p className="mt-3"><TR k="No radar data yet." /></p>}

        {regions.map((g) => {
          if (!g.radars.length) return null;
          const busy = [...g.radars].sort((a, b) => b.vid - a.vid).slice(0, 8);
          const unusual = g.radars.filter((r) => r.unusual).sort((a, b) => b.vid / Math.max(b.normal ?? 1, 1) - a.vid / Math.max(a.normal ?? 1, 1));
          const busier = g.radars.filter((r) => r.normal != null && r.normal >= 1 && r.vid >= 1.5 * r.normal).length;
          const heading = mainHeading(g.radars);
          const med = median(g.radars.map((r) => r.vid));
          return (
            <section key={g.key} className="mt-8">
              <h2 className="text-xl font-semibold text-slate-100">{g.key === "europe" ? <TR k="Europe" /> : <TR k="United States" />}</h2>
              <p className="mt-2">
                <TR k="{n} radars reported. A typical radar saw about {m} birds in every square kilometre of sky, and {b} were busier than usual for them." v={{ n: g.radars.length, m: med >= 10 ? Math.round(med) : med.toFixed(1), b: busier }} />{" "}
                {heading != null && <TR k="Most birds were heading {way}." v={{ way: compass(heading) }} />}
              </p>
              {unusual.length > 0 && (
                <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                  <TR k="Unusually busy (at least 3 times a usual night):" />{" "}
                  {unusual.slice(0, 12).map((r, i) => <span key={r.radar}>{i > 0 && ", "}{label(r)}</span>)}.
                </p>
              )}
              <table className="mt-3 w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-white/10">
                  <th className="py-1.5 font-medium"><TR k="Busiest radars" /></th>
                  <th className="font-medium text-right"><TR k="Birds per km²" /></th>
                  <th className="font-medium text-right"><TR k="Usual night" /></th>
                  <th className="font-medium text-right"><TR k="Heading" /></th>
                </tr></thead>
                <tbody>{busy.map((r) => (
                  <tr key={r.radar} className="border-b border-white/5">
                    <td className="py-1.5">{label(r)}</td>
                    <td className="text-right tabular-nums">{r.vid >= 10 ? Math.round(r.vid) : r.vid.toFixed(1)}</td>
                    <td className="text-right tabular-nums text-slate-400">{r.normal != null ? (r.normal >= 10 ? Math.round(r.normal) : r.normal.toFixed(1)) : ""}</td>
                    <td className="text-right">{r.dir != null ? compass(r.dir) : ""}</td>
                  </tr>))}</tbody>
              </table>
            </section>
          );
        })}

        <p className="mt-8">
          <Link href="/?layer=radar" className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400"><TR k="See every radar on the map" /></Link>
        </p>
        <p className="mt-6 text-sm text-slate-400">
          <TR k="Sources: Aloft (European weather radars, CC BY 4.0) and NOAA NEXRAD (US weather radars, processed with vol2bird). Radars with interference, and nights when the echoes did not move, are left out. [How this is measured](/methods#radar)." />
        </p>
      </div>
    </main>
  );
}

function label(r: RadarNight): string {
  const city = near(r);
  const code = r.radar.toUpperCase();
  return city ? `${city} (${code})` : `${code} (${Math.abs(r.lat).toFixed(1)}°${r.lat >= 0 ? "N" : "S"}, ${Math.abs(r.lon).toFixed(1)}°${r.lon >= 0 ? "E" : "W"})`;
}
