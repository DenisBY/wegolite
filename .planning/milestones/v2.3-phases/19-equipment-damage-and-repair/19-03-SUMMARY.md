---
phase: 19-equipment-damage-and-repair
plan: 03
subsystem: sim
tags: [player-profile, equipment-damage, cargo, fast-check, oolite-fidelity]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-15 in-use tripwire and its outfitting.ts token pins; 19-01 damage probabilities"
provides:
  - "PlayerProfile.damagedEquipment (D-11), [] in newProfile() and profileFromSave"
  - "DAMAGEABLE_EQUIPMENT_KEYS, DamageableKey, isDamageableKey: the one damageable set (D-03)"
  - "applyEquipmentDamaged and applyCargoDestroyed, pure and identity on refusal"
  - "purchase counts equipment plus damagedEquipment against the 64-key bound and refuses a damaged key"
  - "SC2 proof at the simulation boundary: a damaged dock computer and compass behave as not installed"
affects: [19-04, 19-05, 19-08, 19-10]
tech-stack:
  added: []
  patterns: ["damaged item lives in its own list, so every installed-set consumer needs no change", "membership allow-list by array search, never `in`"]
key-files:
  created:
    - src/sim/player/damage.ts
    - tests/sim/player/damage.test.ts
    - tests/sim/player/damage.property.test.ts
    - tests/sim/player/damaged-installed.test.ts
  modified:
    - src/sim/player/profile.ts
    - src/sim/player/outfitting.ts
    - src/persistence/autosave.ts
    - tests/sim/player-profile.test.ts
    - tests/guards/damaged-equipment-in-use.test.ts
    - tests/guards/economy-purity.test.ts
key-decisions:
  - "purchase also refuses a key that is in damagedEquipment (identity), so the two lists stay disjoint; 19-05 adds the matching canPurchase refusal reason"
  - "the tripwire's pins rose from 2 to 3 per key and its three count-dependent expectations were updated with them"
requirements-completed: [CBT-08, CBT-12, SAVE-09]
status: complete
actuals:
  tokens: 12500
  tasks: 2
  commits: 3
plan_head_before: ca47e55d8878710755f4f0fdb9b12aa722c2f3a5
plan_head_after: e1a38b8ee3146df0c7291b0ab9431e77f690ef22
duration: 50m
completed: 2026-11-21
---

# Phase 19 Plan 03: Damaged equipment list and the two profile operations Summary

The profile now carries a `damagedEquipment` list and two pure operations the app will commit when the simulation reports internal damage; a damaged dock computer and compass are proven to behave as not installed (D-03, D-04, D-06, D-11).

## What was built

- **Profile** (`src/sim/player/profile.ts`): `PlayerProfile.damagedEquipment: readonly string[]`, `[]` and a fresh array in `newProfile()`. `purchase` refuses (same object) when `equipment.length + damagedEquipment.length >= MAX_EQUIPMENT_KEYS` (64) and when the key is in `damagedEquipment`.
- **Damageable set** (`src/sim/player/outfitting.ts`): `DAMAGEABLE_EQUIPMENT_KEYS` (frozen: EQ_DOCK_COMP, EQ_GAL_DRIVE, EQ_ADVANCED_COMPASS, EQ_ADVANCED_NAVIGATIONAL_ARRAY), `DamageableKey`, `isDamageableKey` by array membership. Nothing else in the file changed.
- **Operations** (`src/sim/player/damage.ts`, SPDX header, cites `PlayerEntity.m:6155-6161`): `applyEquipmentDamaged(profile, key)` moves an installed damageable key to the end of `damagedEquipment`; `applyCargoDestroyed(profile, commodity, amount)` lowers an own-property commodity by a positive safe integer no larger than held through `setCargo` (zero entries dropped). Both return the same object on every refusal. `damage.ts` names no equipment key literal.
- **Restore path** (`src/persistence/autosave.ts`): `profileFromSave` sets `damagedEquipment: []` (a v4 save cannot record damage; 19-08 replaces the reader).
- **Guards**: `damage.ts` joined `PLAYER_FILES` in `economy-purity.test.ts`; the 19-15 tripwire's `OUTFITTING_KEY_PINS` rose from 2 to 3 for both keys (acceptance grep: 2 matches).

## Tests

