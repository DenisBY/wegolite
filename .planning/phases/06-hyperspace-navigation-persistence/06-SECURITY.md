---
phase: "6"
slug: "hyperspace-navigation-persistence"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-06"
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Dispositions transcribed from the six plan `<threat_model>` blocks; evidence verified against
> the merged implementation after the final `docker compose run --rm verify` (exit 0).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| app frame → `StepOptions.hyperspace` | The app supplies fuel, origin and target facts read-only; a bug or forged test seam could pass non-finite/negative values. | integer fuel and chart coordinates |
| chart coordinates → integer math | Content-derived coordinates cross into `Math.sqrt`; absurd magnitudes could overflow to Infinity. | numeric coordinates |
| IndexedDB `autosave` → `parseSave` | A tampered/hostile blob crosses into JSON parsing and schema validation. | untrusted save JSON |
| in-memory profile/market/pose → `encodeSave` | Trusted values are projected into the wire format; a bug could write an invalid snapshot over a good one. | save JSON |
| browser future build → this build | An older build may read a newer blob and must not destroy it. | forward-version save |
| content system name → overlay | Names come from compiled content and cross into the DOM. | system names |
| pointer/keyboard → selection | A click or arrow chooses a system id that the session later commits. | system id |
| 256 markers + 875 edges → canvas | A per-frame repaint would exhaust the SwiftShader frame budget. | draw calls |
| chart selection → committed target | A click/Enter chooses an id that the session later resolves and jumps to. | system id |
| save pose → restored flight state | A tampered in-flight pose crosses into the renderer and camera. | position/orientation |
| F2 controls → save/load actions | A keyboard action can write or replace the only save. | save slot |
| IndexedDB blob → in-session load | A hostile blob is parsed while a live session exists. | untrusted save JSON |
| persisted market → reload | A snapshot is trusted after validation; reload must not regenerate it. | 17-good market |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Tampering | `StepOptions.hyperspace` fuel/target facts | medium | mitigate | `canStartJump`/countdown reject non-finite, negative or non-integer fuel and non-finite coordinates (`src/sim/hyperspace/countdown.ts:88`, `src/sim/flight/step.ts:239-262`); commit revalidates the snapshot before touching the clock | closed — below high threshold |
| T-06-02 | Denial of Service | `chartDistance` on absurd coordinates | low | mitigate | Finite/safe-integer coordinate guards and `Number.isSafeInteger(dist)` in `src/sim/hyperspace/jump.ts:91` | closed — below high threshold |
| T-06-03 | Tampering | predictable arrival hash | low | accept | `fnv1a32` is deliberately not a security control; deterministic arrival is the design (D-08) and no secret depends on it | closed — accepted (below high threshold) |
| T-06-04 | Denial of Service | oversized IndexedDB blob before `JSON.parse` | high | mitigate | `MAX_SAVE_CHARS = 65_536` checked before parse; bounded version sniff; oversized recognised as `future-version` (`src/persistence/save.ts:65,331-411`) | closed |
| T-06-05 | Tampering | forged credits/equipment/cargo/market/pose in a v2 blob | high | mitigate | `z.strictObject` schemas, allow-lists, integer/magnitude bounds, 17-key market set, finite pose, orientation length `(0, 4]`, single `validateSaveSemantics` returning `false` rather than throwing (`src/persistence/save.ts`) | closed |
| T-06-06 | Data loss | future-version or corrupt blob cleared/replaced | high | mitigate | Version > 2 stays `future-version` and untouched; only recognised v1/v2 is `corrupt` and backed up via `boundCorruptBackup` (`save.ts:633`); `isEncodedSaveValid` gates every write (`autosave.ts:153`) | closed |
| T-06-07 | Tampering | market snapshot with unknown/duplicate goods or mismatched system | medium | mitigate | Separate 17-key `marketGoods` allow-list, uniqueness check, `market.systemId === save.system.id`, and single-seed rule (`save.ts:521-537`) | closed — below high threshold |
| T-06-08 | Tampering (XSS) | system name rendered in the overlay | high | mitigate | Every dynamic string uses `textContent`; no `innerHTML`/`insertAdjacentHTML` in `src/ui/`; names come from validated content (`src/ui/chart.ts:146-152`) | closed |
| T-06-09 | Tampering | forged click/arrow selection bypassing the action layer | low | mitigate | Selection lives in the pure model/session; markers are non-focusable canvas pixels; the session resolves ids against `galaxyById` (`src/app/game-session.ts:283`) | closed — below high threshold |
| T-06-10 | Denial of Service | 256 labels / 875 edges repainted per frame on SwiftShader | medium | mitigate | Paint on open, selection, range and resize only; the sim/render loop is suspended while the chart is open; no `requestAnimationFrame` loop (`src/ui/chart-draw.ts`, `src/ui/chart.ts`) | closed — below high threshold |
| T-06-11 | Data loss | arrival/launch autosave over a future or unreadable blob | high | mitigate | Every write goes through `canOverwrite(saveStatus)` (`game-session.ts:813,932`) and `queueAutosave`'s `isEncodedSaveValid`; future/unreadable blobs stay byte-identical | closed |
| T-06-12 | Tampering | forged/unknown target system id | medium | mitigate | Targets resolve only through the `galaxyById` map built from validated content; unknown ids are refused before any scene swap and the save allow-list validates on read | closed — below high threshold |
| T-06-13 | Data loss | half-swapped scene on arrival/restore failure | high | mitigate | Validate and resolve first, build with `enterSystemById` before retiring the old scene, then install state/profile/market/target in one synchronous block (`game-session.ts:1193-1215,1699`) | closed |
| T-06-14 | Tampering | duplicated jump events / countdown in the wrong mode | medium | mitigate | `beginHyperspace` gated on `modeAtStart === "inFlight"`, one commit event plus `terminalTransition`, snapshot revalidated at commit (`src/sim/flight/step.ts:96-284`) | closed — below high threshold |
| T-06-15 | Data loss | manual Save overwriting the only slot | high | mitigate | Save asks for confirmation before overwriting a committed slot, the safe action takes focus, and the same `autosave` key plus revision queue are used (`src/ui/save-load.ts:234`, `game-session.ts:1049-1070`) | closed |
| T-06-16 | Data loss | failed in-session Load leaving a half-swapped session | high | mitigate | Parse/validate first, resolve and build the scene once, install in one synchronous block; failure returns before any mutation (`game-session.ts:1180-1230`) | closed |
| T-06-17 | Tampering | save/load actions leaking into flight or station contexts | medium | mitigate | Dedicated `saveScreen` context; actions scoped to it; F2 gated on live docked mode; F2 reserved (`src/input/keyboard.ts:119-297`) | closed — below high threshold |
| T-06-18 | Data loss / Tampering | reload rerolling a persisted market | high | mitigate | Snapshot persisted and restored verbatim; the e2e proof compares all 17 goods before/after reload and after a second reload; the seed is unused when the snapshot exists (`tests/e2e/hyperspace.spec.ts`) | closed |
| T-06-19 | Tampering | future fixture still using version 2 | medium | mitigate | Future fixtures moved to version 3; a corrupt-v2 case proves v2 is current; oversized version 3 still classifies as future and stays byte-identical (`tests/e2e/autosave.spec.ts:729,955,1047`) | closed — below high threshold |
| T-06-SC | Tampering | npm/pip/cargo installs | high | mitigate | Package-legitimacy gate not triggered: no `package.json`/`package-lock.json` change in `54ecd65..HEAD`; no new dependency added by the phase | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-06-01 | T-06-03 | `fnv1a32` arrival hashing is deterministic by design and is not a security control; no secret or authorization decision depends on it | Phase 6 threat model (06-01 plan) | 2026-11-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-06 | 20 | 20 | 0 | gsd-execute-phase orchestrator (L1 verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-06
