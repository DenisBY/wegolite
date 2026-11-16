# Round 5 review: reviewer-context-sonnet (broad context and blast radius)

Commit under review: `afc4fe0`. Lens: what existing code, tests, e2e specs, docs, CHANGELOG/NOTICE and Docker gates the 16 plans touch or break; requirement and roadmap coverage; scope creep; executor ergonomics.

## Coverage statement (read this first)

The 16 plans total about 1.05 MB of text (`08-05` and `08-11` alone are 73-75 KB). I did **not** read every line of every plan. What I did read:

- The frontmatter (`files_modified`, `depends_on`, `wave`, `requirements`, `estimate`, `must_haves.artifacts`, `key_links`) and objective of all 16 plans.
- Every Round 4 disposition row (`| R4-nn |`) in all 16 plans, each followed up with an `rg -n` into the current plan text for the claimed edit.
- The full `<action>`, acceptance and verify text of `08-15` (all three tasks) and `08-16` (both tasks), and `08-12` Task 1 steps 2 to 6 and Task 2, plus `08-01` Task 1 step 6.
- `08-VALIDATION.md` (first 60 lines), the ROADMAP Phase 8 section (goal, success criteria, wave list) and PROJECT.md lines 1-80.

Plans `08-02`, `08-04`, `08-05`, `08-06`, `08-07`, `08-08`, `08-09`, `08-10`, `08-11`, `08-13` and `08-14` were read at frontmatter, objective and Round 4 row level only; their verdicts below rest on those rows, on source checks of their cited claims, and on the cross-plan checks listed. Treat their "Strengths" as source-verified claims, not a line-by-line audit.

## Round 4 consensus items (1-14) against the current plan text

