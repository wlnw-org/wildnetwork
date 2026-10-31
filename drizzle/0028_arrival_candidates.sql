-- Possibly arriving (methods 0.18): unconfirmed returns, replaced at every phenology recompute. Not part of /api/v1/arrivals.
CREATE TABLE IF NOT EXISTS arrival_candidates (
  scientific_name text NOT NULL,
  vernacular_name text,
  cell_lat        smallint NOT NULL,
  cell_lon        smallint NOT NULL,
  week            date NOT NULL,
  n               integer NOT NULL,
  support         real NOT NULL,
  methods_version text NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scientific_name, cell_lat, cell_lon)
);
