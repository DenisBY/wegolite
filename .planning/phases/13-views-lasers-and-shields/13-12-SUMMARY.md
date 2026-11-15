---
phase: 13-views-lasers-and-shields
plan: 12
subsystem: app/hud
tags: [hud, shields, energy, laser-temperature, cabin-temperature, messages, ident, throttle, d-03-pending]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-11 PlayerCombatState on ctx.core.combat and the gauge functions (shieldGauge, energyBanks, laserTempGauge, cabinTempGauge); 13-15 ident events (identEngaged, identLocked { specKey }, identLost, identOff) and the pending D-03 record; laserRefused from the combat step"
provides:
  - "HudBars.shieldFwd, shieldAft, energyBanks, laserTemp, cabinTemp drawn into the existing FWD, AFT, E1..E4, LT and CT gauges"
  - "buildHudModel trailing options object (HudModelOptions.combat); a missing combat state reads as a pristine ship (CT 60/256)"
  - "shouldEmitThrottledMessage (the scrape gate generalised, shouldEmitScrapeMessage kept as an alias)"
  - "SessionCore.lastCombatMessageTimes (six kinds), createCombatMessageTimes, reset on Load"
  - "laserRefused, identEngaged, identLocked, identLost, identOff routed to hudMessages with Oolite's strings, each through its own one-second gate"
  - "IDENT_LOCKED_TEMPLATE (name only, D-03 pending owner confirmation) and pure formatIdentLocked(template, record)"
affects: [13-13, 13-14]
requirements-completed: [CBT-06, CBT-05, INPUT-01]
actuals:
  tokens: 8900
  tasks: 2
  commits: 2
plan_head_before: c0cb28742c4a05d6cc4089bdf84dfdee701abf87
plan_head_after: 72f75f6b750ab18ab5a13990dcc1f52cdfa72bb6
tech-stack:
  added: []
  patterns:
    - "One trailing options object on buildHudModel (Pitfall 10); an optional combat state falls back to a pristine one so the HUD never reads undefined"
    - "The scrape gate generalised to one pure gate with a per-kind last-time slot in the session core, reset together with the scrape slot on Load"
    - "The combat messages live in the existing hudMessages subscriber (given ctx), so the pinned subscriber order is unchanged"
key-files:
  created: []
  modified:
    - src/render/hud/draw.ts
    - src/app/hud-model.ts
    - src/app/session/render-driver.ts
    - src/app/session/event-router.ts
    - src/app/session/context.ts
    - src/app/session/save-controller.ts
    - src/app/game-session.ts
    - src/app/dock-feedback.ts
    - tests/ui/hud-model.test.ts
    - tests/app/session-order.test.ts
    - tests/app/dock-feedback.test.ts
    - tests/app/session/save-controller.test.ts
    - CHANGELOG.md
key-decisions:
  - "The lock message names the ship only ('Ident system locked onto [name].'), an advisor-recommended deviation from D-03 ('name and class'), PENDING OWNER CONFIRMATION. The text is the single constant IDENT_LOCKED_TEMPLATE in src/app/session/event-router.ts; D-03 taken literally is a one-line change of that constant plus its expectation in tests/app/session-order.test.ts (formatIdentLocked already renders [class] from the compiled scanClass; the literal form is pinned by a test)."
  - "Combat and ident messages use enqueuePriority: each answers a key the player just pressed (or a refused shot), so it must show at once; the gate, not the queue, prevents the flood."
  - "The five new kinds are routed to the existing hudMessages subscriber; EVENT_SUBSCRIBER_ORDER is unchanged, and createHudMessages now takes the session context as a second argument."
