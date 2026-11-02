# Wegolite — Agent Guide

## Project

Wegolite is a browser-based, faithful reimplementation of Oolite's core single-player loop: fly a Cobra Mk III out of a Coriolis station, dock manually, trade commodities between star systems, and hyperspace across the eight galaxies. Desktop web only. No combat, NPC traffic, or expansion packs (OXPs) in v1.

Read `.planning/PROJECT.md` for the authoritative scope, constraints, and decisions. Read `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` before starting work on a phase.

## Non-negotiable constraints

1. **Everything runs in Docker.** The app (dev server and production preview) and every test run in containers. Do not treat host-installed Node, npm, or Playwright browsers as authoritative.
2. **Tests pass only in the container.** A green host run is not evidence. The command below is the source of truth.
3. **No database.** The client is static and persists saves in IndexedDB. Do not add a database, ORM, or server-side storage without an explicit decision recorded in `.planning/PROJECT.md`.
4. **Licensing.** Project code is GPL-2.0-or-later. Oolite-derived art and config remain CC BY-NC-SA 3.0: attribution required, non-commercial only, share-alike. Never add an asset without recording its provenance in `NOTICE`/`ASSETS.md`.
5. **No OXP support.** Expansion packs are out of scope by definition.

## Docker workflow

The Compose file is the entry point for every task. Expected commands:

```bash
# Start the dev server (Vite) with hot reload
docker compose up app

# Build and serve the production bundle
docker compose up preview

# Run unit + integration tests (Vitest)
docker compose run --rm test

# Run browser/end-to-end tests (Playwright, headless)
docker compose run --rm e2e

# Run everything CI runs
docker compose run --rm verify

# Rebuild after dependency changes
docker compose build --no-cache

# Stop and clean up
docker compose down --volumes --remove-orphans
```

Rules:

- If a command needs a tool, add it to a Dockerfile — never install it on the host.
- Keep dependency installs inside the image build so layers cache. Do not run `npm install` on the host.
- Browser tests must use the browsers baked into the Playwright image; do not download browsers at test time.
- Pin base image tags. Do not use `latest`.
- Every service must be reachable from a clean checkout with `docker compose up`. Document any required env vars in `.env.example`.
- Ports are published to the host only for the dev server and preview. Test services need no published ports.

If Compose is not yet present (early scaffolding), creating it is part of the first implementation phase — not an optional extra.

## Stack

- TypeScript, Three.js (WebGL2), Vite
- Vitest for unit/integration, Playwright for browser tests
- IndexedDB for saves
- Static hosting; no backend

## Conventions

- The simulation core under `src/sim/` must not import Three.js or touch the DOM. It is pure TypeScript, fixed-timestep, deterministic, and unit-testable.
- Rendering, input, and UI are downstream of the simulation through commands and events.
- Content data is compiled from Oolite configs at build time; do not hand-edit generated data.
- Record significant decisions in `.planning/PROJECT.md` under Key Decisions.

## Commands quick reference

| Task | Command |
|---|---|
| Dev server | `docker compose up app` |
| Production preview | `docker compose up preview` |
| Unit tests | `docker compose run --rm test` |
| Browser tests | `docker compose run --rm e2e` |
| Full verification | `docker compose run --rm verify` |
| Lint | `docker compose run --rm lint` |
| Typecheck | `docker compose run --rm typecheck` |
