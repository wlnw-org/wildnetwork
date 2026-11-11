import { OG_SIZE, ogCard } from "@/lib/ogCard";

export const alt = "Wildlife Network: a live, open map of wildlife movement";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard("LIVE · OPEN DATA · OPEN SOURCE", "Wildlife Network", "Where birds, bats and other animals are now, and where they are going.");
}
