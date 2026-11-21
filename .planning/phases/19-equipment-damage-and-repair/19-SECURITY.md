---
phase: "19"
slug: "equipment-damage-and-repair"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-21"
---

# Phase 19 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Scope: the changes from the phase base commit `7b15bb3` to HEAD `39f141a`. The app is a static client with IndexedDB saves and no backend. The register is the union of the `<threat_model>` blocks in the 15 plans; it was written when the plans were authored. Every SUMMARY `## Threat Flags` section reports no new surface (19-08-SUMMARY has none). ASVS level 1, block on `high`: classification is grep-level against the implementation and tests at HEAD.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| vendored plist -> content build | an authored value of the wrong kind could become a silent probability | `damage_probability`, `is_external_store` |
| per-step facts and hit amounts -> roll | amounts and facts may be non-finite or hostile after a corrupt restore or a bug | numbers, key lists |
| sim events -> profile operations | an event key or commodity is trusted only as far as the profile already holds it | equipment keys, commodities, amounts |
| app facts -> ledger | facts are read-only per step and may be absent; a tick may carry several player records | facts object |
| F3 row key -> money path | a row key is a plain string a caller could forge | `KEY@repair` strings, credits |
| catalogue record -> price arithmetic | validated data that must never reach arithmetic unchecked | prices, tech levels |
| IndexedDB blob -> parser | the stored string is untrusted, possibly hand-edited, oversized or older | untrusted JSON |
| snapshot -> writer gate | the writer must never replace a good blob with bytes the reader rejects | save bytes |
| test fixture -> IndexedDB | a fixture must be a blob the production writer could have written | save bytes |
| session -> probe | the probe is a read-only test surface on the page | profile copies |
| sim event -> app profile and HUD | HUD text is built from an event string | names |
| keyboard selection / `?test=1` hook -> profile | selection keys and hook grants are page-controllable strings | keys |
| Node twin <-> browser | pinned literals are the contract between the two runs | literals |
| documentation -> reviewers | FIDELITY.md and PROJECT.md are the evidence of faithfulness | text |
| future source change -> damaged-item behaviour | a first autopilot / galactic-jump / ANA consumer could ignore Oolite's damaged clause | source |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-19-01 | Tampering | malformed or negative `damage_probability` / `is_external_store` | medium | mitigate | fail-closed `SCHEMA` errors in `tools/oolite-ingest/convert/equipment.ts:60-88`; `damageProbability: z.number().min(0)` in `src/content/schemas/equipment.ts:31`; rejection cases in `tools/oolite-ingest/convert/equipment.test.ts:280-312` | closed |
| T-19-02 | DoS | `rollInternalDamage` on a huge finite amount | medium | mitigate | `MAX_INTERNAL_DAMAGE_ROLLS = 256` (`src/sim/combat/internal-damage.ts:79`), recorded as FIDELITY E-167; NaN, Infinity, 8224, 1e18 and 1e308 in `tests/sim/combat/internal-damage.property.test.ts:41-55` | closed |
| T-19-03 | Tampering | NaN/negative probabilities or capacities, duplicate keys | medium | mitigate | `internalDamageWork` keeps the first key, sanitises to 0 and copies (`internal-damage.ts:114-154`); "cannot damage the only item twice" (`tests/sim/combat/internal-damage.test.ts:464`) and the property suite | closed |
| T-19-04 | Tampering | `applyEquipmentDamaged` / `applyCargoDestroyed` with a bad key, commodity or amount | medium | mitigate | `isDamageableKey` refusal returns the same profile (`src/sim/player/damage.ts:32-36`), bounded amounts in `applyCargoDestroyed` (`damage.ts:55`); `tests/sim/player/damage.property.test.ts` keeps the lists disjoint and inside the set | closed |
| T-19-05 | DoS | both lists outgrowing the 64-key save bound | medium | mitigate | `purchase` counts both lists (`src/sim/player/profile.ts:234`); the save validator applies the same combined rule (`src/persistence/save.ts:619`) | closed |
| T-19-06 | Tampering | shared facts mutated by one record and seen later | medium | mitigate | one `internalDamageWork` copy per ledger call (`src/sim/combat/ledger.ts:216`); input facts never written; two-record cases in `tests/sim/combat/ledger.test.ts` | closed |
| T-19-07 | Info disclosure | damage events carrying an entity id | low | mitigate | payloads carry a key, a commodity and an amount only; `tests/guards/entity-id-scope.test.ts` unchanged | closed |
| T-19-08 | EoP | forged `...@repair` key reaching `applyRepair` | high | mitigate | `REPAIRABLE_EQUIPMENT_KEYS` is the damageable literal, pinned by `tests/guards/damageable-equipment.test.ts`; strict `parseRepairFitKey`, `notOffered`/`notDamaged` before arithmetic in `checkRepair` (`src/sim/player/outfitting.ts:799-827`), re-check inside `applyRepair` (`outfitting.ts:855-876`); forged-key table in `tests/sim/player/outfitting.test.ts` | closed |
| T-19-09 | Tampering | NaN, fractional or overflowing repair price or credits | high | mitigate | `isValidPrice` on the catalogue and the halved price (`outfitting.ts:344-346`), `isSafeCredits` (`outfitting.ts:303`); totality property in `tests/sim/player/damage.property.test.ts` | closed |
| T-19-10 | Tampering | buying a second copy of a damaged item | medium | mitigate | `canPurchase` refuses `damaged` (`src/sim/player/profile.ts:201`), `purchase` returns identity (`profile.ts:230`); disjointness property | closed |
| T-19-11 | Tampering | forged `damagedEquipment` or `equipment` in a save | high | mitigate | `damagedEquipment` bounded by `MAX_SAVE_DAMAGED_EQUIPMENT` (`src/persistence/save.ts:300-302`); SAVE-09 duplicate, damageable, disjoint and combined-64 rules in the shared reader/writer stage (`save.ts:608-619`) with `equipmentAllowLists`; contract table in `tests/persistence/save-v5.test.ts` | closed |
| T-19-12 | DoS | oversized blob or list | medium | mitigate | `MAX_SAVE_CHARS` before `JSON.parse` (`save.ts:102,501,734`); 16-key bound; measured worst case under the cap (46,796 characters, 19-08-SUMMARY) | closed |
| T-19-13 | DoS | an old save classified `unreadable`, disabling saving | high | mitigate | every older version is `corrupt`, backed up once and cleared by New game (`save.ts:26-28,67`); classification case over every historical golden; browser journey (19-06-SUMMARY) | closed |
| T-19-14 | Tampering | page mutating the profile through an aliased probe array | low | mitigate | publisher copies the list (`src/app/session/probe-publisher.ts:156`); Node mutation test | closed |
| T-19-15 | Repudiation | browser proof resting on a hand-written blob | medium | mitigate | fixtures go through `encodeSave`; the contract table runs every forged list through the reader and the writer gate (19-09-SUMMARY) | closed |
| T-19-16 | Tampering | HUD text from an event string | low | mitigate | names from the validated catalogues with a key fallback; 60-character budget in `tests/guards/hud-message-length.test.ts`; drawn as text | closed |
| T-19-17 | Repudiation | message printed for damage the commit did not apply | low | mitigate | `damageFlow` prints only when its own `commitProfile` returned true (`src/app/session/event-router.ts:632-656`); refused-event cases in `tests/app/session/event-router-damage.test.ts` | closed |
| T-19-18 | DoS | rebuilding facts 120 times a second | low | mitigate | identity cache (`src/app/session/sim-driver.ts:136`); shared-object cases in `tests/app/session/step-options.test.ts` and `sim-driver.test.ts` | closed |
| T-19-19 | Tampering | guessed probability while the catalogue loads | medium | mitigate | facts absent until both catalogues load (`src/app/session/step-options.ts:86-108`); absence case in `tests/app/session/step-options.test.ts` | closed |
| T-19-20 | EoP | repair key reaching `applyFit`, or buy key reaching `applyRepair` | high | mitigate | `parseRepairFitKey` first, routed only to `confirmRepair` (`src/app/session/station-controller.ts:456-500`); forged `EQ_ECM@repair` shows "Not offered" (`tests/app/session/station-controller.test.ts`) | closed |
| T-19-21 | Tampering | test hook granting a damaged, 65th, laser or unrepairable key | medium | mitigate | `applyTestEquipment` grants only `SINGLE_INSTANCE_KEYS`, refuses a damaged key and counts both lists (`probe-publisher.ts:34,338-342`); hook mutations taint the session (`probe-publisher.ts:90,170`) | closed |
| T-19-22 | Repudiation | twin literal fitted to the code or an old literal edited | medium | mitigate | scan table recorded; existing 15-04/16-06 literals untouched with guard greps 8 and 7; Node equals browser (19-13-SUMMARY:344-359) | closed |
| T-19-23 | Repudiation | silent divergence or a non-verbatim Oolite excerpt | medium | mitigate | contract test in both modes; exact Key Decisions quotes (FIDELITY E-167); open items list what is not ported (19-14-SUMMARY) | closed |
| T-19-24 | Repudiation | refusal case lost or turned into an accept during the chain removal | medium | mitigate | "Removed and rebased cases" ledger (19-06-SUMMARY:90); goldens byte-identical; `src/persistence/**` coverage floor | closed |
| T-19-25 | Repudiation | browser refusal case passing because of an older version | medium | mitigate | four cases rebased on current-version blobs plus a control; no v1/v2 blob left (19-07-SUMMARY) | closed |
| T-19-26 | Tampering | browser fixture the production writer could not write | low | mitigate | `encodeSave(saveInputs(...))` fixtures, strict boot reader, no hook mutation (19-07-SUMMARY) | closed |
| T-19-27 | Repudiation | damaged docking computer, galactic drive or ANA that keeps working | low | mitigate | tripwire `tests/guards/damaged-equipment-in-use.test.ts` naming todo `2026-11-21-damaged-equipment-in-use.md` and Oolite's clause; its limit is documented in the guard and the todo | closed |
| T-19-28 | Tampering | read-mode alias tolerance becoming live leniency again | low | mitigate | writer gate refuses an alias; `tests/guards/legacy-equipment-alias.test.ts` fails on a first new consumer and names todo `2026-11-21-retire-legacy-equipment-alias-read-tolerance.md` | closed |
| T-19-SC | Tampering | npm/pip/cargo installs | low | accept | no package installed or changed (RESEARCH Package Legitimacy Audit: none) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-19-01 | T-19-SC | No dependency is installed or changed in Phase 19; the supply-chain surface is unchanged from Phase 18 | plan authors (all 15 plans) | 2026-11-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-21 | 29 | 29 | 0 | /gsd-secure-phase (orchestrator, ASVS L1 grep-level; auditor skipped by the short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-21
