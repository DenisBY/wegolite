# Broad-Context & Blast-Radius Review (reviewer-context-sonnet)

Scope: Round 4 review of Phase 8 plans 08-01..08-16 at commit 0aa747a, through the lens of existing callers, e2e tests, save format, CI/verify gate, CHANGELOG/NOTICE obligations, Docker workflow, and consistency with PROJECT.md / CONTEXT.md / REQUIREMENTS.

Method: I did not re-read all 4,500 plan lines line by line. I read CONTEXT in full, then traced the Round 3 consensus items and the cross-cutting blast-radius points against the repo source. Per-plan sections below are therefore brief where I found nothing in my lens. Coverage-index checks were not run (graph returned only planning symbols for the source files I relied on, so I read the files directly).

## Round 3 verification (all five consensus items)

1. Domain alignment spawnEntity / sanitizeEntity / parseWorldSnapshot (08-05, 08-11, 08-13): RESOLVED. 08-11-PLAN.md:165-169 now bounds ownerId/spawnTick/nav.targetId/rng/ai timers/repairs at `0..0xffffffff` with `repairs` saturating; 08-11-PLAN.md:162 clarifies 1e12 is a world-local cap wider than `MAX_SAVE_POSITION_MAGNITUDE = 1e9` (confirmed `src/persistence/save.ts:123` is 1e9); `MAX_AI_PARAMS_KEYS` is exported from 08-11 and 08-13 (08-13-PLAN.md:34,107); 08-05-PLAN.md:181 adds `specKey.repeat(129)`, `tick = 2**32`, `ownerId = 2**32` rows. Post-spawn in-place mutation is carried in the 08-13 R3-01 disposition (08-13-PLAN.md:258).
2. 08-15 anchored-save call shape: RESOLVED. 08-15-PLAN.md:206 now inspects `Object.keys(inputs)` / `JSON.stringify(inputs)` / `encodeSave(inputs)` on the `SaveInputs` object. I checked the key allow-list against `src/persistence/save.ts:301-320`: the 14 `SaveInputs` keys listed in the plan match the interface exactly (including optional `targetSystem`, `marketSeed`, `market`, `flight`).
3. 08-16 `createTestHook`: RESOLVED. 08-16-PLAN.md:125 makes `sim` a required fifth parameter; `createTestHook` has exactly one call site (`src/app/game-session.ts:1035`), so the blast radius is one line. NOTE: the Round 3 consensus text says `worldHash(): number`; the plan correctly uses `string` because `hashFlight`/`fnv1a32` return `string` (`src/sim/flight/state.ts:181`, `src/sim/hash.ts:13`). The consensus text was wrong, the plan is right.
4. MAX_SAVE_POSITION_MAGNITUDE citation: RESOLVED (see 1).
5. Guard precision: 08-03-PLAN.md:141,161 add `Reflect["get"]`, `Reflect.apply`, `.sort.apply/.bind`; line-anchor refresh recorded in 08-10/08-12 dispositions. I confirmed `pending.length = 0;` is at `src/app/game-session.ts:2738` today, matching the refreshed anchors (the old `:2744` citation was stale). Note: the plans' line anchors will drift again as soon as 08-04..08-10 land; they are only useful as pre-move references.

## 08-01
Summary: verify-full baseline, probe-shape snapshot, order-independent session-source scans for `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts` (the only two tests that read `game-session.ts` as text; I confirmed with `rg`, plus two comment-only mentions in `tests/e2e/budget.spec.ts:15` and `hyperspace-failure.spec.ts:43` that need no change).
Strengths: `test:e2e:fast` change is paired with the pinned string in `tests/contract/container-contract.test.ts:336` (plan 08-01-PLAN.md:140,253). Strict `[]` comparator.
Concerns: LOW - the plan sits at the 10-file threshold (08-01-PLAN.md:75); acceptable.
Suggestions: none.
Risk: LOW.

## 08-02
Summary: pinned v1 flight hashes, serialisable RNG, `mix32` seeds.
Strengths: Does not regenerate goldens; respects CONTEXT discretion on `arrival.ts`.
Concerns: LOW - `src/sim/**` coverage floors (`vitest.config.ts:35-41`: lines 93, branches 86) apply to all new sim code; defensive-branch-heavy modules can dip. Plan relies on tests-first, which is fine.
Risk: LOW.

