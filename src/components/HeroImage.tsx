"use client";
import { useState } from "react";
import { commonsThumb } from "@/lib/commonsThumb";

/** Species photo at the top of a page. Wikimedia will not make a copy wider than the original, so a small original falls back to itself. */
export default function HeroImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const small = commonsThumb(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={failed ? src : small} alt={alt} className={className} fetchPriority="high" decoding="async"
      onError={() => { if (!failed && small !== src) setFailed(true); }} />
  );
}
