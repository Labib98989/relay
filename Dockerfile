# syntax=docker/dockerfile:1

# Multi-stage build for the Next.js (standalone) production image.
#
# Base: node:24-slim (Debian) rather than alpine. Two of our native-ish deps —
# Prisma's schema/migration engine and Next's image optimizer (sharp) — ship
# glibc prebuilts that "just work" on Debian; on alpine (musl) they're a common
# source of "binary not found / wrong libc" surprises. Slim is a bit larger but
# far less fiddly for a first deploy. 24 matches the local dev runtime.
ARG NODE_IMAGE=node:24-slim

# A throwaway URL so `npm ci` (which runs the `postinstall: prisma generate`
# script) and `next build` never need the real database. Nothing connects at
# build time — the datasource block in schema.prisma has no url, and our pages
# are dynamic (auth), so the build does no DB I/O.
ARG BUILD_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# ---------------------------------------------------------------------------
# deps — install node_modules once, cached on the lockfile.
# We copy the Prisma schema + config BEFORE `npm ci` on purpose: the root
# `postinstall` runs `prisma generate`, which needs the schema present. This
# also triggers Prisma's own install step that fetches the migration engine
# binary (so the `migrator` stage below can run `migrate deploy`).
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ARG BUILD_DATABASE_URL
ENV DATABASE_URL=${BUILD_DATABASE_URL}
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------------
# builder — compile the app into .next/standalone.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ARG BUILD_DATABASE_URL
ENV DATABASE_URL=${BUILD_DATABASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Regenerate against the current schema (cheap; guarantees the client matches
# the source we just copied even if the deps layer was cached from an older one).
RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# migrator — one-shot image that applies pending migrations, then exits.
# Reuses the deps layer (node_modules with the Prisma CLI + engine, the schema,
# the migrations, and prisma.config.ts). The real DATABASE_URL is injected at
# RUN time by compose, overriding the placeholder ENV from the deps stage.
# ---------------------------------------------------------------------------
FROM deps AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runner — minimal production image. Runs the traced standalone server as the
# unprivileged built-in `node` user.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The standalone server reads these; bind all interfaces so Caddy can reach it.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# standalone does NOT bundle public/ or .next/static — copy them in so the
# minimal server.js can serve them (confirmed in the Next self-hosting docs).
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Safeguard: ensure the generated Prisma client is present even in the unlikely
# case output tracing missed it (it lives in the source tree, not node_modules).
COPY --from=builder --chown=node:node /app/src/generated ./src/generated

USER node
EXPOSE 3000
CMD ["node", "server.js"]
