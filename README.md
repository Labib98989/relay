<div align="center">

# Relay

**Build your class section's weekly schedule once. Relay posts tomorrow's classes to your Discord every night — automatically.**

</div>

---

Relay is a small web app + Discord bot for **class representatives (CRs)**. Lay out your section's weekly schedule once, connect a Discord channel, and every evening Relay posts what's on tomorrow — so nobody has to ask "what classes do we have?" again.

Say hi to **Guy**, the clipboard mascot who keeps your section on track.

## Why

CRs end up as a human reminder service — messaging the group every night, fielding "is class cancelled?" Existing bots are clunky enough that CRs quietly abandon them. Relay makes the nightly post automatic, and the once-a-week edits (a cancelled class, a room change, a one-off make-up class) a couple of taps.

## Features

- **Schedule spaces** — one per section (up to 5 per account), each posting to its own Discord channel.
- **Two layers in one editor:**
  - *Edit schedule* — the permanent recurring weekly grid.
  - *This week* — temporary overrides: cancel a class, change a room, add a one-off class, or mark a whole day off. They expire on their own; the permanent grid is never touched.
- **Automatic nightly digest** — posts tomorrow's classes to Discord at a time you choose, idempotently (it never double-posts).
- **Discord login** — sign in with the account that owns the server.
- **Configurable** — 12h / 24h display, custom weekends, breaks, and time rows, all saved per space.
- **Try it without signing in** — the `/design` route is the real editor seeded with sample data.

## Tech stack

- **Next.js 16** (App Router, Server Actions) · **React 19**
- **Prisma 7** + **PostgreSQL** (driver adapter)
- **Auth.js v5** — Discord OAuth with database sessions
- **Tailwind CSS v4**
- **Docker Compose** + **Caddy** (automatic HTTPS) for deployment

## Quick start (local)

Requires **Node 24+** and **Docker Desktop**.

```bash
cp .env.example .env       # set DATABASE_URL to match docker-compose.yml,
                           # then add Discord OAuth creds + a generated AUTH_SECRET
docker compose up -d       # start PostgreSQL
npm install
npx prisma migrate deploy  # create the tables
npm run dev                # http://localhost:3000
```

Generate `AUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Full setup and troubleshooting live in **[DEVELOPMENT.md](DEVELOPMENT.md)**.

## Deployment

Relay self-hosts as a single Docker Compose stack — the app, PostgreSQL, a Caddy TLS proxy, and a nightly scheduler — on one small VM. The complete runbook, including Oracle Cloud free-tier specifics, is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## License

[MIT](LICENSE)
