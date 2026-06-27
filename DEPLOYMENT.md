# Deploying Routine Guy (Oracle VM, Docker Compose + Caddy)

This is the production runbook. The whole stack — the app, Postgres, the TLS
proxy, and the nightly scheduler — runs as one Docker Compose project defined in
[docker-compose.prod.yml](docker-compose.prod.yml). You bring it up with a single
command once the server and DNS are in place.

```
Internet ──443──> Caddy (auto-HTTPS) ──> web (Next.js) ──> db (Postgres, internal)
                                            ▲
                              cron sidecar ─┘  POST /api/cron/post every 5 min
```

Only Caddy is exposed to the internet. Postgres has **no published port** — it's
reachable only from inside the compose network, so there's nothing on the public
internet to brute-force.

---

## 1. Provision the VM

Create an **Oracle Cloud Ampere A1 (ARM64)** instance — the always-free shape with
generous RAM. Recommended: **1–2 OCPU / 6–12 GB**, **Ubuntu 24.04 LTS**. (The app
is featherweight at runtime — well under 1 GB. The *only* thing that needs the
RAM is `next build`, which spikes to ~1 GB+. So size for the build, not the load.)

> **"Out of host capacity" when creating the A1?** Common — Ampere is in high
> demand, it's the region, not you. Try a different availability domain, or just
> retry every few hours until one frees up. Worth the wait; don't downgrade to
> Micro to avoid it.

> **Why not the 1 GB x86 "Micro"?** `next build` is memory-hungry and tends to be
> OOM-killed on 1 GB. If you must use Micro, add swap before building:
> ```
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

When creating the instance, save the SSH key and note the **public IP**.

## 2. Open the firewall — *both* layers

Oracle blocks inbound traffic in **two** places. You must open **80** and **443**
in both, or HTTPS silently fails.

1. **Cloud Security List / NSG** (web console): VCN → your subnet → Security List
   → add **Ingress** rules for TCP **80** and **443** from `0.0.0.0/0`. (22 is
   already open.)
2. **Host iptables** (the classic Oracle gotcha — Ubuntu images ship a default
   `iptables` ruleset that drops 80/443 even after step 1):
   ```
   sudo iptables -I INPUT 6 -p tcp --dport 80  -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

> **Why both?** The Security List is Oracle's network-edge firewall; iptables is
> the OS firewall *inside* the VM. A packet has to pass both. Forgetting the
> iptables rules is the #1 reason a fresh Oracle deploy "can't be reached" while
> everything looks healthy on the box.

## 3. Install Docker

```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # run docker without sudo
newgrp docker                     # apply the group now (or log out/in)
docker compose version            # confirm the compose plugin is present
```

## 4. Point DNS at the VM

Create an **A record** for your domain → the VM's **public IP**. Confirm it
resolves before launching (Caddy can't get a certificate until it does):

```
dig +short your-domain.example    # should print the VM's public IP
```

## 5. Get the code and configure secrets

```
git clone <your-repo-url> routine-guy && cd routine-guy
cp .env.prod.example .env
```

Edit `.env` and fill in **every** value (see the file's comments). Generate the
secrets with:

```
openssl rand -base64 32     # run 3× for AUTH_SECRET, CRON_SECRET, POSTGRES_PASSWORD
```

Key points while editing `.env`:
- `DOMAIN` = your hostname (no `https://`). It drives both the Caddy cert and
  `AUTH_URL`.
- `POSTGRES_PASSWORD` must match the password inside `DATABASE_URL`.
- `DATABASE_URL` host is **`db`** (the compose service), not `localhost`.

## 6. Register the Discord redirect

In the [Discord Developer Portal](https://discord.com/developers/applications) →
your app → **OAuth2** → **Redirects**, add:

```
https://your-domain.example/api/auth/callback/discord
```

Also confirm the **bot** (Bot tab token = `DISCORD_BOT_TOKEN`) is invited to the
target server with permission to post in the channel you'll connect.

## 7. Launch

```
docker compose -f docker-compose.prod.yml up -d --build
```

Startup order is enforced automatically: **db** (waits until healthy) →
**migrate** (applies migrations, then exits) → **web** → **caddy** + **cron**.

First boot builds the image (a few minutes on Ampere) and Caddy fetches the TLS
cert (a few more seconds after DNS resolves).

---

## Verify it works

```
docker compose -f docker-compose.prod.yml ps
```
Expect: `db` healthy, `migrate` exited (0), `web` / `caddy` / `cron` up.

1. **Migrations applied** — `docker compose -f docker-compose.prod.yml logs migrate`
   shows the migrations running to completion.
2. **Cert issued** — `... logs caddy` shows a certificate obtained for your domain.
3. **Login** — open `https://your-domain.example` and sign in with Discord. A
   successful login proves OAuth callback + secure cookies + DB sessions all work.
4. **Bot posting** — in the dashboard, connect a Discord channel, then click
   **"Post tomorrow now."** The digest should appear in the channel (proves the
   bot token + outbound path).
5. **Scheduler** — `... logs cron` shows a POST every 5 minutes returning a JSON
   summary. To test the real nightly path, set a space's post time to a minute
   from now and confirm it posts exactly once (idempotent — it won't repeat).
6. **Survives reboot** — `sudo reboot`, then after it's back, `docker compose
   -f docker-compose.prod.yml ps` should show everything up again (the `db`
   volume and Caddy certs persist).

---

## Day-2 operations

**Deploy a new version:**
```
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
Migrations run automatically (the `migrate` step) before the new `web` starts.

**Logs:** `docker compose -f docker-compose.prod.yml logs -f web` (or `caddy`,
`migrate`, `cron`, `db`).

**Inspect the database:**
```
docker compose -f docker-compose.prod.yml exec db psql -U routine -d routineguy
```

**Back up the database** (recommended — set up a daily cron of this on the host):
```
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U routine routineguy | gzip > backup-$(date +%F).sql.gz
```

## Troubleshooting

- **Site unreachable, but `docker compose ps` looks healthy** → firewall. Re-check
  *both* the Oracle Security List and host `iptables` (step 2).
- **Caddy can't get a certificate** → DNS isn't resolving to this VM yet, or port
  80 is blocked (Let's Encrypt validates over port 80). Check `dig +short
  your-domain.example` and the firewall.
- **Discord login bounces / "redirect URI mismatch"** → the redirect in the
  Discord portal must be *exactly* `https://$DOMAIN/api/auth/callback/discord`,
  and `AUTH_URL`/`DOMAIN` in `.env` must match the host you're visiting.
- **`web` exits or 500s on DB calls** → check `DATABASE_URL` uses host `db` and
  the password matches `POSTGRES_PASSWORD`; check `... logs migrate` succeeded.
- **Build OOM-killed** → you're on a too-small shape; add swap (step 1 note) or
  move to Ampere A1.
