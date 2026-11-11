import { OG_SIZE, ogCard } from "@/lib/ogCard";
import { placeBySlug, placeLabel } from "@/lib/places";

export const alt = "Birds around this place, month by month";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = await placeBySlug((await params).slug);
  return ogCard("BIRDS AROUND", p?.name ?? "Your area", p ? `${placeLabel(p)}: which birds are here, which are arriving, and when.` : "Which birds are here, and when.");
}
