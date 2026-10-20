import type { WdxEvent } from "@/lib/wdx/types";

/**
 * A pull connector fetches recent detections from an external network and maps them to WDX.
 * `cursor` is opaque connector state persisted in pull_state between runs.
 */
export interface PullConnector {
  name: string;
  /** Run at most this often; after an error, wait four times as long (back off). Unset = every trigger. */
  minIntervalMinutes?: number;
  /** `notes` go to the run log (e.g. unmapped names); `groups` record each species' class. */
  pull(cursor: string | null): Promise<{ events: WdxEvent[]; cursor: string | null; notes?: string[]; groups?: { name: string; grp: string }[] }>;
}
