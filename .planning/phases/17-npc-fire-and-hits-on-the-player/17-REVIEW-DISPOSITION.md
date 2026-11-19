---
phase: 17
review: 17-REVIEW.md
updated: 2026-11-19
---

# Phase 17 — Code Review Disposition

| Finding | Severity | Disposition | Notes |
|---|---|---|---|
| WR-01 | warning | deferred | `targetTargetsSelf` ignores the player's ident lock; now reachable through live heat for opted-in attackers only (no effect in ordinary play). Todo `2026-11-19-player-ident-lock-in-target-targets-self.md`; owner question at sign-off. |
| WR-02 | warning | deferred | Browser spec proves criterion 3's HUD readout through the probe, not drawn gauges (the HUD has no shield/energy element). Already owner question 6 in 17-10-SUMMARY.md. |
| IN-01 | info | fixed | Stale comments in `src/sim/npc/fire.ts`, `src/sim/ai/test-spawn.ts`, `tests/e2e/combat.spec.ts`. |
| IN-02 | info | accepted | `npcFireGate` relies on the caller's `isMountKey` check; the drain is the only caller. |
| IN-03 | info | accepted | NPC energy float64 vs Oolite GLfloat; recorded here, revisit if an energy-boundary divergence appears. |
| IN-04 | info | deferred | D-07 period: owner question 1. |
| IN-05 | info | accepted | Guard blind spots; the guards are documented tripwires, not proofs. |
| IN-06 | info | accepted | Duplicate setup in `spawnAttacker`/`spawnShooter`; test-hook code, left as is. |

## Fable review (Oolite fidelity and determinism, deep)

| Finding | Severity | Disposition | Notes |
|---|---|---|---|
| Fable WR-01 | warning | fixed | The range roll's `randf() * weaponRange` product is now rounded to float32 (`Math.fround`) before the double `accuracy + 7.5` factor, as in Oolite (`ShipEntity.m:9949`) and in the independent oracle. New gate fixture `gate-roll-product-is-float32-before-the-accuracy-factor` (non-dyadic draw 1234567891 / 2^32, limit 8982.66357421875 in float32 against 8982.663646747824 in float64). `fire.ts` header cites the width. Commit `fix(17): evaluate the NPC range roll's draw x range product in float32`. QUAL-11 acceptance identical to the 17-04 baseline. |
| Fable IN-01 | info | accepted | `weapon.laser === NO_LASER` after `fired` is type narrowing only; defended by the gate's `noWeapon` refusal. |
| Fable IN-02 | info | accepted | Unarmed range 32000 in `fire.ts` against 0 in `attack.ts`: both match Oolite (the gate sees the registered NONE object, the behaviours see the nil type). Not a defect. |
| Fable IN-03 | info | accepted | Energy and aim tolerance are float64 under the Phase 14 and 17-01 oracle contracts; the rule is recorded there. |
| Fable IN-04 | info | accepted | The drain takes no draw when no NPC weapon table is passed; only test-tainted sessions and frozen worlds without opt-in are affected, so no durable state moves. |

## Sonnet review (simplicity, maintainability, test quality, deep)

| Finding | Severity | Disposition | Notes |
|---|---|---|---|
| Sonnet WR-01 | warning | fixed | `withoutComments`, `lineOf` and `listSrcFiles` live once in `tests/guards/source-scan.ts`; `kill-credit-consumers`, `ship-hit-consumers` and `fire-decision-source` import them. The older `entity-id-scope` (`withoutComments`, `lineOf`) and `sim-purity` (`withoutComments`) copies were byte-identical and moved too. |
| Sonnet WR-02 | warning | fixed | The kill-credit guard's three regex heuristics are one whole-word `\bkiller\b` scan outside `kill.ts`, `ledger.ts`, `combat/step.ts` and `events.ts`; `src/sim/ai/types.ts` left `KILL_PATH_FILES` (it has no `killer`). The todo pointer and synthetic offending cases stay. |
| Sonnet WR-03 | warning | deferred | The hand-rolled comment stripper treats a regex literal containing a quote as a string. Now one place (`source-scan.ts`, limit noted in its header) instead of five; no src regex triggers it today (the guards would see a changed file count or a stray hit). Fix with `ts.createSourceFile` when a src regex with a stray quote appears. |
| Sonnet WR-04 | warning | fixed | `on-event-handlers` keeps only an "at least one `onEvent` handler" vacuity floor; "a second `onEvent` fails and names the todo" is unchanged and the floor's message cites the todo path. |
| Sonnet WR-05 | warning | deferred | `fire-decision-source` is large for weak rules; trimming it (drop rule 2 and the specifier parser) is a test-only simplification with no behaviour impact. |
| Sonnet WR-06 | warning | fixed | The empty `FIRE_ORACLE_PENDING` / `FireOraclePending` scaffold and its coverage assertions are deleted. |
| Sonnet IN-01 to IN-07 | info | deferred | Hook precondition block, spawn body copy, comment jargon, narrowing note, unused exports, oracle-runner destructure and tautological test assertions: cleanup with no behaviour impact; pick up with the next change in those files. |
