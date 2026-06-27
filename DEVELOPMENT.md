# Running Relay locally

The app depends on services that must be running **before** `npm run dev` is useful.
If any are down, the app fails in confusing ways (e.g. a Discord login that errors
out is usually just the database being unreachable).

## Prerequisites (installed once)

- **Node.js** (v24+) — the app runtime.
- **Docker Desktop** — hosts the PostgreSQL database in a container.

## Startup order (every time you sit down to work)

1. **Start Docker Desktop** and wait for its engine to be ready.
   The database can't run without it.
2. **Start the database:**
   ```
   docker compose up -d
   ```
   Verify it's running:
   ```
   docker compose ps        # the db container should be "Up"
   ```
   Data persists in a named Docker volume (`pgdata`), so your tables and rows
   survive restarts.
3. **Start the app:**
   ```
   npm run dev              # http://localhost:3000
   ```

## Why this matters

PostgreSQL is a **separate process** the app talks to over the network. When the
database is down you get `ECONNREFUSED`, but the symptom often appears somewhere
unrelated (a failed page, a broken login) rather than as an obvious "database is
down" message. **If something suddenly breaks, check `docker compose ps` first.**

## Troubleshooting

- **App can't reach the DB / `ECONNREFUSED`** → Docker isn't running, or the
  container is stopped. Start Docker Desktop, then `docker compose up -d`.
- **An error persists after you've already fixed the code** → stale build cache.
  Stop the dev server, delete the `.next` folder, then `npm run dev` again.
- **Inspect the database visually** → `npx prisma studio`.

## Note for deployment (Oracle VM)

`docker-compose.yml` sets `restart: unless-stopped`, so on the server Postgres
comes back automatically after a reboot. Locally, Docker Desktop itself must be
launched first — it does not auto-start unless you enable that in its settings.
