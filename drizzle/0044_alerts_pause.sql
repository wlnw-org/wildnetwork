-- Owners can pause the server monitor's health emails for their device (from the Base, or from /stations/mine).
-- NULL or a past time means alerts are on.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS alerts_paused_until timestamptz;
-- Every attempt to claim a station with a device key on /stations/mine, for the per-address hourly limit.
-- Rows older than a day are deleted on the next attempt.
CREATE TABLE IF NOT EXISTS station_claim_attempts (
  ip_hash text NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS station_claim_attempts_ip_idx ON station_claim_attempts (ip_hash, at);
