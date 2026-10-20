-- Marine sources (OBIS, Orcasound, Acartia): credit links and cross-aggregator dedupe (OBIS republishes GBIF and iNaturalist records).
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_provider_url text;  -- page linked from the credit (OBIS dataset, Orcasound feed)
ALTER TABLE events ADD COLUMN IF NOT EXISTS dedupe_key text;           -- occurrenceID|institutionCode, or inaturalist:<id>
ALTER TABLE events ADD COLUMN IF NOT EXISTS also_credit text;          -- credit of a duplicate from another source that was merged into this row
CREATE INDEX IF NOT EXISTS events_dedupe_key_idx ON events (dedupe_key) WHERE dedupe_key IS NOT NULL;
