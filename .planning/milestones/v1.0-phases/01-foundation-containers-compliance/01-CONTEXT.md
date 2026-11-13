# Phase 1: Foundation, Containers & Compliance - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the walking skeleton a contributor can actually use: a Docker-only workflow that serves, tests, and verifies the project from a clean checkout; a deterministic 1/120 s simulation loop proven identical across frame cadences; a camera-relative render path proven stable at 1.4e6 m; and the licence, attribution, and trademark posture in place before any asset lands.

It does **not** deliver game content, flight feel, a system scene, station screens, or saves. The only 3D geometry is placeholder proof geometry, and the only simulation is a kinematic probe. Phase 1's job is to make the toolchain and the two catastrophic-to-retrofit decisions (fixed step, camera-relative rendering) real and verifiable.

</domain>

<decisions>
## Implementation Decisions

### Container topology & verify chain
- **D-01:** One multi-stage `Dockerfile` with named targets (`base` → `deps` → `dev`, `ci`, `preview`); `compose.yaml` selects a stage with `build.target`. There is no second Dockerfile. — **Reversibility:** costly — splitting into per-concern Dockerfiles later means rewriting every service definition, the documented command table, and any CI wiring, and re-establishing that Node/Playwright versions do not drift.
- **D-02:** Every stage is based on `node:24-bookworm-slim`. The `ci` stage runs `npx playwright install --with-deps chromium` at image-build time so Chromium and its OS dependencies are baked into the layer; tests never download browsers. Do not use the Playwright base image, which would impose a second Node baseline. — **Reversibility:** costly — changing the base invalidates layer caching, the pinned browser/OS pairing, and the Node version every package engine field assumes.
- **D-03:** `verify` is a single Compose service that runs `lint → typecheck → test → build → e2e` as a fail-fast shell chain (`set -e`) inside one container. Individual `app`, `preview`, `test`, `e2e`, `lint`, and `typecheck` services remain for fast iteration. No `depends_on` fan-in and no custom Node orchestration script. — **Reversibility:** costly — `AGENTS.md` and the README document `docker compose run --rm verify` as the definition of done, so changing its shape changes the project's published contract.
- **D-04:** The `app` and `preview` services bind-mount the repository at `/app` and mount a named volume over `/app/node_modules`, so dependencies always come from the image and a host `node_modules` (if one ever appears) is ignored. Hot reload works on host edits without any host install.

### Visible Phase 1 deliverable
- **D-05:** The default page is a minimal game shell: a full-screen canvas, a small title/status overlay identifying it as a foundation build, the precision scene in view, a development-only renderer stats overlay, and the non-affiliation disclaimer in the shell footer. It is not a bare canvas and not a title screen with menu navigation.
- **D-06:** The 1.4e6 m precision scene is the default view on every load — not behind a query flag, dev route, or test-only harness. The camera-relative transform pass therefore runs for anyone who opens the app.
- **D-07:** Placeholder geometry is a small wireframe cube at 1.4e6 m plus a roughly 500 m box at about 100 km, against a starfield. No stand-in Cobra or Coriolis silhouettes — real meshes arrive from the Phase 2 content compiler.
- **D-08:** Precision is proven by two automated checks: a Node unit test on the camera-relative transform (subtraction in float64, uploaded coordinate magnitude below a documented limit, expected float32 ULP) and a Playwright smoke test that loads the shell, asserts the marker rendered (`renderer.info.render.calls > 0`), and fails on console errors. No screenshot or pixel diffing.

### Determinism harness
- **D-09:** The Phase 1 simulation is a minimal kinematic probe — position, velocity, and quaternion integrated from a scripted input log at 1/120 s. It deliberately excludes Oolite's flight constants (350 m/s, pitch 1.0, roll 2.0); those belong to Phase 3 tuning.
- **D-10:** The cadence test replays one input log through the real accumulator loop with synthetic frame deltas representing 30, 60, and 144 Hz, then asserts the final state hash is identical across all three. The loop uses a fake clock; no wall-clock time enters `step()`.
- **D-11:** State is serialized as canonical fixed-precision numeric text and hashed with a small in-repo FNV-1a. Input scripts and expected hashes are checked into `tests/golden/`. No `node:crypto`, no inline snapshots. — **Reversibility:** costly — changing the serialization or hash invalidates every checked-in golden fixture at once and silently weakens the regression net for later phases.
- **D-12:** The determinism harness runs as a Node-only Vitest project. Browser-mode Vitest is not part of Phase 1; the browser shell is covered by the Playwright smoke test.

