# Walking Skeleton — Wegolite

**Phase:** 1 (Foundation, Containers & Compliance)
**Generated:** 2026-11-02

## Capability Proven End-to-End

A contributor with only Docker runs one documented command from a clean checkout and gets a live page at `http://localhost:5173` — served by Vite from inside the multi-stage image, booted through a bind-mounted working tree — whose WebGL2 renderer places a camera-relative marker at 1.4e6 m. In the same phase, the pure `src/sim/` probe is proven by unit tests (not by the page) to produce an identical 1/120 s state hash across four frame cadences, and `docker compose run --rm verify` re-proves both halves from a volume-free rebuild.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime / language | Node 24 (`node:24-bookworm-slim@sha256:c86ecead…`) + TypeScript 6.0.2, ESM, `moduleResolution: "bundler"` | One Node baseline for dev, test and CI; exact pins keep the image reproducible; `typescript-eslint`'s peer range excludes TS 7. |
| Build / dev server | Vite 8.3.5 (`base: "./"`, `server.host 0.0.0.0`, `strictPort`) | Rolldown build, first-class static output, HMR inside the container; `base: "./"` because hosting is path-relative. |
| Renderer | Three.js 0.187.0, WebGL2, `logarithmicDepthBuffer: true`, camera at the origin | Camera-relative placement is the only strategy that survives 1.4e6 m in float32; log depth covers 0.5 m → 2.5e6 m without reversed depth. |
| Simulation core | Pure TypeScript under `src/sim/`, fixed `DT = 1/120`, `MAX_STEPS_PER_FRAME = 5`, `MAX_FRAME_DELTA = 0.25`, no DOM/Three/clock/randomness | Fixed step is the most expensive thing to retrofit; purity is enforced by two independent gates. |
| Determinism proof | Canonical fixed-precision text + in-repo FNV-1a 32, checked-in golden fixture | No dependency, no `node:crypto`, no inline snapshots; a versioned fixture makes a re-baseline a reviewed change. |
| Container topology | One multi-stage `Dockerfile` (`base → deps → ci → preview` alias → `dev`), Compose `build.target: ci` for every command service, one named `node_modules` volume | One image, one Node, one Chromium; the `preview` stage is a named alias of `ci` (D-01 enumerates it) with no distinct build; the bind mount makes the documented commands evaluate the working tree. |
| Verify chain | One Compose service running `sh -lc "lint && typecheck && test && build && e2e"` | Real exit-code propagation; `depends_on` fan-in cannot fail the chain. |
| Data layer | None in Phase 1. No database, no ORM, no server storage. Saves will use IndexedDB from Phase 6. | Static client by project constraint; Phase 1 must not create a persistence surface it cannot test. |
| Auth | None. Single-player, no accounts, no backend. | Out of scope for the milestone. |
| Deployment target | Static bundle (`dist/`) with relative base; local production preview via `vite preview` on 4173 in Phase 1, real static hosting in Phase 7. | Phase 7 owns hosting and cross-browser hardening (QUAL-01..08). |
| Directory layout | `src/sim/` (pure), `src/render/` (Three + pure transforms), `src/main.ts` (composer: canvas, renderer, camera, the single `place()` call site), `tests/e2e/`, `tests/golden/`, `tests/guards/` | One-way data flow: shell → render → three; shell → sim; only `cameraRelative` crosses from world to render coordinates. |
| Licensing | Project code GPL-2.0-or-later; Oolite-derived art and configuration under CC BY-NC-SA 3.0 with per-asset provenance in `ASSETS.md`; non-affiliation disclaimer in the shipped footer | Fixed before the first asset; changing it later would require re-licensing committed art. |

## Stack Touched in Phase 1

- [x] Project scaffold — Vite + TypeScript + Vitest + Playwright, ESLint flat config, Prettier, exact pins, committed lockfile
- [x] Routing — one real route: the single-page shell at `/` served by Vite (no client router in Phase 1)
- [x] Data layer — none by constraint; the "read + write" equivalent is the deterministic simulation state: it is advanced by `step()` and serialized/hashed (`serialize()` → `fnv1a32`) against a checked-in fixture
- [x] UI — one interactive surface: the canvas mounts, the renderer boots, and the overlay/status/stats text is populated through `textContent` (input handling arrives in Phase 3)
- [x] Deployment / full-stack run — `docker compose up app`, `docker compose up preview`, and `docker compose run --rm verify` all run the full stack locally from a clean checkout

## Out of Scope (Deferred to Later Slices)

- Any game content: no Cobra, Coriolis, planet, sun, station, commodity, or system data (Phase 2/3)
- Flight model, flight-feel constants, input handling, HUD (Phase 3)
- Docking, including the docking computer (Phase 4)
- Market, outfitting, status and system-data screens (Phase 5)
- Hyperspace, galactic chart, fuel rules, IndexedDB saves and migrations (Phase 6)
- Real static hosting, three-browser support, 60 fps budget, WebGL-context-loss recovery, `FIDELITY.md`, licensing audit (Phase 7)
- Browser-mode Vitest (Phase 5), OXPs (never), a database (never)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: compile a pinned Oolite snapshot into typed content, GLB models and a drift gate — same image, same verify chain, new `content/` and `tools/oolite-ingest/` zones
- Phase 3: launch from Lave's Coriolis and fly the Cobra through a faithfully scaled, stably rendered system — the `src/sim/` step and the camera-relative render path from this skeleton, now driven by real content and real input
- Phase 4: manual docking with corridor feedback plus the buyable docking computer
- Phase 5: docked economy and keyboard-driven station screens
- Phase 6: hyperspace navigation and IndexedDB saves that resume exactly
- Phase 7: hardening and community release
