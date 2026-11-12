import { OG_SIZE, ogCard } from "@/lib/ogCard";
import { indiaState } from "@/lib/indiaStates";

export const alt = "Migratory birds in this Indian state";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const s = indiaState(state);
  return ogCard("MIGRATORY BIRDS", s?.name ?? "India", "Which birds come for the winter, and when they arrive and leave.");
}
