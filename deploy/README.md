# Deploying

One box, one process, one SQLite file, Caddy in front. See the guide §10.

```sh
# on the server, as root
apt install -y nodejs npm caddy sqlite3       # Node >= 22
useradd -r -m -d /opt/alphamtg alphamtg
su - alphamtg
git clone <repo> /opt/alphamtg && cd /opt/alphamtg
npm ci
cp .env.example .env && $EDITOR .env          # APP_NAME, APP_URL, CONTACT_EMAIL, COOKIE_SECRET
npm run build                                 # shared typecheck, server -> dist/, web -> apps/web/dist
npm run db:migrate
npm run ingest                                # ~80 MB download, ~15 s
```

Then, as root:

```sh
cp deploy/alphamtg.service /etc/systemd/system/ && systemctl enable --now alphamtg
cp deploy/Caddyfile /etc/caddy/Caddyfile      # edit the domain first
systemctl reload caddy
crontab -u alphamtg deploy/crontab
```

In production the server serves the built React bundle itself with an SPA fallback, so Caddy
only needs one `reverse_proxy`. Data lives in `/opt/alphamtg/data` (db, cached images, uploads).

Updating: `git pull && npm ci && npm run build && npm run db:migrate && systemctl restart alphamtg`.
