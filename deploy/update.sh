#!/usr/bin/env bash
# Pull, build, migrate, restart. Run on the server as the alphamtg user:
#   sudo -u alphamtg /opt/alphamtg/app/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --no-audit --no-fund
npm run build
npm run db:migrate
sudo systemctl restart alphamtg
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3000/health >/dev/null; then echo "healthy after ${i}s"; exit 0; fi
  sleep 1
done
echo "service did not become healthy" >&2
exit 1
