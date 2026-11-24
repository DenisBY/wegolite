---
phase: 19-equipment-damage-and-repair
reviewed: 2026-11-21T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/app/session/context.ts
  - src/app/session/event-router.ts
  - src/app/session/probe-publisher.ts
  - src/app/session/sim-driver.ts
  - src/app/session/station-controller.ts
  - src/app/session/step-options.ts
  - src/content/schemas/equipment.ts
  - src/main.ts
  - src/persistence/autosave.ts
  - src/persistence/save.ts
  - src/sim/combat/internal-damage.ts
  - src/sim/combat/ledger.ts
  - src/sim/combat/shields.ts
  - src/sim/combat/step.ts
  - src/sim/economy/cargo.ts
  - src/sim/events.ts
  - src/sim/flight/state.ts
  - src/sim/player/damage.ts
  - src/sim/player/outfitting.ts
  - src/sim/player/profile.ts
  - src/sim/rng.ts
  - src/ui/station-model.ts
  - tools/oolite-ingest/convert/equipment.ts
findings:
  critical: 1
  warning: 1
  info: 2
  total: 4
  necessity: 1
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-11-21
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Reviewed the Phase 19 diff (`e67f8c5..HEAD`) of the 25 listed files against the Oolite checkout
(`PlayerEntity.m` 5599-5760 and 6097-6185, `OOEquipmentType.m` 195-260 and 477-520, `ShipEntity.m`
3169-3345 and 7185-7215, `PlayerEntity.m` 295-425 and 8255-8420, 9085-9135, `descriptions.plist` 895-896).

The roll transcription is faithful in structure: gate mask 31 and the strict `< amount` compare, the
`n_considered` integer arithmetic (38 / 53), the die, the cargo branch, the reversed die with the
unsigned-wrap guard, the strict weighted pick, draw order (gate, die, pick), the laser-only
`energy > 0` gate and the scrape-always gate, `applied` as the post-shield amount, the 4.5 s
clear-then-print messages, the half-price repair with the ceiling, and the repair tech level.
The save validator and the F3 money path hold: `parseRepairFitKey` is an exact allow-list parse,
`checkRepair` validates key, both prices, damaged-and-not-installed, tech level and credits in that
order before any arithmetic, `applyRepair` re-checks and returns the same object on refusal, the
damaged list is allow-listed, duplicate-free, disjoint from `equipment` and shares the 64-key bound,
and every older version is `corrupt` (never `unreadable`).

One real fidelity defect in the roll: zero-probability items inflate the damageable-slot count
(CR-01). The 256-iteration cap re-check the executor asked for is below; the cap itself holds.

### Re-check of the 256-iteration cap (`MAX_INTERNAL_DAMAGE_ROLLS`, FIDELITY E-167)

I re-derived every claim in the constant's comment, the Key Decisions row and E-167 from the code and
from `PlayerEntity.m`. All hold:

- Oolite's two gate loops (`PlayerEntity.m:5691-5697`, `5746-5752`) are uncapped, and the loop body
  is one `ranrot_rand()` gate draw per iteration. The cap changes nothing for a laser roll: a laser
  roll runs only with energy above 0 after the hit (`ledger.ts:211-214`), `routeDamage` leaves
  `applied < energy <= COBRA_MAX_ENERGY = 256`, so a laser roll makes at most 8 iterations.
- The iteration count is Oolite's exactly up to 8,192 (8,192 makes 256 iterations: amounts 8192,
  8160 ... 32). 8,192.5 and 8,224 make 257 in Oolite and 256 here. The tests at
  `tests/sim/combat/internal-damage.test.ts:428-467` pin all three and the next same-tick record's draw
  position (516 after 512 plus two iterations).
- A scrape applies unclamped (`shields.ts:177-181`, `applied` is the full remainder), so the cap binds
  only on a scrape above 8,192 points past the shield. Oolite's player (bank at most 256) dies in
  that same call; Wegolite's survives at energy 0 until Phase 20. Reachable only through
  `collide.ts` ship or buoy contacts (`dam = m x v^2 / 5e7`), so it needs a very heavy NPC at
  a very high closing speed. Observable only through the Phase 20 gap, as recorded.
