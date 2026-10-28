-- Common names in the site's languages from the BirdNET+ taxonomy (bulk CSV for es/fr/de/pt, per-species API for hi/ta),
-- filled by scripts/species-names.mts. {"es": "...", "hi": "..."}; only species that occur in species_group.
CREATE TABLE IF NOT EXISTS species_names (
  scientific_name text PRIMARY KEY,
  names           jsonb NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now()
);