### the agent's Discretion

The user selected three areas for discussion; these remain at the agent's discretion within the constraints below.

- **Licence and trademark artifacts (not discussed):** `FOUND-06` fixes the file set — `LICENSE` (full GPL-2.0-or-later text), `NOTICE` (Oolite project attribution and licence), `ASSETS.md` (per-asset provenance, seeded even while empty), and a non-affiliation/trademark disclaimer that is visible in the shipped shell footer. The planner decides exact wording, the source-offer link, and the `ASSETS.md` table shape. Hard constraints: no Frontier trademark in the product name or shipped UI, Oolite art terms recorded as CC BY-NC-SA 3.0, and project code as GPL-2.0-or-later.
- **Import-zone enforcement:** `FOUND-05` requires that `src/sim/` cannot import Three.js or touch the DOM. The mechanism is the planner's choice (ESLint `no-restricted-imports`, `eslint-plugin-import` zones, or `dependency-cruiser`); it must fail `lint`, not merely warn.
- **TypeScript strictness extras:** beyond `strict`, decide on `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`. `ARCHITECTURE.md` recommends `noUncheckedIndexedAccess`.
- **`test` service scope:** Phase 1's `test` service runs the Node unit project only. Browser-mode Vitest is introduced when DOM station screens exist (Phase 5); until then `e2e` is the only browser surface.
- **Ports and environment docs:** dev server and preview ports, `.env.example` contents, and the README command table are implementation details, provided the documented commands work verbatim from a clean checkout.
- **Enforcement timing:** whether lint/format also run in a git hook or only in `verify` is the planner's call; `verify` remains authoritative either way.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project constraints and scope
- `.planning/PROJECT.md` — Docker-first constraint, no-database decision, licence election, stack and fidelity constraints.
- `.planning/REQUIREMENTS.md` §Foundation, Containers & Compliance — `FOUND-01` through `FOUND-09`, the acceptance text this phase must satisfy.
- `.planning/ROADMAP.md` §Phase 1 — goal and the five success criteria; also the "Container rule for every phase" note.

### Technical design already researched
- `.planning/research/STACK.md` — exact pinned versions, recommended `package.json`, testing split, build/static-hosting configuration, and the "do not add yet" list.
- `.planning/research/ARCHITECTURE.md` §Pattern 1 — camera-relative rendering, near/far planes, logarithmic depth, and the float32 ULP table.
- `.planning/research/ARCHITECTURE.md` §Pattern 2 — fixed-timestep constants (`DT = 1/120`, `MAX_STEPS_PER_FRAME = 5`, `MAX_FRAME_DELTA = 0.25`) and the determinism guarantees.
- `.planning/research/ARCHITECTURE.md` §Recommended Project Structure — directory layout, import zones, and the `sim/` purity rule.
- `.planning/research/PITFALLS.md` — known traps; read before choosing build or rendering shortcuts.

### Operational contract
- `AGENTS.md` — the container-only command table and the rules that host installs are never authoritative.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. The repository contains only `.planning/`, `AGENTS.md`, and git history. This is a greenfield scaffold; every application file in this phase is new.

### Established Patterns
- No in-repo code patterns exist yet. The patterns to follow are prescribed by `research/ARCHITECTURE.md`: pure `src/sim/`, one-way `render/sync.ts`, command/event boundary, and import-zone enforcement.
- `AGENTS.md` already documents the intended commands; Phase 1 must make them true rather than invent new ones.

### Integration Points
- `index.html` and `src/main.ts` are the entry points the shell boots from.
- `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, and `eslint.config.js` are the config surfaces the tooling decisions attach to.
- `compose.yaml` plus the multi-stage `Dockerfile` are the single integration point between the host and every command in `AGENTS.md`.

</code_context>

<specifics>
## Specific Ideas

No special references were raised. The user consistently chose the recommended option: a shared multi-stage image, Node 24 with baked Chromium, a fail-fast `verify` chain, a bind-mounted dev tree with image-owned `node_modules`, a minimal shell that shows the precision scene by default, numeric proof instead of pixel diffing, and a Node-only FNV-1a golden harness.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The licence/trademark area was not selected for discussion and is captured above as planner discretion, not deferred.

</deferred>

---

*Phase: 1-Foundation, Containers & Compliance*
*Context gathered: 2026-11-02*
