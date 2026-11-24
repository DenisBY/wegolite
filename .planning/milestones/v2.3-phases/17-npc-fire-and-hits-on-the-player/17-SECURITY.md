---
phase: "17"
slug: "npc-fire-and-hits-on-the-player"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-19"
---

# Phase 17 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Wegolite is a static client with no backend, no auth and no network writes; this phase adds NPC fire inside the deterministic simulation. Its threats are integrity threats (determinism, oracle independence, the save-taint rule) and test-hook exposure, not classic web threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Test hook (`?test=1`) → session | `spawnTestAttacker` and the fire-capable test pilots are reachable only through the test hook | no arguments in, a boolean out; the session is tainted and never saved |
| Simulation → probe / page | the probe publishes combat and HUD values to the page | player gauges and counters; no entity ids |
| Independent oracle → port | the fire and heat oracles must not read or import port code | fixture values only, re-derived by the self-tests |
| Simulation state → hash and save | weapon temperature, missed-shot counters and the RNG stream feed the world hash | bounded finite numbers; a fixed draw count per gate |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-17-01 | Tampering | oracle files importing or reading Wegolite code, or the author reading the port design | high | mitigate | tests/guards/oracle-independence.test.ts | closed |
| T-17-02 | Repudiation | an expected value bent to agree with someone's expectation | medium | mitigate | tests/oracles/npc/fire/fire.self.test.ts re-derives every value | closed |
| T-17-03 | Tampering | oracle reading or importing port code, or the author reading the port design | high | mitigate | tests/guards/oracle-independence.test.ts | closed |
| T-17-04 | Tampering | the derive change silently moving a Phase 14 expectation | medium | mitigate | tests/oracles/npc/pursuit/pursuit.self.test.ts unedited | closed |
| T-17-05 | Elevation of privilege | a firing decision source (a pilot builder or an AI record) reachable from ordinary play | high | mitigate | tests/guards/fire-decision-source.test.ts; populate.test.ts:536 ai null | closed |
| T-17-06 | Repudiation | a deferred fidelity fix forgotten when its trigger arrives | medium | mitigate | kill-credit-consumers, ship-hit-consumers, on-event-handlers guards | closed |
| T-17-07 | Tampering | a vacuous guard that never fails | medium | mitigate | non-vacuity cases in the guards; tests/guards/source-scan.ts | closed |
| T-17-08 | Denial of service | the gate, onTarget or cooling throwing on malformed numbers (outside AI fault containment) | high | mitigate | tests/sim/npc/fire.property.test.ts | closed |
| T-17-09 | Tampering | a non-finite or out-of-domain temperature or counter reaching the hash | high | mitigate | fire.ts:358,372 clamp to MAX_WEAPON_TEMPERATURE; :383 MAX_UINT32 | closed |
| T-17-10 | Tampering | a drawn-value count drifting from Oolite's, shifting every later draw of the stream | medium | mitigate | gate fixtures + fire.property.test.ts draw-count stub | closed |
| T-17-11 | Elevation of privilege | an ungated NPC shot path (a request that resolves without the gate) | high | mitigate | combat/step.ts:270 npcFireBlocked before npcFireGate; npc-fire.test.ts | closed |
| T-17-12 | Denial of service | a request or think flood (per-tick thinks, beam rate) | medium | mitigate | npc-fire.test.ts:429,1274 aiDropped 0 | closed |
| T-17-13 | Tampering | pins edited to make a red test pass | medium | mitigate | tick-parity twin literals equal combat.spec.ts | closed |
| T-17-14 | Information disclosure | entity ids reaching the page through the probe | low | mitigate | tests/guards/entity-id-scope.test.ts | closed |
| T-17-15 | Elevation of privilege | a ship firing without opting in (a populated ship, or a pilot without the key) | high | mitigate | test-pilot.ts:137 params.fire gate; tests/sim/npc/fire-route.test.ts | closed |
| T-17-16 | Tampering | a forged `fire: true` param in a snapshot | low | accept | accepted, see log | closed |
| T-17-17 | Tampering | two requests from one ship in one tick merged into one draw | medium | mitigate | tests/sim/npc/fire-route.test.ts; requestFire de-dup | closed |
| T-17-18 | Tampering | a frozen world drifting because a hot read or the sniper restructure is not a no-op at temperature 0 | high | mitigate | frozen anchors, world-cadence; remote 20-seed run 21/21 at 7e7e7a6 | closed |
| T-17-19 | Denial of service | a non-finite temperature reaching a comparison | low | mitigate | limits.ts:133 bound; tests/sim/npc/steering.property.test.ts | closed |
| T-17-20 | Repudiation | kill credit in a same-tick mutual kill differing from Oolite | low | accept | accepted, see log | closed |
| T-17-21 | Denial of service | a random fight or steering context throwing outside AI containment | high | mitigate | kill.property.test.ts, steering.property.test.ts | closed |
| T-17-22 | Elevation of privilege | the attacker reachable outside `?test=1` | high | mitigate | probe-publisher.ts:299 hook member, bound under ?test=1 only; fire-decision-source guard | closed |
| T-17-23 | Tampering | malformed input to the hook | low | mitigate | probe-publisher.ts:238 spawnAttacker preconditions before taint | closed |
| T-17-24 | Tampering | a hostile ship made durable by an autosave | high | mitigate | probe-publisher.ts markHookMutation; save-controller.ts:260,297 tainted skip | closed |
| T-17-25 | Information disclosure | an entity id leaving the sim through the hook | medium | mitigate | boolean return; entity-id-scope guard | closed |
| T-17-26 | Tampering | cost, heat or `lastShotTick` written for a shot that never resolves (a null `npcLaserRay` ray), or the gate indexing `LASER_STATS` with a malformed laser key (Pitfall 16) | medium | mitigate | npc-fire.test.ts (non-mount key, null ray) | closed |
| T-17-27 | Tampering | a ship with no AI (a think throw nulled it) or targeting itself reaching the gate and drawing where Oolite never would | medium | mitigate | fire.ts:285 npcFireBlocked; fire.test.ts:243-249 noAi, selfTarget | closed |
| T-17-28 | Tampering | a fixture bent or a tolerance widened to make the port pass | medium | mitigate | fixtures unchanged by port plans; oracle disputes in SUMMARY | closed |
| T-17-29 | Tampering | the runner change moving a Phase 14 expectation | medium | mitigate | emptyHooks() unchanged; Phase 14 oracle consumers green | closed |
| T-17-30 | Tampering | `gate.json`, `heat.json` edited to agree with the port (the port validating itself) | high | mitigate | oracle-independence guard; fire.self.test.ts | closed |
| T-17-31 | Repudiation | a locked decision (D-07) revised without a trace | medium | mitigate | 17-CONTEXT.md D-07 note names owner, date, UAT test 1 | closed |
| T-17-32 | Tampering | twin or browser literals edited to pass (self-validation) | high | mitigate | combat.spec.ts TWIN_* equal tick-parity.test.ts (17-REVIEW-GAPS) | closed |
| T-17-33 | Tampering | the player's laser period changed through the shared `LASER_STATS` | medium | mitigate | fire.ts:175 NPC_RECHARGE_TICKS own table; combat/constants.ts untouched | closed |
| T-17-34 | Tampering | an oracle fixture edited in the port plan | high | mitigate | tests/oracles/** changed only by 17-11 (and docs-only review fixes) | closed |
| T-17-35 | Denial of service | ordinary play or the frozen worlds changed by the period | medium | mitigate | remote QUAL-11 run vs 17-04 baseline (17-12-SUMMARY) | closed |
| T-17-36 | Information disclosure | `probe.hud.shieldFwd`, `shieldAft`, `energyBanks` | low | accept | accepted, see log | closed |
| T-17-37 | Tampering | a spec expectation computed by the code under test (a self-validating assertion) | medium | mitigate | combat.spec.ts states dial rules with Oolite citations | closed |
| T-17-38 | Tampering | probe-shape drift breaking the frozen probe contract | medium | mitigate | tests/fixtures/probe-shape.json, probe-shape-compare.test.ts, probe-shape.spec.ts | closed |
| T-17-39 | Tampering | the probe aliasing the drawn model's banks array | low | mitigate | probe-publisher.test.ts:920 not.toBe model banks | closed |
| T-17-SC | Tampering | npm/pip/cargo installs | low | accept | accepted, see log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

T-17-SC is in every plan's register; it is listed once.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-17-01 | T-17-16 | world snapshots are not persisted in saves; a forged key only makes a test pilot fire through the same gate | plan threat model (owner-approved plans) | 2026-11-19 |
| AR-17-02 | T-17-20 | recorded divergence (D-10 row), pinned by a scenario, guarded by the kill-credit tripwire | plan threat model (owner-approved plans) | 2026-11-19 |
| AR-17-03 | T-17-36 | the player's own gauges, already drawn on screen; no entity id or save data | plan threat model (owner-approved plans) | 2026-11-19 |
| AR-17-04 | T-17-SC | no package installed or changed in the phase | plan threat model (owner-approved plans) | 2026-11-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-19 | 40 | 40 | 0 | /gsd-secure-phase (orchestrator, ASVS L1 grep-depth; auditor skipped by the short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-19
