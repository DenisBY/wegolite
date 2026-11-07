---
phase: 06-hyperspace-navigation-persistence
document: gap-closure-ledger
verification: 06-VERIFICATION.md
gap_plans: [06-07, 06-08, 06-09, 06-10, 06-11, 06-12]
gate_command: "docker compose run --rm verify"
gate_status: passed (exit 0)
---

# Phase 6 Gap Closure Ledger

One ledger that reconciles every gap in `06-VERIFICATION.md` (G-1 to G-9), the declared review group G-10, and every same-path review finding to its fixing plan, commit, evidence, or explicit deferral. A re-verifier can reconcile the phase from this file without re-reading the whole review set.

Host runs are not evidence. Every test and build below is a container command; the authoritative gate is `docker compose run --rm verify`.

## Authoritative gate (06-12 Task 3)

<!-- gate-evidence:start -->
Command: `docker compose run --rm verify` (run once, sequentially, on the working tree at commit 7437baf plus this ledger; full log kept in the executor's scratch directory).

Observed result: **exit status 0**.

| Stage | Observed |
| --- | --- |
| Lint (`eslint .` and `prettier --check .`) | exit 0; "All matched files use Prettier code style!" |
| Typecheck (`tsc` for `tsconfig.json` and `tsconfig.sim.json`) | exit 0 |
| Content drift (`assets:check`) | "no differences" |
| Vitest unit and integration suite | 89 of 89 test files passed; 1110 of 1110 tests passed |
| Production build (`vite build`) | built in 1.33 s |
| Playwright browser suite | 74 passed (14.3 min); no failures reported |
<!-- gate-evidence:end -->

## Verification gaps (06-VERIFICATION.md)

| Gap | Truth closed | Requirements | Fixed by | Commits | Evidence (container) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| G-1 arrival/restore teleport | Arrival and in-flight restore hold the saved witchpoint pose through the first docking step | NAV-05, SAVE-03 | 06-07 | 053712c, ace104a, 7df89ef, d79c809 | `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts tests/persistence/autosave.test.ts` (stepped every-route regression; restored pose survives the first dock step); browser reload sample taken after a resumed fixed step in `tests/e2e/hyperspace.spec.ts` | closed |
| G-2 countdown survives docking | A dock ends the jump attempt; a relaunch cannot commit a jump the player did not restart | NAV-04 | 06-08 | ff038a1, 20dad48, e460955, 1a4d9e1 (D-06 amendment), d574617 | `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts tests/sim/dock-computer.test.ts` (begin, dock, step 1800 with no jump; timer at 1 plus computer dock emits docked only) | closed |
| G-3 F2 overwrite dialog | Mouse Cancel restores a working Save; Enter follows the focused control; Y is the direct confirm | SAVE-05 | 06-09 | 6693c7b, 893ff47, e8eb787 | `docker compose run --rm test npx vitest run tests/input/bindings.test.ts`; browser cases in `tests/e2e/save-load.spec.ts` (mouse Cancel then KeyS; Enter while Cancel is focused) | closed |
| G-4 HUD fuel | The flight HUD reports the live tank after a jump | NAV-03 | 06-10 | 707ce58 | `docker compose run --rm test npx vitest run tests/ui/hud-model.test.ts tests/hud/projection.test.ts`; browser HUD fuel assertion in `tests/e2e/hyperspace.spec.ts` | closed |
| G-5 chart arrow selection | Short-range arrows select only a system the window paints | NAV-02 | 06-10 | c49d86e | `docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts tests/ui/chart-draw.test.ts` (one-step arrow stays visible or forced; selected off-window marker is painted and labelled) | closed |
| G-6 same-frame H pair | Two H edges in one frame start then abort; they never leave a countdown | NAV-04 | 06-11 | e3e2f48 | `docker compose run --rm test npx vitest run tests/app/hyperspace-commands.test.ts` (two-edge drain maps to cancel) | closed |
| G-7 unguarded arrival build | A failed destination build publishes a visible failure and never leaves a half-swapped session | NAV-05 | 06-11 | 2d48e54 | Guard and failure surface in `src/app/game-session.ts`; success path browser-proven in `tests/e2e/hyperspace.spec.ts`. The throw path has no browser negative control (see Deferrals, WR-04) | closed with explicit deferral |
| G-8 in-session Load UI reset | An in-session Load clears the replaced session's message queue and dock feedback; the test hook follows the restored state | SAVE-03, SAVE-05 | 06-11 | 4277605 | `docker compose run --rm test npx vitest run tests/hud/format.test.ts`; in-flight in-session Load case in `tests/e2e/save-load.spec.ts` (pre-load message gone, queue reset, hook rebound) | closed |
| G-9 chart orientation | The chart's vertical orientation is a recorded deliberate divergence from Oolite | NAV-01 | 06-12 decision rows (7437baf); 06-10 source comment (c49d86e) | 7437baf, c49d86e | PROJECT.md Key Decisions rows "Keep the galactic chart north-up" and "Omit Oolite's ship-mass-blockage jump check in empty v1 space"; `src/ui/chart-model.ts` orientation comment cites `GuiDisplayGen.m` | reopened by owner direction 2026-11-07 and reversed by plan 06-17; the projection and arrow selection now follow Oolite |
| G-10 writer-gate and stale-surface review group | Writer enforces the reader allow-lists; stale comments and dead public surface are corrected | SAVE-01, SAVE-04 | 06-12 Task 1 | 552f3c3 | `docker compose run --rm test npx vitest run tests/persistence/save-v2.test.ts tests/persistence/autosave.test.ts` (writer-gate block: system, station and market-good rejections match the reader's verdict; pre-launch anchor case) | closed |

G-10 has no separate 06-VERIFICATION truth. It is the declared review-finding group in 06-12's `gap_ids`, recorded so every declared gap id maps to a concrete finding and fix.

## Same-path review findings fixed in this gap closure

| Finding | Source | Fixed by | Commit | Evidence |
| --- | --- | --- | --- | --- |
| Writer gate skips the system/station allow-list checks (T-06-36) | 06-REVIEWS | 06-12 | 552f3c3 | writer-gate block in `tests/persistence/save-v2.test.ts` |
| IN-03 stale post-launch clock wording in the autosave contract | 06-REVIEW IN-03 | 06-12 | 552f3c3 | `tests/persistence/autosave.test.ts` header and the pre-launch anchor case (D-17) |
| IN-04 `MAX_SAVE_CARGO_ENTRIES` comment says 17 commodities | 06-REVIEW IN-04 | 06-12 | 552f3c3 | `src/persistence/save.ts` (17 is the schema ceiling; allow-list caps at the 16 tradeables) |
| IN-05 dead public surface (`SaveLoadScreen.isOpen`, `ChartOverlay.paintCount`, `MAX_VERSION_SNIFF_CHARS` export) | 06-REVIEW IN-05 | 06-12 | 552f3c3 | removed in `src/ui/save-load.ts`, `src/ui/chart.ts`; constant made module-private in `src/persistence/save.ts`. `data-paints` is kept for the browser proof |
| IN-07 `RESERVED_F_KEYS` comments say "four" while six keys are reserved | 06-REVIEW IN-07 | 06-12 | 552f3c3 | `src/input/keyboard.ts` now names F2, F3, F5, F6, F7, F8 |
| IN-02 global `#status` overlay says "new game: Lave" after Continue or a jump | 06-REVIEW IN-02 | 06-11 | 2d48e54 | the fixed boot string is removed; the session owns `#status` |
| Post-await `saveScreenOpen` re-check and test-hook rebind on in-session Load | 06-REVIEWS | 06-11 | 4277605 | `tests/e2e/save-load.spec.ts` in-flight in-session Load case |
| Arrival target retained in the snapshot | 06-REVIEWS (recorded v2 contract) | 06-11 | 2d48e54 | committed `hyperspaceTargetId` survives the arrival, matching PROJECT.md v2 and Oolite `target_system_id` |
| D-06 amendment: a dock cancels a live countdown | 06-VERIFICATION G-2 | 06-08 | 1a4d9e1 | PROJECT.md Key Decisions row "Cancel an active hyperspace countdown when the ship docks" |
| Chart orientation and mass-blockage decisions | 06-REVIEWS; 06-VERIFICATION G-9 | 06-12 | 7437baf | PROJECT.md Key Decisions rows (G-9) |

## Deferrals

Each deferral has a rationale. None is one of the nine failed truths in 06-VERIFICATION.md.

| Finding | Disposition | Rationale | Owner |
| --- | --- | --- | --- |
| WR-04 browser negative control for the destination build throw | Deferred: the catch is typechecked and the success path is browser-proven; the throw path has no browser negative control | `GameSession` has no injection seam for `enterSystemById`, so a browser test cannot force a build throw without adding a test-only seam. The throw handling itself is fixed in G-7 | Phase 7 test-seam work |
| IN-01 `?test=1` taint latch survives an in-session Load | Deferred by decision (intentional) | The latch is test-only reachability; it disables autosave only in the test session that loaded through the hook | Kept as designed |
| WR-05 `onProfileChanged` has no producer | Deferred: dead wiring | Durability comes from the explicit trade, fit and docked autosaves, so there is no missing write; the dead hook is removed in a cleanup pass | Phase 7 cleanup |
| WR-06 `destination === undefined` impossible-state guard | Accepted | It is an impossible-state guard with low risk; it is kept as defensive code, not a reachable path | Accepted |
| IN-06 chart and Save/Load overlays are not modal to focus or assistive tech | Deferred | Making the overlays modal to focus and assistive tech is a broader accessibility change than this gap closure carries | Phase 7 accessibility |
| UI review visual debt (chart footer, contrast, typography) | Deferred | Visual changes need design review beyond the gap closure | Phase 7 hardening |

Requirement assumptions left open by 06-12's plan are not reclassified here: the plan flagged WORLD-06, the NAV-06 boundary and precision items, and SAVE-01, SAVE-02, SAVE-04 and SAVE-06 as unclassified. The full gate re-runs the existing fixtures and round-trip tests that prove them; no requirement was changed by this closure.

## Re-verification starting point

Start from `06-VERIFICATION.md` (status `gaps_found`, 40/49 at its verification). Re-check the three blocker reproductions against the live pose or the live dialog, not the static trace:

1. G-1 (NAV-05, SAVE-03): reload after an arrival or an in-flight save. Advance at least one fixed step and compare the live pose with the saved pose within the float clock-rounding grid. The sampling happens after the resumed step (`tests/e2e/hyperspace.spec.ts`, commit 7df89ef).
2. G-2 (NAV-04): start a countdown, dock with the computer or by manual capture, step 1800 ticks, then relaunch. No `hyperspaceJumped` event may fire.
3. G-3 (SAVE-05): F2 overwrite dialog, driven with the mouse. Cancel then KeyS must open the dialog again, and Enter while Cancel has focus must not write (`tests/e2e/save-load.spec.ts`, commit e8eb787).

Follow-up for the verifier: `06-REVIEW-DISPOSITION.md` still lists every finding as `open`. It is outside this gap closure's file set, so this ledger is the closure record until the disposition file is updated.
