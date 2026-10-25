-- Storage (2026-10-26): species_daily_day_idx duplicated the primary key's leading column (day); the two GiST indexes
-- were used twice and never. Bounding-box queries on the small live events window run fine without them.
DROP INDEX IF EXISTS species_daily_day_idx;
DROP INDEX IF EXISTS events_geom_idx;
DROP INDEX IF EXISTS deployments_geom_idx;