## 08-03
Summary: determinism bans in `src/sim` plus guard tests.
Strengths: Named constants spread by later blocks, so the AI-zone override does not silently drop bans (flat-config replace semantics). The bans partly pre-exist in `eslint.config.js:127-149` (Math.random, Date, wall clock), so the plan is additive rather than a rewrite.
Concerns: LOW - the guards write probe files under `src/sim` and run real `tsc` on `tsconfig.sim.json`; `withProbeLock` (`tests/guards/probe-lock.ts`) serialises them. New guard files in 08-03/08-09 must use it; the plan states `__purity_` prefix via `withSimProbe`. Fine.
Risk: LOW.

## 08-04
Summary: typed session context and probe-publisher extraction (split steps 1-2).
Strengths: Gate attribution rule for a shared tree; stale-capture audit.
Concerns: LOW - no CHANGELOG entry needed, matches AGENTS.md internal-only rule.
Risk: MEDIUM (inherent to a 3,365-line split; mitigated by probe-shape snapshot and goldens).

## 08-05
Summary: ids, entities, five static entities, store, world hash.
Strengths: Per-world id scope matches the 2026-11-12 D-06 amendment in CONTEXT, ROADMAP SC2 and REQUIREMENTS FOUND-11 (all three already worded consistently; I checked REQUIREMENTS.md:23). `liveEntityCount` exported for the app layer, which keeps `src/app` off `world.store`.
Concerns: LOW - `PROJECT.md` Key Decisions row 'Entity id uniqueness is per world' is a required edit in this plan; confirm the row lands in the same commit as the code (the plan says so).
Risk: LOW.

## 08-06
Summary: render driver, chart, settings controllers; verify-full gate.
Strengths: The gate runs in a clean worktree from a recorded SHA.
Concerns: MEDIUM - see cross-plan item C1 (Firefox).
Risk: MEDIUM.

## 08-07
Summary: read-only `WorldView`, write-only `ShipControl`.
Strengths: Explicitly pins coverage floors via `docker compose run --rm test`.
Concerns: LOW.
Risk: LOW.

## 08-08
Summary: station and save controllers; verify-full gate. Injects `SaveControllerDeps` so `loadFromSave` is Node-testable, which 08-15 then reuses.
Strengths: Save format untouched; Round 3 disposition says no findings.
Concerns: LOW - `src/persistence/idb-store.ts` is coverage-excluded (`vitest.config.ts:21`), so the doubles in 08-08 are the only unit proof of load order; the browser save-load specs in verify-full are the second proof, as the plan states.
Risk: MEDIUM (save path).

## 08-09
Summary: AI types, tick timers, registry, scripted test pilot, AI lint zone.
Strengths: Rule replacement is handled (`...SIM_SYNTAX_BANS` spread, 08-09-PLAN.md:185). Depth-3 catch-all rejects deeper nesting instead of leaving a bypass. The AI `no-restricted-imports` regex rejects `three` and `zod` as well, so replacing the sim-zone import rule loses nothing.
Concerns: LOW - `TEST_PILOT` and `AI_REGISTRY` ship in the production bundle (nothing imports them from `src/app` until 08-14/16, so Vite will tree-shake; if `AI_REGISTRY` is later imported by the session, the test pilot rides along). Informational only.
Risk: LOW.

## 08-10
Summary: hyperspace controller as one atomic unit, event router, sim driver.
Strengths: Declarative `EVENT_KIND_SUBSCRIBER` map with ordered fan-out.
Concerns: LOW - line anchors in the plan are stale again once earlier steps land; the executor must re-find sites by pattern, not line.
Risk: MEDIUM.

## 08-11
Summary: world step after the flight step, queued AI events, sanitizer.
Strengths: Domain table closed against 08-13.
Concerns: LOW - `sanitize` repair counts become hashed state (08-11-PLAN.md:34); acceptable and tested.
Risk: MEDIUM.

## 08-12
Summary: frame loop and start-up wiring, thin facade; verify-full gate.
Strengths: Construction/teardown order recorded as header comments; pinned-literal audit.
Concerns: MEDIUM - this is the step that rewrites rAF/frame timing and `window.addEventListener` registration (`game-session.ts:2268,2289` are the only two window listeners). The Firefox journey (`e2e-cross`) is outside `verify`/`verify-full` and no plan runs it (`rg e2e-cross` over all 16 plans: zero hits). See C1.
Risk: MEDIUM.

