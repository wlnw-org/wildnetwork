import { OG_SIZE, ogCard } from "@/lib/ogCard";
import { REGIONS } from "@/lib/regions";
import { countryBySlug } from "@/lib/countries";

export const alt = "When birds and bats arrive in this region";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  const r = REGIONS.find((x) => x.slug === region);
  const c = r ? null : countryBySlug(region);
  if (c) return ogCard("MIGRATORY BIRDS", c.name, "Which birds come and go, and the months each one is here.");
  return ogCard("ARRIVAL DATES", r?.name ?? "Arrivals", "When birds and bats arrive, from open records and listening stations.");
}
