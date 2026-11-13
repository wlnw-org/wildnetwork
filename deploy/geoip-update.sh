#!/usr/bin/env bash
# Monthly refresh of DB-IP's free "IP to City Lite" database (CC BY 4.0, https://db-ip.com) used by /api/v1/near.
# Runs as root from wlnw-geoip.timer; the app reopens the file when it changes (src/lib/geoip.ts).
set -euo pipefail
DIR=/var/lib/wlnw/geoip; mkdir -p "$DIR"
for m in "$(date -u +%Y-%m)" "$(date -u -d '1 month ago' +%Y-%m)"; do
  if curl -fsSL -o "$DIR/new.mmdb.gz" "https://download.db-ip.com/free/dbip-city-lite-$m.mmdb.gz"; then
    gunzip -f "$DIR/new.mmdb.gz" && chmod 644 "$DIR/new.mmdb" && mv -f "$DIR/new.mmdb" "$DIR/dbip-city-lite.mmdb"
    echo "geoip: $m installed"; exit 0
  fi
done
echo "geoip: download failed, keeping the old file"; exit 1
