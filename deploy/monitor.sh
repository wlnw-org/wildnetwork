#!/usr/bin/env bash
# Server watcher (wlnw-monitor.timer, every 5 minutes, as root). Emails MONITOR_TO through Resend when a check
# starts failing, a reminder every 6 hours while it keeps failing, and once when everything is fine again.
# The GitHub uptime workflow watches from outside (it notices when this whole machine is gone); this one sees
# what the outside cannot: a dead app copy behind the load balancer, a failed deploy or timer, a full disk.
set -uo pipefail
set -a; . /etc/wlnw/env; set +a
STATE=/var/lib/wlnw-monitor; mkdir -p "$STATE"
problems=()

for port in 3000 3001; do
  systemctl is-active -q "wlnw@$port" || problems+=("app copy wlnw@$port is not running")
  curl -fs -o /dev/null --max-time 15 "http://127.0.0.1:$port/robots.txt" || problems+=("app copy on port $port does not answer")
done
systemctl is-active -q caddy || problems+=("Caddy (web server) is not running")

code=$(curl -s -o "$STATE/health.json" -w '%{http_code}' --max-time 30 https://wlnw.org/api/v1/health || echo 000)
if [ "$code" != 200 ]; then
  problems+=("https://wlnw.org/api/v1/health answered HTTP $code: $(head -c 300 "$STATE/health.json" | tr '\n' ' ')")
fi

for unit in wlnw-deploy wlnw-rollup wlnw-geoip; do
  systemctl is-failed -q "$unit.service" && problems+=("$unit.service failed: $(journalctl -u "$unit.service" -n 3 --no-pager -o cat | tr '\n' ' ' | head -c 300)")
done

disk=$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "$disk" -ge 85 ] && problems+=("disk is ${disk}% full")
avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
swap=$(free -m | awk '/Swap/ {print $3}')
[ "$avail" -lt 150 ] && problems+=("only ${avail} MB of memory available (swap in use ${swap} MB)")

days=$(echo | timeout 15 openssl s_client -connect 127.0.0.1:443 -servername wlnw.org 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$days" ]; then
  left=$(( ( $(date -d "$days" +%s) - $(date +%s) ) / 86400 ))
  [ "$left" -lt 14 ] && problems+=("HTTPS certificate for wlnw.org expires in $left days")
fi

now=$(date +%s); host=$(hostname)
send() { # subject, text
  [ -n "${RESEND_API_KEY:-}" ] && [ -n "${MONITOR_TO:-}" ] || { echo "no RESEND_API_KEY or MONITOR_TO; $1"; return; }
  jq -n --arg from "${ALERTS_FROM:-alerts@wlnw.org}" --arg to "$MONITOR_TO" --arg s "$1" --arg t "$2" \
    '{from:$from, to:[$to], subject:$s, text:$t}' \
  | curl -fsS --max-time 20 -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer $RESEND_API_KEY" -H 'Content-Type: application/json' -d @- >/dev/null \
    || echo "email failed: $1"
}

if [ ${#problems[@]} -gt 0 ]; then
  text=$(printf -- '- %s\n' "${problems[@]}")
  last=$(cat "$STATE/alerted_at" 2>/dev/null || echo 0)
  if [ ! -f "$STATE/down" ] || [ "$(cat "$STATE/down")" != "$text" ] || [ $((now - last)) -ge 21600 ]; then
    send "Wildlife Network server: ${#problems[@]} problem(s)" \
      "Checked $(date -u +'%Y-%m-%d %H:%M UTC') on $host:

$text

Logs: journalctl -u 'wlnw*' -n 100; deploy logs in /srv/wlnw/logs."
    echo "$now" > "$STATE/alerted_at"
  fi
  echo "$text" > "$STATE/down"
  echo "$text"
elif [ -f "$STATE/down" ]; then
  send "Wildlife Network server: all checks pass again" \
    "All checks passed at $(date -u +'%Y-%m-%d %H:%M UTC') on $host. Earlier problems:
$(cat "$STATE/down")"
  rm -f "$STATE/down" "$STATE/alerted_at"
fi
exit 0