| # | Item | Status | Evidence (current plan text) |
|---|------|--------|------------------------------|
| 1 | NaN in `ai.params` cannot be "rejected after JSON"; generator lacks null/boolean | **Resolved** | `08-13-PLAN.md:25` (`non-finite` is a third `SnapshotError` reason thrown by `snapshotWorld` before serialization), `:35`, `:154`; domain half at `08-05-PLAN.md:351` (R4-05: `ParamValue` null/boolean legal scalars, no non-finite anywhere); `08-13-PLAN.md:290` (R4-01) lists all three parts. |
| 2 | `rg "world/store\|\.store\b" src/app` can never print nothing | **Resolved** | Gate narrowed at `08-16-PLAN.md:146` to `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. I ran it against current `src/app`: no match, exit 1 (baseline holds). The `SaveStore` interface (`src/persistence/store.ts:34-45`) has only `read/write/clear/backupCorrupt/dispose`, so `saveBoot.store.*` (`src/app/game-session.ts:1167,1341,1490,3345`) can never match `.store.(live\|get\|...)`. `08-08-PLAN.md:262` records the no-change disposition. |
| 3 | `advanceTicks` must be an always-present function | **Resolved** | `08-16-PLAN.md:128` (`WegoliteSimTestHook.advanceTicks` required; refuses by returning the current tick, never `undefined`), `:146` (fixture check: `advanceTicks === "function"` in both `testHookDocked` and the new `testHookManualDocked`), `08-01-PLAN.md:138` (standing contract recorded in the spec header), `08-14-PLAN.md:274`. Source check: `createTestHook` has exactly one call site (`src/app/game-session.ts:1035`) and is referenced nowhere in `tests/`, so the new required 5th parameter breaks nothing else. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md` frontmatter lists `src/sim/world/limits.ts` (single definition site); `08-11-PLAN.md:202` and `08-13-PLAN.md:129` gate `from "./limits.js"` and forbid `^export const` in `sanitize.ts`/`snapshot.ts`. |
| 5 | Enum fields unchecked at spawn / not repaired / `registry[aiKey]` | **Resolved** | `08-05-PLAN.md:348` (spawn `includes` over closed vocabularies); `08-11-PLAN.md:35` and `:355` (`Object.hasOwn` own-key lookup via `aiModuleFor`, sanitize rule 9); `08-13-PLAN.md:295` (property mutates all four leaves with `"constructor"`, `"__proto__"`). |
| 6 | Non-unit quaternions pass spawn/sanitize but fail the parser | **Resolved** | `08-05-PLAN.md:349` (spawn refuses `abs(normSq-1) > QUAT_UNIT_TOLERANCE`, `MIN_QUAT_NORM_SQ` defined), `08-11-PLAN.md:178` and `:356` (degenerate-norm rule plus re-check), `08-13-PLAN.md:292` (`{w:1e-160}`, `{w:3e-161}` rows). |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `08-05-PLAN.md:350` (`createWorld` throws `RangeError` outside `0..MAX_UINT32`), `08-13-PLAN.md:293` (parser integer in `0..MAX_UINT32`, rows 1.5, -1, 2**32, null). |
| 8 | `createEventRouter` signature contradicts itself | **Resolved** | `08-10-PLAN.md:40` and `:277` (`createEventRouter(ctx, subscribers)`, ctx required), `08-15-PLAN.md:133` and `:332`. No `createEventRouter(subscribers)` form remains in either plan. |
| 9 | Lint guard gaps | **Resolved** | `08-03-PLAN.md:27,152,170,300-301` (`no-eval`, `no-new-func`, `Intl`, `localeCompare`, computed `sort["call"]`); `08-09-PLAN.md:303-308` (`importNames` ban on `createSeededRandom`, `AI_MODULE_STATE_BANS`, inherited bans re-proved inside the zone); `08-02-PLAN.md:315` (text scan covers aliases). Existing `src/sim` has no violators of the new bans (I searched `src/sim` for `.sort(`, `for..in`, `localeCompare`, `Intl`, `Date`, `performance.now`, `setTimeout`: only a comparator sort at `src/sim/economy/market.ts:169`, which passes). |
| 10 | Restore check is a rounded-hash comparison | **Resolved** | `08-13-PLAN.md:22`, `:116`, `:294` (exact `JSON.stringify(snapshotWorld(...))` equality at every checkpoint plus `toStrictEqual` on players). |
| 11 | AI drain limits passes, not deliveries | **Resolved** | `08-11-PLAN.md:43` (`MAX_AI_EVENTS_PER_DRAIN = 4096`), `:171`, `:358` (`MAX_AI_QUEUE_LENGTH`, `postAiEvent` validates `a`, `b`, `n`). |
| 12 | `ShipControl` accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:154` ("control domain" row: 1e13 ignored) and `:268` (checked against `limits.ts`; ignored, not clamped). |
| 13 | No Firefox run | **Resolved** | `08-12-PLAN.md:123,137` (non-blocking `e2e-cross` on the step-9 worktree), `08-15-PLAN.md:216,232` (repeated after verify-full). Source check: `compose.yaml:66-77` `e2e-cross` builds then runs `npm run test:e2e:cross`; `playwright.config.ts` Firefox project matches only `engine` and `core-loop` specs, so the run costs little and is correctly kept out of the gates (`tests/contract/container-contract.test.ts:273-293` pins that). |
| 14 | Deliberate deviations, best-of-N benchmark, stale anchors | **Resolved** | `08-08-PLAN.md:260-261`, `08-12-PLAN.md:118,266-267` (SUMMARY section "Deliberate deviations from a verbatim move"), `08-15-PLAN.md:214` (best of 3 attempts, unchanged threshold), "locate by name or pattern" in the executor briefs of `08-04`, `08-06`, `08-08`, `08-10`, `08-12`. Anchors checked and accurate at HEAD: `pending.length = 0;` x4 at `game-session.ts:2738,2749,2773,2859`; `redrawGate.request();` x5; `generateMarket(` x3; `swapSystem` at `:3284`; the two `window.addEventListener` sites at `:2268,2289`. |

All 14 are closed in the plan text. I found no regression of a Round 3 item.

## 08-01

**Summary.** Test-only safety nets (probe-shape spec, fixture, comparator, `sessionSource()` helper, re-pointed scans, `test:e2e:fast` gets the new spec, D-01 baseline on a detached worktree). No `src/` change.

**Strengths.**
- The blast radius on text-reading tests is exactly as claimed: only `tests/guards/economy-purity.test.ts:312,322` and `tests/app/redraw-gate.test.ts:113` read `game-session.ts`; `tests/e2e/budget.spec.ts:15` and `tests/e2e/hyperspace-failure.spec.ts:43` only mention it in comments. Both real readers are re-pointed here.
- The `test:e2e:fast` edit is paired with its pin: `tests/contract/container-contract.test.ts:336-343` pins the exact script string and spec count 3, and the plan names that file in `files_modified`. The new spec name `probe-shape.spec.ts` matches that test's regex `tests/e2e/[a-z-]+\.spec\.ts`.
- Baseline-worktree route (`-p wegolite-baseline`, no `--build`) is sound against `compose.yaml:1-30`: `name: wegolite` is overridden by `-p`, the named `node_modules` volume becomes project-scoped, and the `image: wegolite-ci` tag is reused. `5b189e4` is a docs-only commit; `git diff --stat 5b189e4 HEAD -- src tests package.json compose.yaml eslint.config.js` is empty, so the baseline is the current code.

**Concerns.**
- LOW: ROADMAP.md (Phase 8 "Todos" line) still says the Shift+C docking flake "is settled before the split starts", while CONTEXT `D-01` (`08-CONTEXT.md:26,128`) says the owner chose to ignore it and the todo stays untouched (`todos/pending/2026-11-11-check-ci-after-0-2-0-and-the-shift-c-docking-timeout.md` still carries `resolves_phase: 8`). `08-01` follows D-01 correctly (one rerun, recorded), but nothing reconciles the ROADMAP wording or the todo's `resolves_phase`. A later `/gsd-verify-work` could flag the todo as unresolved for Phase 8.
- LOW (unverified): the objective says "25 browser specs read `window.__wegolite`"; `rg -l "__wegolite|getProbe" tests/e2e/*.spec.ts` finds 24 of 25 spec files. Probably a counting nuance; not load-bearing.

**Suggestions.** Add one sentence to the `08-01` SUMMARY requirements (or edit the ROADMAP todo line) saying the Shift+C todo is deliberately carried past Phase 8 under D-01.

**Risk:** LOW.

## 08-02

**Summary.** Pins pre-phase flight hashes and RNG vectors, makes `createSeededRandom` delegate to `rngNext`, adds `mix32`/`worldSeedFor`/`forkSeed`, scan test banning closure-held streams.

**Strengths.**
- Golden policy respected: `tests/golden/world/` is a new directory; no existing golden is regenerated (`08-02-PLAN.md:90`). `.prettierignore` does not cover `tests/golden/world`, and the plan runs `npx prettier --write tests/golden/world` (`:132`), so `npm run lint` (`prettier --check .`) stays green.
- Edits `src/sim/math.ts` only through delegation with an identical sequence, pinned by the new goldens taken against the unmodified file.

**Concerns.** None new. (Frontmatter: `autonomous: false`, three tasks, estimate 115k accepted by the owner.)

**Suggestions.** None.

**Risk:** LOW.

## 08-03

**Summary.** Determinism lint bans in `src/sim`, shared probe helper `withSimProbe`, entity-id scope guard.

**Strengths.**
- Existing helpers the plan builds on exist: `tests/guards/eslint-gate.ts`, `tests/guards/probe-lock.ts`, and `__purity_` is the prefix `tests/compliance.test.ts` already skips.
- The new bans do not break current code (see item 9 above), and `Date`/wall-clock bans already existed at `eslint.config.js:137-149`, so the new work is additive.

**Concerns.**
- **MEDIUM: transient probe directories race with `tests/compliance.test.ts`, which no plan edits.** `withSimProbe` creates and then removes "every missing directory on the way" (`08-03-PLAN.md:112`), and `08-09-PLAN.md:196,235` adds nested probes at `src/sim/ai/nested/` and `src/sim/ai/pilots/roles/`. The `__purity_` prefix protects only *files*. `tests/compliance.test.ts:66-77` (`collectSourceFiles`) walks the whole repo with an unguarded `readdirSync` recursion: it skips only `.planning`, `node_modules`, etc., and has no `try/catch`. If a parallel Vitest worker removes `src/sim/ai/nested/` between the compliance walk's `readdirSync(parent)` and its `readdirSync(nested)`, the compliance test throws `ENOENT`. `withProbeLock` (`tests/guards/probe-lock.ts`) serialises only guard tests that call it, and Vitest runs files in parallel (`vitest.config.ts` sets no `fileParallelism`). The plan fixes the same hazard for `sim-purity.test.ts` `listTsFiles` (`:114`) and `entity-id-scope` (`:195`) but not for compliance. The `.probe-lock` directory at the repo root already carries the same latent race today, so this widens an existing flake class rather than creating one; with dozens of probes it becomes visible in `docker compose run --rm test`, the very command that is the source of truth.
- LOW: the sub-task count is three tasks and about 90k tokens, within budget, but `eslint.config.js` is later edited again by `08-09`; both plans say so explicitly, so this is only an executor note.

**Suggestions.** Either add `tests/compliance.test.ts` to `08-03` `files_modified` and make `collectSourceFiles` tolerate `ENOENT` (and skip `__purity_*` directories), or have `withSimProbe` take the same lock around nothing but create probe files into directories that already exist (pre-create `src/sim/ai/nested`-style fixtures permanently, or use a single flat probe directory).

**Risk:** LOW-MEDIUM (one flake source, easy edit).

## 08-04

**Summary.** Split steps 1-2: typed `SessionState` context and the probe publisher out of `game-session.ts`; first use of `createSessionState`.

**Strengths.**
- Source anchors verified (see Round 4 item 14). Coverage thresholds are checked: `vitest.config.ts:19-61` covers only `src/sim`, `src/persistence`, `src/content`, so new `src/app/session/**` files cannot fail a threshold; `08-04-PLAN.md:237` already records that check (R2-01).
- Prohibition block (`08-04-PLAN.md` frontmatter) forbids editing `probe.ts`, the fixture, the two re-pointed tests or any golden to make a step pass.

**Concerns.** None new. Estimate 185k tokens against a 100k smart zone is an accepted risk (owner, 2026-11-12), noted below under scope.

**Suggestions.** None.

**Risk:** LOW-MEDIUM (3k-line mechanical rewrite; the guard set is strong).

## 08-05

**Summary.** World foundation: `ids.ts`, `limits.ts`, `ai/types.ts`, entity, store, world, serialize/hash; PROJECT.md decision rows.

**Strengths.**
- Round 4 items 4-7 are all landed here (see table). `liveEntityCount` is exported as a primitive count so `src/app` never needs the store (feeds `08-16`).
- Existing `src/sim/world/` already holds `layout.ts` and `aegis.ts`; the new files do not collide with them, and `src/sim/flight/sanitize.ts` has a different name from the planned `src/sim/world/sanitize.ts`.

**Concerns.** None new; the 75 KB plan is the largest in the set (executor ergonomics note below).

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

## 08-06

**Summary.** Split steps 3-4: render driver, chart controller, settings controller; `verify-full` gate on a worktree.

**Strengths.**
- Keeps the single pinned `renderFrame(alpha, shouldDraw())` call and redraw-gate literals; R4-02/R4-03 dispositions explain why no Firefox run is added at this step (rAF and window listeners do not move until step 9).

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

## 08-07

**Summary.** `WorldView`/`ShipControl` types and implementations, control-domain checks against `limits.ts`.

**Strengths.** Pure `src/sim`, no new dependency; ignore-not-clamp semantics are stated and tested (`08-07-PLAN.md:154,268`).

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW.

## 08-08

**Summary.** Split steps 5-6: station and save controllers, `verify-full` gate.

**Strengths.** Moves `saveBoot.store` verbatim, which the narrowed `08-16` gate now tolerates; deliberate `disposed` guards are recorded as deviations (`:260`).

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

## 08-09

**Summary.** AI types, integer-tick time, registry, scripted test pilot, AI lint zone with `importNames` and module-state bans.

**Strengths.** Probe basenames use `__purity_` (`08-09-PLAN.md:196`) and re-prove inherited bans inside the zone.

**Concerns.** MEDIUM (shared with `08-03`): the nested probe directories named at `:196,235` are the ones that can race `tests/compliance.test.ts` (see `08-03`). Resolve in `08-03`; nothing else to change here.

**Suggestions.** None beyond the `08-03` fix.

**Risk:** LOW-MEDIUM.

## 08-10

**Summary.** Split steps 7-8: hyperspace controller, event router, sim driver, step options.

**Strengths.** One `createEventRouter(ctx, subscribers)` signature (`:40,:277`); declared no-edge same-wave ordering with `08-11` is argued in the plan and in `08-VALIDATION.md`.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

## 08-11

**Summary.** `stepWorld`, `stepSim`, `sanitizeEntity`, reserved `SimEvent` kinds, AI event drain with delivery and queue caps.

**Strengths.**
- `src/sim/sim.ts` does not exist today (verified), so `stepSim` is a new symbol and no existing caller or test needs a signature change; the "v1 goldens untouched" claim is not endangered by it.
- Widening `SimEvent` in `src/sim/events.ts` is safe against current consumers: only `src/sim/{flight,dock}/*`, `src/app/game-session.ts` and three tests reference it, and the router keys on `RoutedKind` (`08-10`), so no exhaustive switch breaks.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

## 08-12

**Summary.** Split step 9: frame loop, `start-session.ts`, thin facade; step-9 `verify-full` plus non-blocking Firefox run.

**Strengths.**
- `window.addEventListener` sites and the unguarded `swapSystem` (`game-session.ts:3284-3294`) match the plan's description exactly, so "deliberate deviation" bookkeeping is accurate.
- Worktree gate cleanup is spelled out (worktree, volumes, containers).

**Concerns.**
- LOW: the acceptance check "`rg -c "addEventListener\("` equals `rg -c "uiController\.signal"` at the listener sites" compares per-file counts across several files; today both are 2 in one file (`game-session.ts:2268,2270,2289,2291`), but `uiController.signal` is also passed to other modules after the split, so a naive equality can fail or pass by accident. State it as "every `addEventListener(` call site has `signal: ...uiController.signal` in the same call" and check call by call.

**Suggestions.** Reword that acceptance line as above.

**Risk:** LOW-MEDIUM.

## 08-13

**Summary.** Snapshot codec with `non-finite` refusal, exact 1,000-tick live-vs-restored equality, cross-cadence world hash.

**Strengths.** Closes Round 4 items 1, 4, 5, 6, 7, 10 in text (see table). Uses the existing `fast-check` devDependency (`package.json`), so no CHANGELOG, NOTICE or `ASSETS.md` entry is needed.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

## 08-14

**Summary.** `parseTestFlags`, manual-clock frame branch, `advanceTicks` in the driver, no probe change.

**Strengths.** Driver-level refusal is the single owner of the refusal rule that `08-16` inherits; ten-file scope note is explicit.

**Concerns.** None new. (CHANGELOG: query flags behind `?test=1`, no player-visible change; the stated "no entry" matches the AGENTS.md rule.)

**Suggestions.** None.

**Risk:** LOW.

## 08-15

**Summary.** The one integration plan: lifecycle module, epoch bump points, `stepSim` in the driver, anchored-save proof, step-cost check, `verify-full`, Firefox run.

**Strengths.**
- Anchored-save test uses an exact key allow-list rather than a vacuous substring check, and the plan states the six forbidden keys were checked absent in `src/persistence` at planning time.
- The hot-path benchmark lives in `/tmp/wegolite-perf` and is mounted with `-v` (AGENTS.md scratch rule), best of 3, threshold unchanged (Round 4 item 14).
- Durable purity guard for the two Node-importable session files lives in a Vitest file, so it runs in every `docker compose run --rm test`.

**Concerns.**
- LOW: the benchmark verdict is recorded only in the SUMMARY; `docs/PERFORMANCE.md` (exists) is the project's frame-budget document, and QUAL-01 is still open. A one-line pointer there would keep Phase 23's budget work from rediscovering the numbers. Optional.

**Suggestions.** Optional pointer in `docs/PERFORMANCE.md`; otherwise no change.

**Risk:** MEDIUM (it changes the runtime path of every flight, but it is the most heavily gated plan: lifecycle unit tests, `verify-full`, Firefox, benchmark, hash identity).

## 08-16

**Summary.** The one deliberate probe commit: `probe.sim`, `worldHash`, `advanceTicks`, fixture update, tick-hook spec, browser/Node parity.

**Strengths.**
- Round 4 items 2 and 3 both land here with source-consistent regex and a defined refusal contract (`:128,:146`). Five tests are enumerated in `tick-hook.spec.ts` and the verify line demands at least five passes (`Task 2 <verify>`), consistent.
- Precedent for a Playwright spec importing pure `src` modules with `.js` specifiers exists (`tests/e2e/helpers/chart.ts:16-17`, `tests/e2e/hud.spec.ts:16`, `tests/e2e/throttle.spec.ts:19`), and A7 has a fixture fallback.
- The new JSON fixtures live under `tests/fixtures`, formatted by Prettier in the plan; `tests/compliance.test.ts` only walks `.ts/.js/.sh`, so JSON needs no SPDX header.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

## New findings (summary, severity ordered)

1. **MEDIUM (`08-03-PLAN.md:112`, `08-09-PLAN.md:196,235`; `tests/compliance.test.ts:66-77`)**: transient probe *directories* under `src/sim` race the unguarded repo walk in `tests/compliance.test.ts`; `__purity_` protects files only and compliance is in no plan's `files_modified`. Fix by making `collectSourceFiles` ENOENT-tolerant and `__purity_`-directory-aware, or by not creating transient directories.
2. **LOW (`08-01`, ROADMAP Phase 8 Todos line, `todos/pending/...shift-c...`)**: ROADMAP says the Shift+C flake is "settled before the split"; CONTEXT D-01 says ignore it and the todo (`resolves_phase: 8`) stays open. Reconcile the wording.
3. **LOW (`08-12-PLAN.md` Task 1 acceptance)**: per-file `rg -c` equality between `addEventListener(` and `uiController.signal` counts is fragile after the split; check per call site instead.
4. **LOW (`08-15` Task 3 step 5)**: optional pointer from the benchmark result into `docs/PERFORMANCE.md`.

## Blast radius, requirements and ergonomics (cross-cutting)

- **Existing tests and specs.** Only two Vitest files read `game-session.ts` as text, both re-pointed in `08-01`. No test imports `createTestHook`. `tests/app/*.test.ts` import individual modules, not session internals, so the public facade staying unchanged (`08-12`) protects them. The 25 e2e specs read the probe, which is frozen by `08-01` until the single additive commit in `08-16`.
- **Docker gates.** `verify` (`compose.yaml:92-109`) and `verify-full` are untouched; `container-contract.test.ts` pins both chains and the Firefox exclusion, and `08-01` updates the one script pin it must. Using `-p wegolite-gate-<id>` worktrees works with `compose.yaml` (`name: wegolite` overridden, tagged `wegolite-ci` image reused, no published ports on test services). New scratch scripts (`/tmp/wegolite-perf`, `/tmp/wegolite-baseline`) respect the AGENTS.md rule that nothing scratch enters the repository.
- **Coverage thresholds.** Only `src/sim`, `src/persistence`, `src/content` are gated (`vitest.config.ts:19-61`, `src/sim/**` floors lines 93, branches 86). `08-05`, `08-07`, `08-09`, `08-11`, `08-13` all list a coverage-failure line in their verify; the large defensive-branch surface in `sanitize.ts`/`snapshot.ts` is covered by the table-driven rows. No plan touches the thresholds, correctly.
- **CHANGELOG / NOTICE / ASSETS.** No user-visible change and no new asset or dependency (`fast-check` already a devDependency); each plan states "no entry", consistent with AGENTS.md. Documentation language is English throughout the sampled plans.
- **Requirements and roadmap.** FOUND-10..14 each map to at least one plan (`08-01`/`04`/`06`/`08`/`10`/`12`/`16` for -10; `05`/`11`/`13`/`15` for -11; `02`/`03`/`05`/`11`/`13` for -12; `07`/`09`/`11` for -13; `14`/`15`/`16` for -14). The ROADMAP wave list and each plan's `wave:`/`depends_on:` agree (checked wave by wave). Success criterion 1's "one deliberate probe commit" is reconciled in `08-16` Task 2 step 4 and in PROJECT.md. No same-wave `files_modified` overlap: waves 4, 5 and 6 pair a session plan with a sim plan; `PROJECT.md` is edited by `08-02`, `08-05`, `08-11`, `08-15`, `08-16`, always in different waves.
- **Scope creep.** Every addition this round (limits module, drain caps, enum validation, module-state lint, restore-domain checks) is tied to a Round 4 finding and to a success criterion, but the plan set grew by 769 insertions this round and ten of 16 plans exceed the 100k smart-zone estimate (`08-04` 185k, `08-10` 185k, `08-08` 175k, `08-12` 165k, `08-06` 160k, `08-11` 155k, `08-15` 155k, `08-13` 150k, `08-09` 135k, `08-05` 130k), accepted by the owner on 2026-11-12. Much of the defensive validation (AI queue caps, sanitizer, snapshot parser limits) has no consumer until Phases 12 to 14; it is justified by FOUND-12/13 and the Phase 11 save work, but further hardening rounds should stop adding scope and be treated as executor-time concerns.
- **Executor ergonomics.** Single bullets in `<action>` run to several thousand characters and are saturated with review back-references (`Round 2 review 820a435 L...`), which hides the instruction in the citation. This is workable (the Round 4 table rows and "locate by name or pattern" briefs help) but an executor should be told to treat the back-references as provenance, not requirements. The 75 KB plans (`08-05`, `08-11`) are the highest risk of context overrun; the estimate already acknowledges it.

## Overall Risk Assessment

**LOW-MEDIUM.** All 14 Round 4 consensus items are closed in the current plan text, verified by `path:line` and, where a gate is a regex, by running it against source. No wave-ordering, same-wave ownership, import-cycle or purity problem found. The only new item that could change a green `docker compose run --rm test` is the compliance directory race (MEDIUM, one-file fix); the rest are LOW wording or ergonomics.

## Verdict

**READY**, with one recommended targeted edit before execution of Wave 1: make `tests/compliance.test.ts` tolerant of transient `src/sim` probe directories (or avoid creating them) in `08-03`. Caveat: I did not read all plan text in full (see the coverage statement), so for `08-02`, `08-04` to `08-11`, `08-13` and `08-14` this verdict rests on frontmatter, Round 4 rows and source cross-checks rather than a line-by-line read.