coverage:
  - id: D1
    description: "The FWD and AFT shield bars, the four energy banks E1..E4 (bottom bank fills first), LT (current facing) and CT (cabin) are fed from the combat state; HUD_ELEMENTS stays at eleven and no HUD_LAYOUT rectangle changes; MISS and ALT stay placeholders"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#buildHudModel combat gauges (CBT-06, D-06, D-07)"
        status: pass
      - kind: e2e
        ref: "docker compose run --rm verify (27 Chromium specs, including tests/e2e/hud.spec.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A new game's CT gauge reads 60/256 (0.234375) and a missing combat state reads as a pristine ship"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#reads a pristine ship without a combat state"
        status: pass
    human_judgment: false
  - id: D3
    description: "A refused shot shows 'Weapon system overheated.' or 'Weapon system inactive (no energy left).' at most once per simulated second per kind (360 held-fire ticks over 3 s give three messages); the kinds are gated independently; energyLow, shipHit and laserFired enqueue nothing; Load starts the gates empty"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts#combat and ident messages (CBT-05, INPUT-01, D-03, OQ5)"
        status: pass
      - kind: unit
        ref: "tests/app/dock-feedback.test.ts#the per-kind message gate (OQ5, Pitfall 9)"
        status: pass
      - kind: unit
        ref: "tests/app/session/save-controller.test.ts#(g) a Load clears the combat and ident message gates"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ident messages use Oolite's strings (active, locked onto <name>, Target lost., deactivated, Missiles on safety.) through the same gate; the lock text is the single constant IDENT_LOCKED_TEMPLATE, and formatIdentLocked renders the D-03 literal alternative 'Ident system locked onto GalCop Viper (police).' without any other change"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts#uses Oolite's wording for each ident event"
        status: pass
      - kind: unit
        ref: "tests/app/session-order.test.ts#formatIdentLocked fills [name] and [class] from the record, the D-03 literal included"
        status: pass
    human_judgment: false
---

# Phase 13 Plan 12: Live combat HUD gauges and throttled weapon and ident messages Summary

**The flight HUD's FWD and AFT shields, four energy banks, laser temperature and cabin temperature now read the live combat state inside the unchanged eleven-element layout, and refused shots and ident events post Oolite's messages through a per-kind one-second gate; the ident lock text is one constant, name only, with D-03 PENDING OWNER CONFIRMATION.**

## Performance

- **Duration:** about 15 min wall clock (`verify` takes about 5 min in Docker)
- **Tasks:** 2 of 2
- **Files:** 13 modified (8 source, 4 test, CHANGELOG), none created

## Accomplishments

- `HudBars` gained `shieldFwd`, `shieldAft`, `energyBanks`, `laserTemp` and `cabinTemp`. `buildHudModel` takes the trailing `options: HudModelOptions = {}` and fills them through `shieldGauge`, `energyBanks`, `laserTempGauge` and `cabinTempGauge`; without a combat state it uses a pristine one (full shields and banks, LT 0, CT 0.234375). `draw.ts` replaced the fixed fills of FWD, AFT, CT, LT and the E1..E4 loop (bank `i` draws `energyBanks[i]`, E1 top); every coordinate, colour and label, the MISS and ALT placeholders, `HUD_ELEMENTS` and `HUD_LAYOUT` are untouched. `render-driver.ts` passes `{ combat: ctx.core.combat }`.
- `shouldEmitThrottledMessage` is the scrape gate generalised (same one-second interval and non-finite rules); `shouldEmitScrapeMessage` is an alias. `SessionCore.lastCombatMessageTimes` holds one slot per kind (overheat, noEnergy, identEngaged, identLocked, identLost, identOff), created by `createCombatMessageTimes` and reset on Load beside `lastScrapeMessageTime`.
- `laserRefused`, `identEngaged`, `identLocked`, `identLost` and `identOff` are routed to `hudMessages` with the strings of `descriptions.plist` 517 to 535, each through its own gate keyed by `flightTime`. The lock event carries a spec key; the name comes from the session's own catalogue (`ctx.core.npcTraffic`), falling back to the key, and no entity id is ever named in `src/app`. `energyLow`, `shipHit` and `laserFired` stay unrouted and enqueue nothing.
- `IDENT_LOCKED_TEMPLATE = "Ident system locked onto [name]."` is the only place the lock wording lives, commented as the D-03 advisor-recommended deviation PENDING OWNER CONFIRMATION with the literal form; `formatIdentLocked` fills `[name]` and `[class]` (scan class without `CLASS_`, lowercased) and a test pins the literal alternative, so flipping D-03 is the constant plus its test expectation.
- CHANGELOG `### Added`: two entries (live gauges; combat and ident messages).

## Owner decisions pending

| Item | What this plan implements | If the owner keeps the decision literally |
| ---- | ------------------------- | ----------------------------------------- |
| D-03 | The lock message names the ship only ("Ident system locked onto GalCop Viper.") | Change `IDENT_LOCKED_TEMPLATE` in `src/app/session/event-router.ts` to "Ident system locked onto [name] ([class])." and the two expectations in `tests/app/session-order.test.ts` (the lock wording and the template pin). Nothing else changes. |

