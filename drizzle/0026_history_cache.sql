-- Precomputed past-period summaries for the map (src/lib/history.ts): 3 periods x 7 classes, replaced in place.
CREATE TABLE IF NOT EXISTS history_cache (
  key         text PRIMARY KEY,           -- "<period>|<group>", e.g. "30d|avian"
  data        jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
