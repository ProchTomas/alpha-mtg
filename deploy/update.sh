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
sleep 2
curl -sf http://127.0.0.1:3000/health && echo " ok"