PENDING OWNER CONFIRMATION: it is not resolved and is recorded as such in PROJECT.md Key Decisions (plan 13-15).

## Task Commits

1. **Task 1: Live shield, energy, LT and CT gauges from the combat state to the canvas** - `2cbb0b4` (feat)
2. **Task 2: Weapon and ident messages through a per-kind one-second gate** - `72f75f6` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createHudMessages` needs the session context, so `game-session.ts` changed**
- **Found during:** Task 2
- **Issue:** The gate state, the flight clock and the NPC catalogue live in `ctx`, but `createHudMessages(deps)` had no access to it. `src/app/game-session.ts` is not in the plan's `files_modified`.
- **Fix:** `createHudMessages(deps, ctx)` takes the context as a second argument; the one call site in `game-session.ts` and the test harness pass it. The subscriber order and the table shape are unchanged.
- **Files modified:** `src/app/session/event-router.ts`, `src/app/game-session.ts`, `tests/app/session-order.test.ts`
- **Commit:** `72f75f6`

**2. [Rule 3 - Blocking] The pinned routing table was extended**
- **Found during:** Task 2
- **Issue:** `tests/app/session-order.test.ts` pins `EVENT_KIND_SUBSCRIBER` literally at 15 routed kinds; routing five new kinds required `ROUTED_EVENT_KINDS` and the table to grow.
- **Fix:** added the five kinds (all to `hudMessages`) to the table, the literal pin, the per-kind `EVENTS` fixtures and the counts (15 to 20, thirteen to eighteen single-subscriber kinds).
- **Commit:** `72f75f6`

**3. [Rule 1 - Type] `HudModelOptions.combat` accepts `undefined`**
- **Found during:** Task 1
- **Issue:** `ctx.core.combat` is `PlayerCombatState | undefined` and the project uses `exactOptionalPropertyTypes`, so `{ combat: ctx.core.combat }` would not typecheck against a plain optional property.
- **Fix:** typed the field `combat?: PlayerCombatState | undefined`.
- **Commit:** `2cbb0b4`

**4. [Rule 2 - Missing] Load-reset test and CHANGELOG entry for the messages**
- **Found during:** Task 2
- **Issue:** "After a Load the gates start empty" had no test in the listed files, and the messages are user-visible, which the repository rule requires in `CHANGELOG.md` in the same commit.
- **Fix:** added case (g) to `tests/app/session/save-controller.test.ts` and a second CHANGELOG `### Added` entry.
- **Commit:** `72f75f6`

**5. [Rule 1 - Format] Prettier**
- **Found during:** Task 2 verification
- **Issue:** `lint` flagged three files.
- **Fix:** ran Prettier in the lint container on them.
- **Commit:** `72f75f6`

**Total deviations:** 5 auto-fixed (2 blocking, 1 type, 1 missing, 1 format). **Impact:** none on the plan's contract; the HUD layout, subscriber order and the D-03 wording are as specified.

## Verification

- `docker compose run --rm test npx vitest run tests/ui tests/app tests/compliance.test.ts`: 41 files, 691 tests passed (SPDX compliance included).
- `docker compose run --rm lint`, `docker compose run --rm typecheck`: clean.
- `docker compose run --rm verify`: exit 0 (27 Chromium specs passed, the eleven-element HUD spec included).
- Acceptance counts: `model.bars.shieldFwd` in draw.ts 1; `shieldFwd` in hud-model.ts 2; `LEFT_BAR_X, 894, 0.22` 0; `Weapon system overheated.` 1; `Ident system locked onto` 2; `IDENT_LOCKED_TEMPLATE` 2; `Ident system locked onto \[name\]\.` 1.
- Tracer gate: the Task 1 `<verify>` is automated-only and was re-run end to end (HUD model test, typecheck, lint, then `verify`) before Task 2.

## Known Stubs

None added. MISS and ALT remain the existing HUD placeholders by design (D-07).

## Threat Flags

None. T-13-25 (message flood) is mitigated by `shouldEmitThrottledMessage`; silent kinds never enqueue.

## Self-Check: PASSED

- Commits `2cbb0b4` and `72f75f6` are ancestors of HEAD; the commit count since the plan ledger is 2.
- All 13 modified files exist and are committed; no file was created.
