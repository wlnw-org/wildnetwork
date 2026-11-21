-- The station (deployment) a device's detections are filed under, recorded when it pushes events with its own key.
-- Station pages use it to link a station to its device (test mode, last heard) instead of matching by name.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS deployment_id text;
CREATE INDEX IF NOT EXISTS devices_deployment_idx ON devices (deployment_id);
