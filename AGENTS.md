# Wegolite — Agent Guide

## Project

Wegolite is a browser-based, faithful reimplementation of Oolite's core single-player loop: fly a Cobra Mk III out of a Coriolis station, dock manually, trade commodities between star systems, and hyperspace across the eight galaxies. Desktop web only. No combat, NPC traffic, or expansion packs (OXPs) in v1.

**Fidelity rule.** Oolite's behaviour, data and text are the default. Diverge only where the result is clearly better (clarity, correctness, an upstream bug), the reviewer models agree in plan or code review, and a `FIDELITY.md` row records the reason. Never diverge silently (owner decision 2026-11-21, PROJECT.md Key Decisions).

Read `.planning/PROJECT.md` for the authoritative scope, constraints, and decisions. Read `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` before starting work on a phase.

## Codebase memory

The codebase-memory MCP is recommended, not required (see README "Recommended agent tooling"). **When it is available**, use its index before grepping, reading whole directories, or guessing at structure. The repository is indexed as project `wegolite`. Without it, explore with `rg` and file reads; nothing else in this guide depends on it.

- When the MCP is available, the main agent and **every subagent** must use codebase-memory when exploring code. Include this instruction in subagent prompts, conditional on the MCP being available.
- Start with `index_status` to check freshness. The index does not auto-refresh for every session: when `indexed_at` is older than the latest commits that touch code, re-index with `index_repository` (`async: true` for a large repo). Re-index also after large structural changes; the index is best-effort, not proof of completeness.
- Prefer `search_graph` for symbols, `trace_path` for callers/callees, `get_code_snippet` for source, `query_graph` for multi-hop questions, and `get_architecture` for the overview or layering.
- Fall back to `rg` (ripgrep) or file reads for literals, configuration, non-code files, and paths reported as coverage gaps. Verify cited paths with `check_index_coverage`.
- Prefer `rg` over `grep` everywhere: `rg -n <pattern>`, `rg --files -g '<glob>'`. Include this instruction in subagent prompts.
- Treat graph results as an index into the source: confirm important findings against the actual file before changing code.

## Oolite reference checkout

A full Oolite source checkout is available at `/home/opencode/git/oolite` (outside this repo). Use it directly whenever upstream Oolite behaviour, configs, or source are needed — do **not** fetch Oolite files over the network and do not clone another copy.

- Configs: `/home/opencode/git/oolite/Resources/Config/*.plist` (`planetinfo.plist`, `shipdata.plist`, `hud.plist`, `keyconfig.plist`, …).
- Engine source: `/home/opencode/git/oolite/src/`.
- Models/textures: `/home/opencode/git/oolite/Resources/Models/`, `.../Textures/`.
- The vendored subset in `third_party/oolite/` is the licence-audited input for the content build. Read behaviour from the checkout; consume data from the vendored copy (and keep `CHECKSUMS.sha256` honest).
- When the codebase-memory MCP is available, the checkout is indexed as project `oolite`: look up Objective-C classes and methods with `search_graph` / `get_code_snippet` (`project: "oolite"`) before `rg`. Plists are not parsed by the index; read them as text. Check `index_status` for `oolite` and re-index the checkout when it has moved past `indexed_at`.
- Include this path and instruction in every subagent prompt that may need Oolite references.

## Non-negotiable constraints

1. **Everything runs in Docker.** The app (dev server and production preview) and every test run in containers. Do not treat host-installed Node, npm, or Playwright browsers as authoritative.
2. **Tests pass only in the container.** A green host run is not evidence. The command below is the source of truth.
3. **No database.** The client is static and persists saves in IndexedDB. Do not add a database, ORM, or server-side storage without an explicit decision recorded in `.planning/PROJECT.md`.
4. **Licensing.** Project code is GPL-2.0-or-later. Oolite-derived art and config remain CC BY-NC-SA 3.0: attribution required, non-commercial only, share-alike. Never add an asset without recording its provenance in `NOTICE`/`ASSETS.md`.
5. **No OXP support for now.** Expansion packs are out of scope until an explicit decision in `.planning/PROJECT.md` brings them in (revised at v2.0 from "by definition").

## Reviewer and subagent brief

Include this block in every reviewer, verifier, auditor, explorer, or executor prompt:

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

## Delegating simple tasks

Always hand a simple task to the cheapest available model (a subagent on the
smallest model tier) instead of doing it on the main, expensive model.

- A task is simple when it is mechanical and its result is easy to check:
  bookkeeping in `.planning/` (archiving, status rows, moving todos), renames
  and other find-and-replace edits, formatting, bumping a version string,
  copying a pattern that already exists, collecting facts from named files.
- Keep on the main model anything that needs judgement or carries risk:
  design and debugging, simulation and rendering code, save-format and
  persistence changes, security, licensing and provenance, and any decision
  that revises a recorded one.
- The brief must stand on its own: the goal, the exact files in scope, what
  must not be touched, and the "Reviewer and subagent brief" block above. Say
  explicitly that the subagent must not commit, push or tag unless that is the
  task.
- The main agent stays responsible for the result: read the subagent's changes
  before committing them, and run the checks the change calls for.

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

