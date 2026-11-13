#!/usr/bin/env bash
# Pull-based deploy for the self-hosted server (see deploy/README.md). Runs as user wlnw from wlnw-deploy.timer.
# The repository is public, so it is fetched without credentials; nothing about the server lives in GitHub.
# Builds a new commit of main in its own release folder, switches the `current` link and restarts the app.
set -euo pipefail
exec 9>/tmp/wlnw-deploy.lock
flock -n 9 || exit 0
ROOT=/srv/wlnw REPO=https://github.com/wlnw-org/wildnetwork.git
cd "$ROOT"
[ -d repo ] || git clone -q --filter=blob:none "$REPO" repo
git -C repo fetch -q origin main
SHA=$(git -C repo rev-parse --short=12 origin/main)
CURRENT=$(basename "$(readlink -f current 2>/dev/null || echo none)")
[ "$SHA" = "$CURRENT" ] && [ "${1:-}" != "--force" ] && exit 0
echo "deploying $SHA (was $CURRENT)"
REL="$ROOT/releases/$SHA"
rm -rf "$REL"
git -C repo worktree prune
git -C repo worktree add -q --detach "$REL" "origin/main"
cd "$REL"
ln -sf /etc/wlnw/env .env.production.local
export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=2048 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm install --frozen-lockfile --prod=false --reporter=silent
# NEXT_PUBLIC_* values are inlined at build time, so the build reads the same environment file.
set -a; . /etc/wlnw/env; set +a
nice -n 10 pnpm build > "$ROOT/logs/build-$SHA.log" 2>&1 || { echo "build failed, see logs/build-$SHA.log"; exit 1; }
ln -sfn "$REL" "$ROOT/current.new" && mv -T "$ROOT/current.new" "$ROOT/current"
# One copy at a time, each back up (health check answers) before the next, so a deploy never drops requests.
for port in 3000 3001; do
  sudo /bin/systemctl restart "wlnw@$port"
  for i in $(seq 1 60); do curl -fs -o /dev/null "http://127.0.0.1:$port/robots.txt" && break; sleep 2; done
done
# Keep the three newest releases.
cd "$ROOT/releases" && ls -1t | tail -n +4 | while read -r old; do git -C "$ROOT/repo" worktree remove --force "$ROOT/releases/$old" 2>/dev/null || rm -rf "$old"; done
echo "deployed $SHA"
