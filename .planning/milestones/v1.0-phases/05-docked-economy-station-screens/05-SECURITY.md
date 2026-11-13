---
phase: "05"
slug: "docked-economy-station-screens"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-06"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| IndexedDB → boot parser | an untrusted JSON string crosses into `parseSave` | save blob (untrusted JSON) |
| trade/outfitting action → profile | a UI-requested amount crosses into the trusted money path | quantity, price, tech level |
| profile → autosave → IndexedDB | a schema-valid but semantically invalid snapshot must never replace the last good blob | profile snapshot |
| generated content → sim | build-validated content is the only coefficient/price source | commodity, equipment, system record |
| commodity/equipment/system strings → station DOM | content strings are rendered as text | display strings |
| browser key event → input layer | untrusted codes and modifiers decide which action fires | key code, modifiers, focus |
| profile + marketSeed → reload | credits, cargo and the market seed must be one atomic snapshot | persisted profile |
| source tree → sim bundle | economy files must stay DOM-, Three-, clock- and RNG-free | module imports, globals |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | `parseSave` cargo/credits/fuel/counts | high | mitigate | Optional fields with integer/range caps, commodity allow-list, duplicate rejection, unclamped `capacityPodsFor`, and `capacityPods >= 0 && holdPodsUsed <= capacityPods`; over-capacity is `corrupt`; `parseSave` never throws. | closed |
| T-05-02 | Tampering | duplicate or unknown cargo/equipment keys | high | mitigate | Allow-lists from validated content; duplicate/unknown/non-tradeable keys return `corrupt`; cargo is an entry array on the wire; `alien_items` excluded. | closed |
| T-05-03 | Elevation | commodity/equipment/system strings rendered into `#docked` | medium | mitigate | Every dynamic write is `textContent`; no `innerHTML`/`insertAdjacentHTML`/`outerHTML` in the shell. | closed |
| T-05-04 | Tampering | a forged `__proto__` cargo key | high | mitigate | Wire format is an entry array; the runtime map is null-prototype and only allow-listed keys are assigned. | closed |
| T-05-05 | Tampering | integer/float drift in price, stock or credits | high | mitigate | Integer decicredits end to end, `Number.isSafeInteger` guards, `Math.fround` only inside the economy formula, truncation only at the C-cast boundary. | closed |
| T-05-06 | Tampering | negative credits or a subtract-before-approval path | high | mitigate | `applyBuy`/`applySell` re-run the pure plan; no arithmetic before approval; non-negative safe-integer assertions. | closed |
| T-05-07 | Tampering | tech-level gate using the displayed `techLevelRaw + 1` | high | mitigate | `checkFit` takes `techLevelRaw` from the session's `System` and refuses below the item TL; equality allowed; unit pair pins equal and one-below. | closed |
| T-05-08 | Tampering | removal entry miscomputing Oolite's trade-in | high | mitigate | Missile removal charges exactly 200 dc and refunds `missiles * EQ_MISSILE.price` (net +700 at three); berth removal decrements once and adds nothing; exact-delta tests at 0/1/3 missiles and the 199 dc boundary. | closed |
| T-05-09 | Tampering | forged catalogue price or condition values | high | mitigate | Price/key/conditions are read from the validated equipment record; non-positive, fractional, non-finite and over-long values refuse as `invalidPrice`; no key lookup inside the sim. | closed |
| T-05-10 | Tampering | misleading system-data or equipment copy from an unvalidated template | medium | mitigate | Labels are build-validated by `LabelsSchema`; a missing key throws `StationModelError`; only documented tokens are replaced; no user input enters a template. | closed |
| T-05-11 | Denial of service | unbounded template expansion or a pathological labels string | low | mitigate | No general template engine, one replacement pass, bounded compiled record; the view model allocates only 17 market rows and 16 manifest rows. | closed |
| T-05-12 | Denial of service (local) | F5 reload / F3 find / F7 caret browsing | medium | mitigate | Narrow capture-phase `preventDefault` for the four F-keys (never Ctrl/Meta/Alt chords), a synthetic-key `defaultPrevented` proof with a `dataset.capture` negative control, Digit keys advertised, document sentinel as a secondary signal. | closed |
| T-05-13 | Elevation | Esc double-firing pause and back, or Digit1 launching inside a section | high | mitigate | `ACTION_CONTEXTS` gives pause `flight`+`dockHome`+`dockScreen` via KeyP, back/confirm/arrows `dockScreen` only; the session ignores launch unless `mode === "docked" && screen === "home"`; e2e asserts home/section behaviour. | closed |
| T-05-14 | Tampering | over-capacity or huge forged cargo (41 t, 36 M grams, 18 entries) | high | mitigate | Schema bounds, 17-entry cap, unclamped `capacityPodsFor`, `capacityPods >= 0 && holdPodsUsed <= capacityPods`, 32 KiB pre-parse cap, browser over-capacity case. | closed |
| T-05-15 | Tampering | a reload or redock rerolls the market | high | mitigate | The session persists one `marketSeed`; `generateMarket` is pure in that seed; a `docked` event never regenerates; reloads and redocks keep all 17 prices identical; tests capture seed and prices across both. | closed |
| T-05-16 | Elevation | a `?test=1` credit/equipment mutation becomes durable | high | mitigate | Taint flag set by every hook mutation; `autosave()` skips a tainted profile and publishes the reason; the station loop uses real UI actions. | closed |
| T-05-17 | Tampering | `planSell`/`applySell` proceeds and clamp arithmetic | high | mitigate | `applySell` re-runs the pure plan, adds proceeds only after approval, keeps integer decicredits and safe-integer guards; fast-check plus exact 499/500, 499,999/500,000 and overflow boundaries. | closed |
| T-05-18 | Tampering | market goldens written by hand or blessed by the code under test | medium | mitigate | Fixtures are written only by `write-market-goldens.ts` calling `generateMarket`; independent vectors are separately authored with provenance and never regenerated. | closed |
| T-05-19 | Tampering | a schema-valid but over-capacity/duplicate snapshot overwrites the last good save | high | mitigate | One `validateSaveSemantics` used by both `parseSave` and `isEncodedSaveValid(raw, allow)`; `queueAutosave` returns `invalid-save` without writing; a fake-store test proves previous bytes untouched. | closed |
| T-05-20 | Tampering | kg/g capacity under- or over-allow when the good already occupies a pod | high | mitigate | `maxAdditional` counts `otherPods` and the held good's own pod; bulk buys also subtract the held bulk tonnes; direct tests at 1,499 kg + free pods, 19 t + 600 kg, empty hold 20,499 kg, full-of-other-cargo 499 kg and gram analogs. | closed |
| T-05-21 | Tampering | sell-side safe-integer overflow | high | mitigate | `overflow` refusal when `credits + proceeds > Number.MAX_SAFE_INTEGER`; exact boundary test; the same predicate `isSafeCredits` uses. | closed |
| T-05-22 | Elevation | `checkFit`/`applyFit` accepting a key outside `VISIBLE_EQUIPMENT_KEYS` | high | mitigate | `notOffered` is the first check in both functions; `EQ_ECM`, a laser and an arbitrary catalogue record are tested for the same profile object and zero credit delta. | closed |
| T-05-23 | Tampering | fail-open condition reader or fractional fuel producing fractional credits | high | mitigate | Condition flags accept only `true`/`"true"`; `requires_cargo_space` must be a finite non-negative integer 0..35; fuel must be a safe integer 0..70; otherwise `invalidCondition`/`invalidPrice`. | closed |
| T-05-24 | Tampering | `String.replace` interpreting `$` in a system name or template value | medium | mitigate | One-pass replacer function / `split`+`join`, no replacement string, no `RegExp` from labels JSON; a leftover token throws `StationModelError`. | closed |
| T-05-25 | Elevation | native Enter/Space on a focusable row or a stale Launch button | high | mitigate | Section rows are `div`/`tr`, the Launch button exists only on home, the click handler re-checks `screen === "home"`, and a KeyY on a disabled row is asserted to change nothing. | closed |
| T-05-26 | Tampering | a paused station action fires beneath the overlay or replays on resume | high | mitigate | Station actions dispatch only in `!paused`; the paused branch drains and discards `drainStationActions()`; Tab/Enter are not intercepted; the final loop proves Digit8/KeyY while paused change nothing. | closed |
| T-05-27 | Tampering | a schema-valid but semantically invalid snapshot overwrites the last good save | high | mitigate | `isEncodedSaveValid(raw, allow)` and `queueAutosave(..., allow)` run the same `validateSaveSemantics` as `parseSave`; a fake-store test proves the previous bytes are untouched and a later valid write commits. | closed |
| T-05-28 | Elevation | a runtime content import or nested-module path bypasses the purity guard | high | mitigate | Module-path resolution accepts only `import type` from `src/content/types.ts` in both nesting depths; `src/sim/player/profile.ts` is scanned; ESLint denies the same runtime loaders. | closed |
| T-05-29 | Tampering | removal detail misstating the removal economics | high | mitigate | `buildOutfittingModel` overrides generated descriptions with `REMOVAL_DESCRIPTIONS`; both entries are test-asserted, and the exact net deltas (+700 dc at three missiles, −1000 dc for a berth) are pinned. | closed |
| T-05-30 | Tampering | a forged or out-of-range `marketSeed` selects a favourable market | low | accept | Schema-bounded uint32, `generateMarket` re-validates, derivation is FNV-only with no URL/clock input; single-player save editing already grants arbitrary credits. See Accepted Risks Log. | accepted |
| T-05-31 | Tampering | a forged missile price or count mints credits, or a refund is counted before the affordability gate | high | mitigate | `ctx.missilePrice` is the validated catalogue price (non-negative safe integer within `MAX_EQUIPMENT_PRICE`), `profile.missiles` is bounded 0..3 by the save schema, the charge is approved before either add, and the outcome is a safe non-negative integer. | closed |
| T-05-32 | Tampering | a Phase 4 blob without `marketSeed` is rejected or silently seeded to a different market | medium | mitigate | `marketSeed` is an optional additive field (`SAVE_VERSION` unchanged); boot substitutes `restore.marketSeed ?? marketSeedForSystem(system.id)`; the old-blob browser case asserts Continue and the derived seed. | closed |
| T-05-33 | Tampering | a second, divergent append-and-charge path bypasses Phase 4 purchase rules | medium | mitigate | Single-instance keys delegate to `canPurchase` for tech/owned/credits and to `purchase` for append-and-charge; `purchase` spreads so cargo/fuel/missiles/berths survive; delegation and field preservation are tested. | closed |
| T-05-34 | Tampering | a legacy `EQ_PASSENGER_BERTH` alias bypasses the capacity check | high | mitigate | Normalise the alias into `effectiveMissiles`/`effectiveBerths` BEFORE `capacityPodsFor`/`holdPodsUsed`; a `20 t` Food + alias blob at Lave measures 15 t and is `corrupt`; `profileFromSave` uses the same normalisation. | closed |
| T-05-35 | Tampering | an async save-failure notice overwrites an open `[Y/N]` confirmation | medium | mitigate | Four independent footer fields; the save failure writes only `[data-field="station-save"]`, and e2e opens a fresh prompt after a failure to prove `station-confirm` survives. | closed |
| T-05-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package added or upgraded this phase (`git diff 1e5090d^..HEAD -- package.json package-lock.json` empty); future installs need the package-legitimacy gate and a blocking human checkpoint. | closed |

*Status: open · closed · open — below block_on threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-05-01 | T-05-30 | The market seed is a schema-bounded uint32, re-validated by `generateMarket`, and derived only by FNV from the system id — never from a URL or the wall clock. There is no server economy, and an attacker who can edit IndexedDB can already grant themselves arbitrary credits, so the seed adds no capability inside the single-player trust boundary. Accepted-risk basis verified in code. | gsd-security-auditor (automated) | 2026-11-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-06 | 36 | 36 | 0 | gsd-security-auditor (automated) |

**Evidence runs (Docker only):** `tests/sim/economy tests/sim/player tests/persistence tests/guards` — 239 passed / 13 files; `tests/e2e/station.spec.ts` — 10 passed; autosave taint/legacy/over-capacity/failed-write subset — 4 passed; `git diff 1e5090d^..HEAD -- package.json package-lock.json` — empty.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-06