## 08-13
Summary: snapshot codec, 1,000-tick live-vs-restored equality, world cadence.
Strengths: Parser/restore share one validator; constants exported once.
Concerns: LOW.
Risk: LOW.

## 08-14
Summary: test flags and manual-clock sim driver with `advanceTicks`.
Strengths: URL flags read once at boot, no runtime toggle (D-09, D-10); matches CONTEXT.
Concerns: LOW - `?test=1&clock=manual` and `traffic=1` are new documented test surface; no README/docs mention is planned (AGENTS.md only requires CHANGELOG for user-visible changes, so this is optional).
Risk: LOW.

## 08-15
Summary: single integration plan; epoch bump points; anchored-save check; hot-path cost check.
Strengths: Warm `Load` and cold `Continue` produce identical epoch/worldSeed via `resetForRestore(0)`; Phase 11 hand-off recorded in PROJECT.md. This is consistent with CONTEXT D-02 ("reloading a save and launching reproduces the same world") and D-03 (epoch in memory only). Anchored-save test is now correctly shaped. Perf scratch script lives in `/tmp/wegolite-perf`, in line with AGENTS.md.
Concerns: LOW - the 1.2x + 2 us threshold is a wall-clock microbenchmark inside a container; flaky on a loaded runner. The plan says never relax the threshold; recommend a small re-run allowance (best of N) so a noisy host does not block the phase.
Risk: MEDIUM (first plan that changes the production runtime path).

## 08-16
Summary: one deliberate additive probe commit (D-13): `probe.sim`, `worldHash`, `advanceTicks`; browser/Vitest parity.
Strengths: `sim` required on `createTestHook`; `probe.sim` deleted on failure surface and dispose; `tests/helpers/tick-script.ts` limited to DOM-free modules, the same pattern `tests/helpers/lave.ts` already uses from the Playwright runner. Probe-shape snapshot and optional-key audit table updated in the same commit, so D-13 holds.
Concerns: LOW - parity depends on `runTickScript` mirroring the session's New-game setup (profile, market seed, dock geometry). The plan lists each mirrored value with its source line; any later change to New-game defaults will break parity, but it will do so loudly (hash mismatch), which is the desired behaviour.
Risk: LOW.

## Cross-plan items (new)

C1 (MEDIUM): No plan runs the Firefox suite (`docker compose run --rm e2e-cross`). AGENTS.md puts it outside `verify`, but 08-12 rewrites the frame loop and 08-14 adds a manual-clock mode that bypasses it, and the Firefox core-loop journey is the only second-engine check. Suggest one run at the step-9 gate (08-12) and one after 08-15, recorded in the SUMMARY; do not make it a blocking gate if Firefox is known flaky.

C2 (LOW): Coverage floors (`vitest.config.ts:35-41`, src/sim lines 93 / branches 86) are global to `src/sim/**`. 16 plans add a lot of defensive parsing code under `src/sim`; only 08-07 mentions floors. Suggest 08-13 and 08-15 each confirm `docker compose run --rm test` (with coverage) passes, which the verify gate already does, so this is a reminder rather than a gap.

C3 (LOW): CHANGELOG/NOTICE/ASSETS: every plan states "no entry", consistent with AGENTS.md (internal only, no new assets, no dependency change; `fast-check` 4.10.2 is already a devDependency per `package.json:37`). The only test-hook surface change (`probe.sim`, `advanceTicks`) is behind `?test=1`, so omitting it is defensible.

C4 (LOW): Several plans cite `game-session.ts` line numbers. They are accurate today (verified one) but each extraction commit invalidates the rest. Executors should locate by pattern.

C5 (INFO): Docker workflow is respected throughout: all commands use `docker compose run --rm ...`, scratch files in `/tmp`, no host installs, no new ports, no new packages.

## Overall verdict

READY. All five Round 3 consensus items are genuinely resolved in the plan text, and the ones I could check against source (SaveInputs keys, `MAX_SAVE_POSITION_MAGNITUDE`, `hashFlight` return type, `createTestHook` call site, `pending.length = 0` anchor, window listeners) match. Remaining items are advisory: run `e2e-cross` once around 08-12/08-15, tolerate benchmark noise in 08-15, and locate session code by pattern rather than line number.
