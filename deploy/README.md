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

Updating: `sudo -u alphamtg /opt/alphamtg/app/deploy/update.sh` (pull, build, migrate, restart).

## Notes from the first deploy (Oracle Always Free, Ubuntu 24.04, 1 GB RAM)

- Add a 2 GB swap file before building; `npm ci` + Vite need it on 1 GB.
- Oracle images ship an iptables chain that REJECTs everything but 22. The ACCEPT rules for 80/443 must be
  inserted *above* that REJECT rule (`iptables -I INPUT 5 …`), then `netfilter-persistent save`.
  The Oracle Security List on the subnet also needs ingress rules for TCP 80 and 443.
- Let's Encrypt rate-limits failed authorizations (5/hour/name). Get DNS and the firewall right before
  starting Caddy, or expect a ~1 h wait.
- The app user needs passwordless `sudo systemctl restart alphamtg` for update.sh, or run that line as root.
