-- Common names per language from the BirdNET+ taxonomy (open-source metadata), e.g. {"hi": "...", "ta": "..."}.
-- NULL = not looked up yet; {} = looked up, nothing found.
ALTER TABLE species_media ADD COLUMN IF NOT EXISTS names jsonb;