# Run the Firefox engine smoke and core-loop journey (headed under xvfb; not part of verify)
docker compose run --rm e2e-cross

# Run the fast gate (lint, typecheck, content drift, unit tests, build, e2e smoke subset)
docker compose run --rm verify

# Run the full release gate (the same chain with the full Chromium e2e suite; CI runs it split into parallel jobs)
docker compose run --rm verify-full

# Rebuild after dependency changes, then drop the stale named volume
docker compose build --no-cache
docker compose down --volumes

# Stop and clean up
docker compose down --volumes --remove-orphans
```

`verify` is the fast gate and runs on every change; `verify-full` is the release gate and runs before a release and when render, input, persistence or network-guard code changes. CI runs the same chain split across parallel jobs in `.github/workflows/verify.yml`: `verify-checks` (`verify-full` without the full Chromium suite) and the Chromium suite in four `--shard=N/4` jobs; an aggregate `verify` job and the workflow conclusion gate the Pages deploy. Choose the gate by change type: changes limited to pure simulation logic (`src/sim/`) and its tests or guards need only `docker compose run --rm test`, `lint` and `typecheck`; changes to browser-facing code (`src/app/`, `src/render/`, `src/input/`, `src/ui/`, `index.html`) need `verify`; `verify-full` stays for releases and for render, input, persistence or network-guard changes.

The 20-seed NPC acceptance run (`npm run test:acceptance`, `tests/acceptance/`) is in no gate, by decision (Phase 14 review IN-04). Rerun it by hand, on the remote test machine, after any change under `src/sim/npc/**`, `src/sim/world/**` or to `src/content/generated/ships-npc.json`, and record the result in the plan's SUMMARY. The thresholds and detectors are frozen: changing them needs the owner's `Detector-change-approved-by-owner` trailer. Revisit adding the run to `verify-full` when a later phase changes NPC behaviour.

Rules:

- If a command needs a tool, add it to a Dockerfile — never install it on the host.
- Keep dependency installs inside the image build so layers cache. Do not run `npm install` on the host.
- Browser tests must use the browsers baked into the Playwright image; do not download browsers at test time.
- Pin base image tags. Do not use `latest`.
- Every service must be reachable from a clean checkout with `docker compose up`. Document any required env vars in `.env.example`.
- Ports are published to the host only for the dev server (`5173`) and preview (`4173`). Test services need no published ports.
- `docker compose build` alone is **not** enough after a `package.json`/`package-lock.json` change: the named `node_modules` volume is populated from the image once and otherwise keeps its old contents, so run `docker compose down --volumes` as well.
- Browser specs run against the browser-test bundle (`npm run build:e2e`, NPC traffic off by default; a spec opts in with `?test=1&traffic=1`), while `npm run build` (the `preview` service and the Pages deploy) is the production bundle with traffic on.
- On WSL2 or macOS, if hot reload stops seeing host edits, opt in to polling with `VITE_USE_POLLING=1` (documented in `.env.example`). It is opt-in because polling burns CPU.
- `docker compose run --rm verify` bind-mounts the working tree, so it validates your current edits rather than the content baked into the image.

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
- All project documentation is written in English, whatever language the conversation with the user uses: `docs/`, `.planning/`, `README.md`, planning artifacts, SUMMARY/UAT/debug notes, commit messages and PR text. The game UI is exempt, because it may be localised later.

## Versioning and changelog

- Follow [Semantic Versioning](https://semver.org/) for the version in `package.json`: `MAJOR.MINOR.PATCH`.
- Keep `CHANGELOG.md` at the repository root in [Keep a Changelog](https://keepachangelog.com/) format.
- Add every user-visible change under `## [Unreleased]` in the appropriate group (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) in the same commit as the change.
- Before a release, move the `Unreleased` entries under a new `## [x.y.z] - YYYY-MM-DD` heading, bump `package.json`, and commit both together.
- Pre-1.0 (`0.y.z`): a breaking change may ship in a minor release, but it must be called out explicitly. From `1.0.0` on, breaking changes require a major version.
- Internal-only changes (tests, refactors, build tooling) may be omitted unless they affect contributors or released behaviour.
- Do not rewrite released changelog sections.

## Commands quick reference

| Task                                                    | Command                                               |
| ------------------------------------------------------- | ----------------------------------------------------- |
| Dev server (port 5173)                                  | `docker compose up app`                               |
| Production preview (port 4173)                          | `docker compose up preview`                           |
| Unit tests                                              | `docker compose run --rm test`                        |
| Unit tests (local, no coverage)                         | `docker compose run --rm test npm run test:fast`      |
| Browser tests                                           | `docker compose run --rm e2e`                         |
| Firefox browser tests                                   | `docker compose run --rm e2e-cross`                   |
| Content build (regenerate)                              | `docker compose run --rm assets`                      |
| Content drift check                                     | `docker compose run --rm assets npm run assets:check` |
| Fast verification gate                                  | `docker compose run --rm verify`                      |
| Full release gate                                       | `docker compose run --rm verify-full`                 |
| CI checks job (release gate without the Chromium suite) | `docker compose run --rm verify-checks`               |
| Lint                                                    | `docker compose run --rm lint`                        |
| Typecheck                                               | `docker compose run --rm typecheck`                   |

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