- `tests/sim/player/damage.test.ts` (18 cases): the field default, the frozen set and `isDamageableKey` (junk, prototype names, lasers), damage order, input immutability, every refusal identity, cargo loss and its refusals, the 60+4 and 59+4 cap cases, the damaged-key purchase refusal.
- `tests/sim/player/damaged-installed.test.ts` (4 cases, SC2): options built from the damaged profile's `equipment` run through `stepFlight`: Shift+C inside the aegis gives `dockDenied { reason: "notInstalled" }`, mode stays `inFlight`, no clock jump (the control docks); a non-auto compass mode reads `auto` after one step (the control keeps `station`).
- `tests/sim/player/damage.property.test.ts` (fast-check, 300 runs of 1 to 40 operations, plus a bound case): purchases (with 0 to 30 filler keys to reach the bound), damage of the five damageable-or-installable keys plus EQ_ECM and EQ_WEAPON_PULSE_LASER, and cargo loss keep both lists duplicate-free and disjoint, the combined count at most 64, every damaged key inside the set, every refused damage operation identity, and cargo entries positive safe integers.

**Test literals the new field touched:** only `tests/sim/player-profile.test.ts` (the `newProfile()` `toEqual` literal, one added line). `tests/persistence/autosave.test.ts` needed no edit (its literals spread `newProfile()`), and no other full-profile literal broke; typecheck found none.

## Deviations from Plan

**1. [Rule 1 - Bug] `purchase` could re-buy a damaged key**
- **Found during:** Task 2, the disjointness property (it failed on `equipment` and `damagedEquipment` both holding EQ_DOCK_COMP).
- **Issue:** `purchase` only checked `equipment.includes(key)` for "owned", so a key sitting in `damagedEquipment` could be bought again and appear in both lists, breaking the must-have invariant.
- **Fix:** `purchase` returns the same object for a key in `damagedEquipment` (one line plus a comment). `canPurchase` is not changed here: its `"damaged"` refusal reason belongs to 19-05, and damage goes live only after the repair door (19-12).
- **Files modified:** `src/sim/player/profile.ts`, `tests/sim/player/damage.test.ts`
- **Commit:** d372a2c

**2. [Rule 3 - Blocking] The 19-15 guard's own expectations depend on the pin**
- **Issue:** the plan says to raise the pins and "change nothing else in that guard", but three assertions embed the old count (the alias case expects "appears 3 times" and "pinned at 2", the key-removal case "appears 1 times", the copied-file case four lines). Raising the pin without them left the guard red.
- **Fix:** those expectations became 4, 3, 2 and 6 lines, and the two doc comments that state the pin now say 3 and name the third occurrence. No trigger logic changed.
- **Commit:** 3767871

**3. [Rule 3 - Blocking] Lint rule on an unknown value**
- A `String(value)` of an `unknown` in the `isDamageableKey` test tripped `@typescript-eslint/no-base-to-string`; the case label is now an index. **Commit:** e1a38b8

## Auth gates

None.

## Known Stubs

None. `damagedEquipment` is read by no UI or save yet by design: 19-08 persists it, 19-10 commits the operations, 19-12 shows it.

## Threat Flags

None. Mitigations T-19-04 (identity on every refusal, set membership, own-property commodity, bounded amount) and T-19-05 (combined cap in `purchase`) are implemented and covered by the property.

## Verification

- Targeted: `docker compose run --rm test npx vitest run tests/sim/player tests/guards tests/sim/dock-computer.test.ts tests/sim/compass-beacon.test.ts`: 27 files, 454 tests pass.
- `docker compose run --rm typecheck`: clean. `docker compose run --rm lint`: clean (a first lint and typecheck ran while the full suite was running and failed with ENOENT on the suite's temporary `__purity_probe_N.ts` files; rerun alone they pass).
- Full `docker compose run --rm test` at HEAD e1a38b8: 276 of 276 files, 7177 tests passed, 10 skipped, no coverage error. A first full run (before the lint fix) had 4 failures, all 5 s timeouts (`tools/oolite-ingest/convert/textures.test.ts`, a documented flake, and three others in files this plan did not touch) while sibling executors loaded the machine; the clean rerun passed everything.
- Acceptance greps: `readonly damagedEquipment: readonly string[]` 1, `export function applyEquipmentDamaged` 1, `export const DAMAGEABLE_EQUIPMENT_KEYS` 1, `isDamageableKey(` in `damage.ts` 1, tripwire pins at 3 matched twice, `_DAMAGED` in non-comment code of `damage.ts` and `profile.ts` none, `applyCargoDestroyed` 1, `damagedEquipment.length` 1, `"damage.ts"` in the purity guard 1.
- No remote run (pure `src/sim`, one line of `autosave.ts`, tests), no CHANGELOG entry (nothing user-visible: no code damages a profile yet), no NPC acceptance run (no `src/sim/npc/**`, `src/sim/world/**` or ships-npc change), no twin hash moved.

## Self-Check: PASSED

Created files exist (`src/sim/player/damage.ts`, the three test files); commits 3767871, d372a2c and e1a38b8 are ancestors of HEAD; `commits: 3` is measured from the ledger (`rev-list ca47e55..e1a38b8`).
