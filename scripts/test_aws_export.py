"""Tests for aws-export.py: Acartia (licence unknown-pending) and BirdWeather never reach the open data export.

Runs against an in-memory DuckDB with the same tables as Postgres. Needs duckdb (pip install duckdb) and its spatial
extension. Run: python3 -m unittest scripts/test_aws_export.py
"""
import importlib.util, pathlib, unittest

import duckdb

spec = importlib.util.spec_from_file_location("aws_export", pathlib.Path(__file__).with_name("aws-export.py"))
aws_export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aws_export)

ROWS = [
    # event_id, source, licence
    ("gbif:1", "gbif", "https://creativecommons.org/licenses/by/4.0/"),
    ("inaturalist:2", "inaturalist", "https://creativecommons.org/publicdomain/zero/1.0/"),
    ("acartia:3aee", "acartia", "unknown-pending"),
    ("acartia:no-licence", "acartia", None),
    ("birdweather:4", "birdweather", None),
    ("device:5", "birdnet-pi", "unknown-pending"),
]


class ExportExclusion(unittest.TestCase):
    def setUp(self):
        self.con = con = duckdb.connect()
        con.execute("INSTALL spatial; LOAD spatial;")
        con.execute("CREATE SCHEMA src")
        con.execute("""CREATE TABLE src.events (event_id TEXT, deployment_id TEXT, source_system TEXT, source_record_id TEXT,
            event_start TIMESTAMPTZ, event_end TIMESTAMPTZ, scientific_name TEXT, vernacular_name TEXT, taxon_rank TEXT, taxon_id TEXT,
            confidence DOUBLE, classifier_name TEXT, classifier_version TEXT, review_status TEXT, license TEXT, latitude DOUBLE, longitude DOUBLE)""")
        con.execute("CREATE TABLE src.deployments (id TEXT, sensor_type TEXT, sensor_model TEXT, coord_uncertainty_m DOUBLE)")
        con.execute("CREATE TABLE src.species_group (scientific_name TEXT, grp TEXT)")
        for table, d in (("species_daily", "day DATE, sites INT"), ("species_weekly", "week DATE")):
            con.execute(f"""CREATE TABLE src.{table} ({d}, source_system TEXT, scientific_name TEXT, vernacular_name TEXT,
                cell_lat DOUBLE, cell_lon DOUBLE, count INT, high_conf_count INT)""")
        for event_id, source, lic in ROWS:
            con.execute("INSERT INTO src.deployments VALUES (?, 'other', NULL, NULL)", [f"{source}:dep"])
            con.execute("""INSERT INTO src.events VALUES (?, ?, ?, ?, TIMESTAMPTZ '2026-10-15 20:35:45+00', NULL, 'Orcinus orca', 'Orca', 'species',
                NULL, NULL, NULL, NULL, 'unreviewed', ?, 48.1, -122.6)""", [event_id, f"{source}:dep", source, event_id, lic])
            con.execute("INSERT INTO src.species_daily VALUES (DATE '2026-10-15', 1, ?, 'Orcinus orca', 'Orca', 45, -125, 1, 0)", [source])
            con.execute("INSERT INTO src.species_weekly VALUES (DATE '2026-10-12', ?, 'Orcinus orca', 'Orca', 45, -125, 1, 0)", [source])

    def test_events_skip_acartia_birdweather_and_pending_licence(self):
        aws_export.build_events(self.con, "src")
        ids = {r[0] for r in self.con.execute("SELECT event_id FROM ev").fetchall()}
        self.assertEqual(ids, {"gbif:1", "inaturalist:2"})
        self.assertFalse(self.con.execute("SELECT count(*) FROM ev WHERE source_system IN ('acartia', 'birdweather')").fetchone()[0])

    def test_aggregates_skip_acartia_and_birdweather(self):
        for table in ("species_daily", "species_weekly"):
            sources = {r[0] for r in self.con.execute(f"SELECT source_system FROM ({aws_export.aggregate_query(table, 'src')})").fetchall()}
            self.assertNotIn("acartia", sources)
            self.assertNotIn("birdweather", sources)
            self.assertIn("gbif", sources)


if __name__ == "__main__":
    unittest.main()