- The float64 argument is correct (`amount - 32 === amount` from about 5.8e17; the recorded "1e18 or
  more" is a safe round bound), and the cap does make the roll total: 256 iterations, at most 3 draws
  each, finite events (each event removes an item or a pod from the work copy, so at most
  `items + pods` events per call).
- The recorded condition from `19-REVIEWS.md` is met: PROJECT.md Key Decisions row (line 341),
  FIDELITY E-167 (line 195), the constants-ledger row (line 2884), the 8192 / 8192.5 / 8224 tests and
  the following-record draw-position test all exist and agree with the code.

Verdict on the cap: sound as recorded. No change needed now. One carry-forward for Phase 20: the
ledger comment already says Phase 20 must keep both gates; E-167 should be re-read when death is
added, because a lethal scrape then stops being "observable only through the Phase 20 gap" and the
cap becomes a pure internal bound with no externally visible effect.

## Critical Issues

### CR-01: A zero-probability item inflates `damageableCounter`, so equipment is damaged too often (fidelity defect in the roll)

**File:** `src/sim/combat/internal-damage.ts:196-197` (with `:114-136` and `src/app/session/step-options.ts:618-621`)
**Issue:** Oolite counts a slot only for an item that `canBeDamaged` (`PlayerEntity.m:6119-6126`:
`if ([eqType canBeDamaged]) { damageableCounter++; damageableOdds += ... }`, and
`OOEquipmentType.m:512-520`: `canBeDamaged` is false for a missile or mine and for
`damageProbability <= 0`). The port sets `const damageable = work.items.length`, which counts every
installed key, including an item with `damageProbability` 0. The code comment at
`step-options.ts:601-602` says a zero-probability key "stays listed, as it takes part in Oolite's pick
sum", but a zero-probability item adds 0 to the pick sum and nothing to the slot count in Oolite; the
only thing listing it changes is the slot count, and that change is wrong.

Reachable today: `EQ_CARGO_BAY` is a single-instance F3 key (`SINGLE_INSTANCE_KEYS`) with compiled
`damageProbability` 0 (`equipment.json`: `"damage_probability": 0`). With the bay (capacity 35,
`considered` 53) and a docking computer, Oolite has `damageableCounter = 1` (only `reversed == 0`
damages), while this code has 2 (`reversed` 0 or 1): the docking computer is damaged twice as often
as Oolite. With the bay installed and nothing else damageable, Oolite never reaches the pick draw and
this code does draw the pick (a wasted draw, which also shifts every later draw in the same stream).
Every player who buys the bay (a common first purchase) is affected, in every roll. The unit test
`tests/sim/combat/internal-damage.test.ts:379` ("a zero-probability item counts toward the slots but
is never picked") and `step-options.test.ts:71` pin the wrong behaviour as intended.

I traced this by hand against the C; the scratch Vitest I started in Docker (`/tmp/cr01`) had not
finished when this review was written, so the count is not run-confirmed. The trace is short: bay (p 0)
plus dock computer (p 1), capacity 35, gate draw 0 (passes at amount 32), die draw giving 51
(`reversed = 53 - 52 = 1`): `1 < 2` here picks and damages the docking computer; Oolite's
`1 < 1` is false and the roll falls through to the cosmetic branch.

**Fix:** Count only items that can be damaged, in `resolveInternalDamage`, and keep the sanitiser as is:
```ts
// internal-damage.ts, replace lines 196-197 and the odds loop
let damageable = 0;
let odds = 0;
for (const item of work.items) {
  if (item.damageProbability > 0) {
    damageable += 1;
    odds += item.damageProbability;
  }
}
if (reversed >= 0 && reversed < damageable) { ... }
```
Then change the two tests to the Oolite behaviour (a zero-probability item counts toward neither the
slots nor the pick; "odds of 0 still draw the pick" becomes "odds of 0 draw no pick"), update the
`step-options.ts:601-602` comment, and add a case with `EQ_CARGO_BAY` plus one damageable item that
shows `reversed == 1` damages nothing. Per the fidelity rule this is the fix, not a recorded
divergence; no FIDELITY row exists for it.

## Warnings

### WR-01: An in-flight damage commit rebuilds and renders the full station view for every event

**File:** `src/app/session/station-controller.ts:810-816` (reached from `src/app/session/event-router.ts:656-682`)
**Issue:** `damageFlow` commits through the station controller's `commitProfile`, which calls
`onProfileChanged` and `renderStation()`. `renderStation()` builds the market, outfitting, status and
home models and calls `docked.render(view)` each time. A single heavy scrape can emit up to
`items + pods` damage events (at most about 40: four damageable items plus a full 35 t hold) in one
`stepOnce`, so one drain triggers that many full view rebuilds, and each one runs the station
model builders and `docked.render` while the player is in flight and the station panel is hidden.
The other `commitProfile` callers I found (`station-controller.ts`, `start-session.ts:903`) are
docked-only and commit once per player action; this is the first per-tick flight caller. A throw in
any model builder (they throw `StationModelError` on an inconsistent catalogue) would escape into
`router.dispatch` inside the fixed step. Robustness and scope concern, not a wrong result today.
**Fix:** Commit all events of one step once, or make the in-flight commit skip `renderStation()` when
`ctx.core.state?.mode !== "docked"` (the station re-renders on dock anyway). The smaller change:
```ts
function commitProfile(next: PlayerProfile): boolean {
  if (next === ctx.core.profile) return false;
  ctx.core.profile = next;
  onProfileChanged(ctx.core.profile);
  if (ctx.core.state?.mode === "docked") renderStation();
  return true;
}
```
Check that no flight-time caller relies on the render before choosing this; if one does, add a
`render: false` option for `damageFlow` instead.

## Info

### IN-01: `internalDamageWork` guards states the compiled catalogue and the save validator already rule out

**File:** `src/sim/combat/internal-damage.ts:114-136`
**Category:** necessity
**Issue:** The sanitiser drops a repeated key and maps a non-finite or negative probability to 0. Neither
state can reach it in this stack: `profile.equipment` is unique (`purchase` and `applyRepair` refuse an
installed key; `validateSaveSemantics` rejects a duplicate) and `damageProbability` is
`z.number().min(0)` with Zod 4 rejecting NaN and Infinity (`schemas/equipment.ts:31`) and the ingest
refusing a non-finite or negative authored value (`convert/equipment.ts:237`). The only producer of
`InternalDamageFacts` is `internalDamageFactsFor`, from those two validated sources. It rests on
judgment, not proof, because the module is deliberately total for fuzzing (property tests feed it
hostile values), so this is Info, not Warning. Note the dedupe is also the reason the duplicate
`EQ_A` cases in the unit test exist; if CR-01 is fixed by filtering zero-probability items inside this
function instead, the guard earns its place.
**Fix:** Keep it if the totality contract is intended; otherwise record the invariant in the header and
drop the dedupe. No action required for correctness.

### IN-02: `MAX_SAVE_CHARS` comment states a bound that no saved blob can reach

**File:** `src/persistence/save.ts:84-93`
**Issue:** The comment already admits the 46,796-character figure is a schema bound and that the
combined 64-key rule rejects 64 plus 16 keys, so the real worst case is lower. Harmless, but the
constant is documented as "a true upper bound on what `encodeSave` can produce" while the very next
sentences say it is not reached. Reword so a later reader does not tighten `MAX_SAVE_CHARS` on the
strength of the wrong figure, or the other way around.
**Fix:** State the reachable worst case (64 combined keys) as well as the schema bound.

---

_Reviewed: 2026-11-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
