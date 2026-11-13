# Self-hosted deploy

wlnw.org runs on one Ubuntu 24.04 server (Node 24, Caddy). Nothing in this folder is secret.

- `wlnw.service`: the Next.js app on 127.0.0.1:3000, settings from `/etc/wlnw/env` (only on the server, mode 640, never in git).
- `Caddyfile`: HTTPS (automatic certificates) and the proxy.
- `deploy.sh` + `wlnw-deploy.timer`: every 2 minutes the server fetches `main` from this public repository; a new commit is built
  in `/srv/wlnw/releases/<sha>` and swapped in. No deploy keys or server credentials exist in GitHub.
  Logs: `/srv/wlnw/logs/deploy.log`, `/srv/wlnw/logs/build-<sha>.log`. Force a rebuild: `sudo -u wlnw /srv/wlnw/deploy.sh --force`.
- Background work runs inside the app (status route `after()` jobs), triggered by the cron-job.org call to `/api/v1/status`.
- `geoip-update.sh` + `wlnw-geoip.timer`: monthly download of DB-IP City Lite (CC BY 4.0) to `/var/lib/wlnw/geoip`, read locally by `/api/v1/near` (env `GEOIP_DB`).
