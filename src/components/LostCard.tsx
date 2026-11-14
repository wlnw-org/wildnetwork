import { TR } from "@/components/TR";
import { GROUPS, RED_LIST, type LostPublic } from "@/lib/lostPublic";

// One lost species: picture, names, group and Red List status, where it was last known, and the search that looks for it.
const REWILD = "https://www.rewild.org/lost-species";
const LOST_BIRDS = "https://searchforlostbirds.org/birds";

export default function LostCard({ s }: { s: LostPublic }) {
  return (
    <li className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
      {s.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.thumb_url} alt={s.common_name ?? s.scientific_name} title={s.image_credit ?? undefined} loading="lazy" className="h-20 w-20 shrink-0 rounded-md object-cover" />
      ) : <div className="h-20 w-20 shrink-0 rounded-md bg-slate-800" aria-hidden />}
      <div className="min-w-0 text-sm">
        <p className="text-base text-slate-100">{s.common_name ?? <i>{s.scientific_name}</i>}</p>
        {s.common_name && <p className="italic text-slate-400">{s.scientific_name}</p>}
        <p className="mt-1 text-slate-300">{[s.class_name && GROUPS[s.class_name]?.replace(/s$/, ""), s.red_list && RED_LIST[s.red_list]].filter(Boolean).join(". ")}</p>
        {s.countries.length > 0 && <p className="text-slate-400"><TR k="Last known from {places}" v={{ places: `${s.countries.join(", ")}${s.region ? `, ${s.region}` : ""}` }} /></p>}
        <p className="mt-1"><a href={s.class_name === "Aves" ? LOST_BIRDS : REWILD} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{s.class_name === "Aves" ? "Search for Lost Birds" : "Search for Lost Species"}</a></p>
      </div>
    </li>
  );
}

