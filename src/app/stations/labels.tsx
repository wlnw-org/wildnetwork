import type { ReactNode } from "react";
import { TR } from "@/components/TR";

/** Shared by /stations and the station pages. */
export const KIND_LABEL: Record<string, ReactNode> = { "acoustic-recorder": <TR k="Sound recorder" />, "bat-detector": <TR k="Bat detector" />, "camera-trap": <TR k="Camera trap" />, "ultrasonic-recorder": <TR k="Bat detector" /> };

export const SOURCE_LABEL: Record<string, ReactNode> = {
  "wildnetwork-base": <TR k="Wildlife Network Base" />,
  "birdnet-pi": "BirdNET-Pi", "birdnet-go": "BirdNET-Go",
  orcasound: <TR k="Orcasound hydrophone" />,
};
