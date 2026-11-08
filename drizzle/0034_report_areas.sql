-- Areas for official-ready reports (/report/area): a district or protected area found through OpenStreetMap, or a boundary
-- someone drew or uploaded. Simplified to at most a few hundred vertices. created_ip_hash only limits how many one network
-- can create per day (src/lib/areaReport.ts).
CREATE TABLE IF NOT EXISTS report_areas (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  source          text NOT NULL,          -- osm | drawn | upload
  osm_ref         text,                   -- e.g. R1234567 when source = osm
  geom            geometry(MultiPolygon, 4326) NOT NULL,
  created_ip_hash text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS report_areas_osm_idx ON report_areas (osm_ref) WHERE osm_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS report_areas_ip_idx ON report_areas (created_ip_hash, created_at);
