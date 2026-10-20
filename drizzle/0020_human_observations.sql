-- WDX v0.3: human observations (e.g. Acartia marine mammal sightings) have no model, so no confidence or classifier.
ALTER TABLE events ALTER COLUMN confidence DROP NOT NULL;
ALTER TABLE events ALTER COLUMN classifier_name DROP NOT NULL;
ALTER TABLE events ALTER COLUMN classifier_version DROP NOT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS observation_method text NOT NULL DEFAULT 'machine';  -- machine | human
ALTER TABLE events ADD COLUMN IF NOT EXISTS individual_count integer;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_provider text;  -- contributing platform inside an aggregator, for credit
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_trusted boolean;  -- the source's own verification flag
