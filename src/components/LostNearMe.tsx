"use client";
import Link from "next/link";
import { useState } from "react";
import { TR } from "@/components/TR";

// Country names the list spells differently from the browser's English names.
const ALIAS: Record<string, string> = { "Congo - Kinshasa": "Democratic Republic of Congo", "Congo - Brazzaville": "Republic of Congo", "Myanmar (Burma)": "Myanmar", "Côte d’Ivoire": "Ivory Coast", "United States": "USA" };

/** Shows lost species for the visitor's country, only after they ask: their approximate area comes from /api/v1/near
 *  (rounded, never stored) and only the country is used. */
export default function LostNearMe({ countries }: { countries: string[] }) {
  const [state, setState] = useState<{ country: string; found: boolean } | "idle" | "busy" | "unknown">("idle");
  async function find() {
    setState("busy");
    const r = (await fetch("/api/v1/near").then((x) => x.json()).catch(() => ({}))) as { country?: string };
    if (!r.country) { setState("unknown"); return; }
    let name = r.country;
    try { name = new Intl.DisplayNames(["en"], { type: "region" }).of(r.country) ?? r.country; } catch { /* keep the code */ }
    name = ALIAS[name] ?? name;
    const match = countries.find((c) => c.toLowerCase() === name.toLowerCase());
    setState({ country: match ?? name, found: !!match });
  }
  return (
    <div className="mt-1 text-sm">
      {state === "idle" || state === "busy" ? (
        <>
          <p><TR k="See which lost species were last known in your country. We use your approximate area once and do not store it." /></p>
          <button onClick={find} disabled={state === "busy"} className="mt-2 rounded-md border border-white/20 px-3 py-1.5 hover:border-white/50">{state === "busy" ? <TR k="Looking" /> : <TR k="Use my area" />}</button>
        </>
      ) : state === "unknown" ? (
        <p><TR k="We could not tell your area. Choose your country in the list below." /></p>
      ) : state.found ? (
        <p><TR k="You seem to be in {country}." v={{ country: state.country }} /> <Link href={`/lost-species?country=${encodeURIComponent(state.country)}#list`} className="text-cyan-400 hover:underline"><TR k="See the lost species last known there" /></Link></p>
      ) : (
        <p><TR k="You seem to be in {country}. No species on this list were last known there, but lost species from nearby countries may still turn up." v={{ country: state.country }} /></p>
      )}
    </div>
  );
}
