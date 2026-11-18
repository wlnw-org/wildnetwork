-- Wildlife Network Base support: clip names kept on events, test stations, 90 days of device health.
ALTER TABLE events ADD COLUMN IF NOT EXISTS media_file text;

-- A test station's detections are kept apart in test_events, never in events, so no public table, map, history,
-- report or release can include them. field_since: when test mode was switched off; detections made before it stay out.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS field_since timestamptz;
CREATE TABLE IF NOT EXISTS test_events (
  event_id    text PRIMARY KEY,
  device_id   text NOT NULL,
  event_start timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  event       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS test_events_device_idx ON test_events (device_id, event_start DESC);
