import DATA from "@/data/india-states.json";
import SEASONS from "@/data/india-seasons.json";
import type { Row } from "@/components/CityBirds";

/** Per state data from scripts/india-states.mts. Migrant: [sci, status, records, arrive 1-12, leave 1-12, presence Jan..Dec]. */
export type Status = "winter" | "summer" | "passage";
export type Migrant = [string, Status, number, number | null, number | null, number[]];
export type IndiaState = { slug: string; name: string; records: number; migrants: Migrant[]; top: Row[] };

const RAW = DATA.states as unknown as Record<string, Omit<IndiaState, "slug">>;
export const INDIA_STATES: IndiaState[] = Object.entries(RAW).map(([slug, s]) => ({ slug, ...s }));
export const INDIA_STATES_YEARS = DATA.years as [number, number];
export const INDIA_STATES_GENERATED = DATA.generated;
export const indiaState = (slug: string) => INDIA_STATES.find((s) => s.slug === slug) ?? null;

/** English names of the national migrants, by scientific name. */
const EN = new Map(SEASONS.species.map((s) => [s.sci, s.en as string | null]));
export const migrantName = (sci: string) => EN.get(sci) ?? sci;

/** States where this species comes and goes (same status as nationally), most records first. */
export function statesFor(sci: string) {
  return INDIA_STATES.map((s) => ({ s, m: s.migrants.find((x) => x[0] === sci) }))
    .filter((x): x is { s: IndiaState; m: Migrant } => !!x.m).sort((a, b) => b.m[2] - a.m[2]).map((x) => x.s);
}

/** Cities on /places in each state (src/data/places.json slugs). */
export const STATE_CITIES: Record<string, string[]> = {
  "tamil-nadu": ["chennai-in", "coimbatore-in", "madurai-in"], karnataka: ["bengaluru-in", "mysuru-in"],
  maharashtra: ["mumbai-in", "pune-in"], delhi: ["new-delhi-in"], "west-bengal": ["kolkata-in"], telangana: ["hyderabad-in"],
  gujarat: ["ahmedabad-in"], kerala: ["kochi-in", "thiruvananthapuram-in"], rajasthan: ["jaipur-in"], assam: ["guwahati-in"],
  odisha: ["bhubaneswar-in"], "uttar-pradesh": ["lucknow-in"], goa: ["old-goa-in"], uttarakhand: ["dehradun-in"], chandigarh: ["chandigarh-in"],
};
