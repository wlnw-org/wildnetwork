-- Species taken off the lost species watch after review (the reason, and who and when, are in src/data/lost-species-removed.csv).
-- A removed species is not watched and not listed publicly; its past flags and verdicts are kept.
ALTER TABLE lost_species ADD COLUMN IF NOT EXISTS removed text;
