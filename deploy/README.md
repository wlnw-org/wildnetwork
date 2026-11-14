# Self-hosted deploy

wlnw.org runs on one Ubuntu 24.04 server (Node 24, Caddy). Nothing in this folder is secret.

- `wlnw@.service`: two copies of the Next.js app (`wlnw@3000`, `wlnw@3001`), restarted one at a time on deploy, settings from `/etc/wlnw/env` (only on the server, mode 640, never in git).
- `Caddyfile`: HTTPS (automatic certificates) and the proxy.
- `deploy.sh` + `wlnw-deploy.timer`: every 2 minutes the server fetches `main` from this public repository; a new commit is built
  in `/srv/wlnw/releases/<sha>` and swapped in. No deploy keys or server credentials exist in GitHub.
  Logs: `/srv/wlnw/logs/deploy.log`, `/srv/wlnw/logs/build-<sha>.log`. Force a rebuild: `sudo -u wlnw /srv/wlnw/deploy.sh --force`.
- Background work runs inside the app (status route `after()` jobs), triggered by the cron-job.org call to `/api/v1/status`.
- `geoip-update.sh` + `wlnw-geoip.timer`: monthly download of DB-IP City Lite (CC BY 4.0) to `/var/lib/wlnw/geoip`, read locally by `/api/v1/near` (env `GEOIP_DB`).

The files here are installed on the server by hand (copy to /srv/wlnw, /etc/systemd/system, /etc/caddy); a push does not update them, only the app.
- `wlnw-rollup.timer`: daily 03:30 UTC call to `/api/cron/rollup` (formerly the Vercel cron in vercel.json), with CRON_SECRET read from `/etc/wlnw/env` on the server. Live pulls and hourly rollups come from the cron-job.org call to `/api/v1/status`; the old GitHub `ingest` workflow was removed so no server secret lives in GitHub.
- `monitor.sh` + `wlnw-monitor.timer`: every 5 minutes, as root, checks both app copies, Caddy, the public health endpoint, failed deploy/rollup/geoip runs, disk, memory and the certificate; emails `MONITOR_TO` (server env) through Resend when a problem starts, every 6 hours while it lasts, and once on recovery. A build that fails is not retried until the next commit (`logs/failed-sha`).
- `wlnw-radar.timer`: daily 05:00 UTC, `scripts/radar.mts` imports the last 5 days of Aloft weather radar profiles (CC BY 4.0) into radar_part (about 200 files a day, 1.9 MB each). Backfill: run the service command with more days, e.g. `tsx scripts/radar.mts 30 6`.
