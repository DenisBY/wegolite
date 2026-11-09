# Wegolite — Agent Guide

## Project

Wegolite is a browser-based, faithful reimplementation of Oolite's core single-player loop: fly a Cobra Mk III out of a Coriolis station, dock manually, trade commodities between star systems, and hyperspace across the eight galaxies. Desktop web only. No combat, NPC traffic, or expansion packs (OXPs) in v1.

Read `.planning/PROJECT.md` for the authoritative scope, constraints, and decisions. Read `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` before starting work on a phase.

## Codebase memory

Use the codebase-memory MCP index before grepping, reading whole directories, or guessing at structure. The repository is indexed as project `wegolite`.

- The main agent and **every subagent** must use codebase-memory when exploring code. Include this instruction in subagent prompts.
- Start with `index_status` to check freshness. Re-index with `index_repository` after large structural changes; the index is best-effort, not proof of completeness.
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
- Include this path and instruction in every subagent prompt that may need Oolite references.

## Non-negotiable constraints

1. **Everything runs in Docker.** The app (dev server and production preview) and every test run in containers. Do not treat host-installed Node, npm, or Playwright browsers as authoritative.
2. **Tests pass only in the container.** A green host run is not evidence. The command below is the source of truth.
3. **No database.** The client is static and persists saves in IndexedDB. Do not add a database, ORM, or server-side storage without an explicit decision recorded in `.planning/PROJECT.md`.
4. **Licensing.** Project code is GPL-2.0-or-later. Oolite-derived art and config remain CC BY-NC-SA 3.0: attribution required, non-commercial only, share-alike. Never add an asset without recording its provenance in `NOTICE`/`ASSETS.md`.
5. **No OXP support.** Expansion packs are out of scope by definition.

## Reviewer and subagent brief

Include this block in every reviewer, verifier, auditor, explorer, or executor prompt:

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

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

# Run the full release gate (the same chain with the full Chromium e2e suite; CI runs this)
docker compose run --rm verify-full

# Rebuild after dependency changes, then drop the stale named volume
docker compose build --no-cache
docker compose down --volumes

# Stop and clean up
docker compose down --volumes --remove-orphans
```

`verify` is the fast gate and runs on every change; `verify-full` is the release gate and runs before a release and when render, input, persistence or network-guard code changes. CI runs `verify-full`.

Rules:

- If a command needs a tool, add it to a Dockerfile — never install it on the host.
- Keep dependency installs inside the image build so layers cache. Do not run `npm install` on the host.
- Browser tests must use the browsers baked into the Playwright image; do not download browsers at test time.
- Pin base image tags. Do not use `latest`.
- Every service must be reachable from a clean checkout with `docker compose up`. Document any required env vars in `.env.example`.
- Ports are published to the host only for the dev server (`5173`) and preview (`4173`). Test services need no published ports.
- `docker compose build` alone is **not** enough after a `package.json`/`package-lock.json` change: the named `node_modules` volume is populated from the image once and otherwise keeps its old contents, so run `docker compose down --volumes` as well.
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

## Commands quick reference

| Task                           | Command                                               |
| ------------------------------ | ----------------------------------------------------- |
| Dev server (port 5173)         | `docker compose up app`                               |
| Production preview (port 4173) | `docker compose up preview`                           |
| Unit tests                     | `docker compose run --rm test`                        |
| Browser tests                  | `docker compose run --rm e2e`                         |
| Firefox browser tests          | `docker compose run --rm e2e-cross`                   |
| Content build (regenerate)     | `docker compose run --rm assets`                      |
| Content drift check            | `docker compose run --rm assets npm run assets:check` |
| Fast verification gate         | `docker compose run --rm verify`                      |
| Full release gate              | `docker compose run --rm verify-full`                 |
| Lint                           | `docker compose run --rm lint`                        |
| Typecheck                      | `docker compose run --rm typecheck`                   |

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
