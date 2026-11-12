import SEASONS from "@/data/uk-seasons.json";

/** UK summer and winter visitors from src/data/uk-seasons.json (scripts/uk-seasons.mts), in half months 0 to 23. */
export type UkSp = (typeof SEASONS.species)[number];
export const UK = SEASONS;
export const UK_SPECIES = SEASONS.species as UkSp[];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "early April" (1st to 15th) or "late April" (16th to month end). */
export const half = (b: number) => `${b % 2 ? "late" : "early"} ${MONTHS[Math.floor(b / 2)]}`;
/** A typical arrival, plus the earliest and latest years when they differ. */
export function ukArrival(s: UkSp) {
  const range = s.arriveEarly !== s.arriveLate ? `${half(s.arriveEarly)} to ${half(s.arriveLate)}` : null;
  return { typical: half(s.arrive), range, leave: s.leave != null ? half(s.leave) : null };
}
export const ukSeason = (sci: string) => UK_SPECIES.find((s) => s.sci === sci) ?? null;
