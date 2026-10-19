#!/usr/bin/env python3
"""Weekly open-data snapshot for the AWS Open Data bucket (s3://wildnetwork-open-data/).

Reads the production database read-only and writes Parquet in the layout documented in
arunrajiah/open-data-examples/wildnetwork-wdx/README.md:

  out/events/year=YYYY/month=MM/day=DD/*.parquet          CC0 and CC BY records
  out/aggregates/species_daily/year=YYYY/*.parquet
  out/aggregates/species_weekly/year=YYYY/*.parquet
  out/noncommercial/...                                    CC BY-NC records only (same layout)
  out/manifest.json                                        snapshot date, row counts, file list, sha256

BirdWeather-derived rows are never exported: redistribution has not been agreed with BirdWeather.
Station coordinates are generalised to about 1 km (0.01 degree); species listed in
scripts/sensitive_species.txt (one scientific name per line, optional) are generalised to 0.1 degree.

Usage (on a machine with the production DATABASE_URL):
  pip install duckdb
  DATABASE_URL=postgres://... python3 scripts/aws-export.py out
  aws s3 sync out/ s3://wildnetwork-open-data/ --delete --profile wildnetwork-open-data
"""
import datetime, hashlib, json, os, pathlib, sys

import duckdb

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "out")
DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("DATABASE_URL is not set")
EXCLUDED_SOURCES = ("birdweather",)

con = duckdb.connect()
for ext in ("postgres", "spatial"):
    con.execute(f"INSTALL {ext}; LOAD {ext};")
con.execute(f"ATTACH '{DB}' AS pg (TYPE postgres, READ_ONLY)")

sens_file = pathlib.Path(__file__).with_name("sensitive_species.txt")
sensitive = [l.strip() for l in sens_file.read_text().splitlines() if l.strip() and not l.startswith("#")] if sens_file.exists() else []
con.execute("CREATE TEMP TABLE sensitive(name TEXT)")
if sensitive:
    con.executemany("INSERT INTO sensitive VALUES (?)", [(s,) for s in sensitive])

excluded = ", ".join(f"'{s}'" for s in EXCLUDED_SOURCES)
SPDX = r"""CASE
  WHEN regexp_matches(lower(lic), 'zero|cc0') THEN 'CC0-1.0'
  WHEN regexp_matches(lower(lic), '(^|[-_/ ])nd([-_/ .]|$)') THEN NULL
  WHEN regexp_matches(lower(lic), 'by[-_ ]nc') THEN 'CC-BY-NC-4.0'
  WHEN regexp_matches(lower(lic), '/by/|^cc[-_ ]by([-_ ]4[._]0)?$') THEN 'CC-BY-4.0'
  ELSE NULL END"""

con.execute(f"""
CREATE TEMP TABLE ev AS
WITH base AS (
  SELECT e.*, COALESCE(e.license, CASE WHEN e.source_system NOT IN ('inaturalist','gbif') THEN 'cc-by' END) AS lic,
         d.sensor_type, d.sensor_model, d.coord_uncertainty_m, g.grp AS taxon_group,
         (SELECT count(*) FROM sensitive s WHERE s.name = e.scientific_name) > 0 AS is_sensitive
  FROM pg.public.events e
  JOIN pg.public.deployments d ON d.id = e.deployment_id
  LEFT JOIN pg.public.species_group g ON g.scientific_name = e.scientific_name
  WHERE e.source_system NOT IN ({excluded})
)
SELECT
  event_id, '0.1' AS wdx_version, event_start, event_end, scientific_name, vernacular_name, taxon_rank, taxon_id,
  COALESCE(taxon_group, 'other') AS taxon_group, confidence, classifier_name, classifier_version, review_status,
  CAST(NULL AS VARCHAR) AS reviewed_by, CAST(NULL AS TIMESTAMPTZ) AS reviewed_at,
  substr(md5(deployment_id), 1, 16) AS deployment_id, sensor_type, sensor_model,
  ST_AsWKB(ST_Point(round(longitude, CASE WHEN is_sensitive THEN 1 ELSE 2 END),
                    round(latitude,  CASE WHEN is_sensitive THEN 1 ELSE 2 END))) AS geometry,
  greatest(COALESCE(coord_uncertainty_m, 0), CASE WHEN is_sensitive THEN 11000 ELSE 1100 END) AS coordinate_uncertainty_m,
  source_system, source_record_id, {SPDX} AS license,
  year(event_start) AS year, month(event_start) AS month, day(event_start) AS day
FROM base
""")
dropped = con.execute("SELECT count(*) FROM ev WHERE license IS NULL").fetchone()[0]
con.execute("DELETE FROM ev WHERE license IS NULL")


def copy(query: str, path: pathlib.Path, partition: str):
    path.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY ({query}) TO '{path}' (FORMAT parquet, COMPRESSION zstd, PARTITION_BY ({partition}), OVERWRITE_OR_IGNORE)")


copy("SELECT * FROM ev WHERE license <> 'CC-BY-NC-4.0'", OUT / "events", "year, month, day")
copy("SELECT * FROM ev WHERE license = 'CC-BY-NC-4.0'", OUT / "noncommercial" / "events", "year, month, day")

# Aggregates: GBIF and iNaturalist connectors only ingest CC0 and CC BY records, and WDX contributions are CC BY by default.
for table, datecol in (("species_daily", "day"), ("species_weekly", "week")):
    cols = "day, source_system, scientific_name, vernacular_name, cell_lat, cell_lon, count, high_conf_count, sites" if table == "species_daily" \
        else "week, source_system, scientific_name, vernacular_name, cell_lat, cell_lon, count, high_conf_count"
    copy(f"SELECT {cols}, year({datecol}) AS year FROM pg.public.{table} WHERE source_system NOT IN ({excluded})",
         OUT / "aggregates" / table, "year")

files = []
for f in sorted(OUT.rglob("*.parquet")):
    h = hashlib.sha256(f.read_bytes()).hexdigest()
    files.append({"path": str(f.relative_to(OUT)), "bytes": f.stat().st_size, "sha256": h})
counts = {
    "events": con.execute("SELECT count(*) FROM ev WHERE license <> 'CC-BY-NC-4.0'").fetchone()[0],
    "noncommercial_events": con.execute("SELECT count(*) FROM ev WHERE license = 'CC-BY-NC-4.0'").fetchone()[0],
    "events_dropped_no_open_licence": dropped,
}
manifest = {"snapshot": datetime.date.today().isoformat(), "wdx_version": "0.1", "excluded_sources": list(EXCLUDED_SOURCES),
            "row_counts": counts, "files": files}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(json.dumps(counts), len(files), "files")
