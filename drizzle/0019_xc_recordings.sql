-- Cached xeno-canto lookups (metadata and links only, never audio). Empty clip lists are cached too.
CREATE TABLE IF NOT EXISTS xc_recordings (
  scientific_name text NOT NULL,
  area            text NOT NULL,          -- XC world area, or 'any'
  clips           jsonb NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scientific_name, area)
);
