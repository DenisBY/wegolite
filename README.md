# Wegolite

Wegolite is a browser-based, faithful reimplementation of Oolite's core
single-player loop: fly a Cobra Mk III out of a Coriolis station, dock manually,
trade commodities between star systems, and hyperspace across the eight galaxies.
Desktop web only. It is an unofficial fan project, not affiliated with the Oolite
project, Frontier Developments plc, David Braben or Ian Bell.

Every process — dev server, production preview, unit tests and browser tests —
runs in Docker. The host machine is expected to provide Docker and a browser,
nothing else: no host Node, npm or Playwright install is authoritative.

The project is licensed GPL-2.0-or-later. Oolite-derived artwork and
configuration files remain CC BY-NC-SA 3.0 (attribution required, non-commercial
only, share-alike). See [`NOTICE`](./NOTICE), [`LICENSE`](./LICENSE) and
[`ASSETS.md`](./ASSETS.md).

## Commands

These are the same commands `AGENTS.md` documents; the service names are the
contract.

| Task                             | Command                                               |
| -------------------------------- | ----------------------------------------------------- |
| Dev server (port 5173)           | `docker compose up app`                               |
| Production preview (port 4173)   | `docker compose up preview`                           |
| Unit tests                       | `docker compose run --rm test`                        |
| Browser tests                    | `docker compose run --rm e2e`                         |
| Content build (regenerate)       | `docker compose run --rm assets`                      |
| Content drift check              | `docker compose run --rm assets npm run assets:check` |
| Full verification                | `docker compose run --rm verify`                      |
| Lint                             | `docker compose run --rm lint`                        |
| Typecheck                        | `docker compose run --rm typecheck`                   |
| Rebuild after dependency changes | `docker compose build --no-cache`                     |
| Stop and clean up                | `docker compose down --volumes --remove-orphans`      |

## Operational notes

- **Ports.** The dev server publishes `5173` and the production preview `4173`. The test services (`test`, `e2e`, `lint`, `typecheck`, `assets`, `verify`) publish no ports — Playwright starts its own `vite preview` inside the container.
- **Definition of done.** The only definition of done is `docker compose run --rm verify`: it runs `lint`, then `typecheck`, then `assets:check`, then `test`, then `build`, then `e2e`, as one fail-fast chain in one container, exiting non-zero at the first failing stage. A green host run is not evidence; tests pass only in the container.
- **Dependency changes.** After any `package.json` or `package-lock.json` change run `docker compose build --no-cache` **and** `docker compose down --volumes`. A rebuild alone is not enough: the named `node_modules` volume is populated from the image once and otherwise keeps its old contents.
- **Hot reload on WSL2/macOS.** If host edits stop triggering a reload, opt in to file polling with `VITE_USE_POLLING=1` (see `.env.example`). Polling is opt-in because it costs CPU.
- **Chromium posture.** Browser tests run the image's baked Chromium as root with its sandbox disabled, and the preview under test loads only content this repository serves. No third-party page is ever opened.
- **Working tree, not image.** `docker compose run --rm verify` bind-mounts the repository at `/app`, so it checks the edits you can see. Run `docker compose build` first when you need the committed tree verified instead.

## Repository layout

- `src/sim/` — pure TypeScript simulation core: no Three.js, no DOM, no wall clock.
- `src/render/` — camera-relative transforms and the scene, downstream of the sim.
- `tests/` — Vitest suites (`compliance`, golden fixtures, guards) and Playwright
  specs under `tests/e2e/`.
- `public/` — static assets; empty until the Phase 2 content compiler lands.
