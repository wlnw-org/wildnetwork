-- Weekly detections per station, for site reports (/report). Filled by the rollup from the events table before raw
-- events age out. Only sources whose history Wildlife Network may keep are rolled up: devices that push WDX here
-- (wdx-agent, Wildlife Network Bases and similar). BirdWeather stations are not included unless BirdWeather agrees,
-- and observation sources (GBIF, iNaturalist, OBIS) keep their own full history at source. See src/lib/siteReport.ts.
CREATE TABLE IF NOT EXISTS station_weekly (
  week             date    NOT NULL,
  deployment_id    text    NOT NULL,
  scientific_name  text    NOT NULL,
  vernacular_name  text,
  count            integer NOT NULL,
  high_conf_count  integer NOT NULL,
  PRIMARY KEY (week, deployment_id, scientific_name)
);
CREATE INDEX IF NOT EXISTS station_weekly_deployment_idx ON station_weekly (deployment_id, week);
