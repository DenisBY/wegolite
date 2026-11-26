---
phase: "22"
slug: "initial-population"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-26"
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Pinned Oolite checkout → dev-only recorder | `tools/ai-harness` runs `oolite-populator.js` in `node:vm` to record fixtures | Upstream script text, hash-checked before any run |
| Compiled content and fixtures → simulation | the populator reads catalogue records, neighbourhood facts and recorded draws | Game data; malformed values must not throw or loop |
| Simulation → browser session | `createSystemPopulate` runs inside the arrival install | Planned groups and ship kit; must stay total and atomic |
| Developer machine → remote test machine | Oolite reference container runs steps files and a probe OXP | Steps, probe world script, logs; outputs stay outside the repository |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-22-01 | Tampering | `recordPopulation` reading a modified `oolite-populator.js` and committing wrong fixtures | medium | mitigate | `POPULATOR_SCRIPT_SHA256` checked before any run (`PopulatorPinError`); the hash is in every fixture header; the rerun test proves the refusal | closed |
| T-22-02 | Information disclosure | harness code or its sentinel shipped in the bundle (licence and scope) | medium | mitigate | `tests/guards/harness-isolation.test.ts` directory scope, `AI_HARNESS_SENTINEL` on every vm global, `npm run check:dist` | closed |
| T-22-03 | Elevation of privilege | `node:vm` running the script (vm is not a security boundary) | low | accept | dev-only, the operator's own pinned checkout, one fixed relative path through `readPinned`, `ENTRY_TIMEOUT_MS` per entry; never run in CI or at runtime | closed |
| T-22-SC | Tampering | npm/pip/cargo installs | low | accept | no package is installed or changed (RESEARCH "Package Legitimacy Audit": none) | closed |
| T-22-28 | Tampering | a selector that silently drops a rare formula branch (no bottleneck, no isolated system, one galaxy) and so leaves a port error untested | medium | mitigate | the selection is checked by the self-test from the fixtures alone (every D-04 stratum and anchor), and each entry carries its reasons | closed |
| T-22-29 | Denial of service | fixture growth past the repository's size expectation (D-04 "hundreds of KB") | low | mitigate | the 1,000,000-byte acceptance check and the recorded compaction rule (base-36 draws, then third seeds of duplicated cells) | closed |
| T-22-07 | Denial of service | unbounded group-record growth after kills (records of dead groups) | medium | mitigate | `pruneEmptyGroups` in `commitWorld`; the fast-check invariant `groups.length <= live` | closed |
| T-22-08 | Tampering | a wider parser accepting malformed records | low | mitigate | only the count bound widens; the id, ascending and duplicate checks of the strict parser and `sanitizeGroups` are unchanged and re-tested at 256 and 257 | closed |
| T-22-04 | Denial of service | `buildNeighbourhood` throwing on a malformed record inside the arrival install block | medium | mitigate | malformed records dropped before `chartDistance`; fast-check totality property | closed |
| T-22-05 | Tampering | a malformed `hyperspace_motor` value compiled silently | low | mitigate | `boolExtra` fails the build on a non-boolean; strict schema `z.boolean()`; refusal test | closed |
| T-22-06 | Tampering | the new field moving the frozen inert world | high | mitigate | the inert path reads eight fields of the nine keys only; `tests/sim/world/inert-isolation.test.ts` and `inert-records-nine.json` unchanged and run in Task 1's verify; remote 20-seed run | closed |
| T-22-09 | Denial of service | a non-finite or huge rate (the compounding courier quirk, NaN) giving an unbounded count | medium | mitigate | non-finite rates count 0; every count clamped to `MAX_ENTITIES` before any loop; fast-check totality property | closed |
| T-22-10 | Tampering | prototype-key lookups on entry names, tags or roles (`constructor`, `__proto__`) | medium | mitigate | `===` over frozen arrays, `Object.hasOwn` for tag codes, a RangeError for an unknown tag at the module boundary | closed |
| T-22-11 | Tampering | a role or key such as `constructor` or `__proto__` reaching an object lookup in the pick or escort walk | medium | mitigate | `===` over arrays only, `parseRoleToken` as the inert path uses it, fast-check with prototype-named roles | closed |
| T-22-12 | Tampering | a builder reading a record's missile count (CBT-19 scope) | medium | mitigate | `PopulationRecord` has no missile member; `tests/guards/npc-missiles-tripwire.test.ts` in every task's verify | closed |
| T-22-30 | Tampering | a cut write (the courier's `heatInsulation`, the opportunist's `switchAI`) reaching a planned ship field | low | mitigate | cut writes live only in `POPULATOR_CUTS`; `PlannedPopShip` has no such member; the replay asserts the cut in the fixture; the Task 1 negative grep | closed |
| T-22-31 | Repudiation | a FIDELITY excerpt that no longer matches the pinned source, so a divergence is recorded against the wrong text | low | mitigate | `tests/contract/fidelity.test.ts` with `OOLITE_SRC` compares every excerpt verbatim (Task 2 verify) | closed |
| T-22-13 | Denial of service | an unbounded group size from malformed facts (a huge tech level in `ceil(TL / 6)`) | medium | mitigate | sizes clamped to 1..64 before any loop, escorts capped at 16; fast-check totality | closed |
| T-22-14 | Tampering | a cut write (missiles, ECM, shield booster) silently reaching a ship field | low | mitigate | cut writes live only in `POPULATOR_CUTS`; `PlannedPopShip` has no such member; the missiles tripwire in verify | closed |
| T-22-15 | Tampering | a partial group entering the world after a mid-group refusal | medium | mitigate | trial spawn into a scratch world before the real one; skip whole; property "never a partial group" | closed |
| T-22-16 | Denial of service | an unbounded rejection loop or an oversize population exhausting the store | medium | mitigate | `MAX_PLACEMENT_TRIES`, `POPULATION_ENTITY_LIMIT`, the `MAX_WORLD_GROUPS` check, fast-check over full stores | closed |
| T-22-17 | Tampering | the live populator relying on the pod-kind fallback (wrong goods in pods) | low | mitigate | `cargo` and `cargoKind` named together in every `SpawnInit`; the guard's allow-list unchanged (here); the runtime check over sample worlds (plan 22-11) | closed |
| T-22-32 | Repudiation | the pod-kind todo closed while some builder context still falls back to the role-family kind, hiding wrong goods in pods | low | mitigate | the runtime check over Lave, the largest anarchy, Oresrati and every fixture system at epochs 1 to 3 must pass before the `git mv`; `INERT_PATH_FILES` unchanged (acceptance criterion with guard mutation) | closed |
| T-22-18 | Repudiation | the census golden regenerated to make a later failing test pass | medium | mitigate | writer header and plan rule (run once; a moved value is a finding); the test recomputes from the production path and compares | closed |
| T-22-19 | Denial of service | the census too slow for the unit gate on the slow machine | low | mitigate | default run limited to epochs 1 to 4 (or 1 to 2, recorded); the full 20 epochs behind `POPULATION_CENSUS_FULL=1`, run once and recorded | closed |
| T-22-20 | Denial of service | a throwing populate inside the arrival install (rule ii) | medium | mitigate | `populateSystemWorld` is total (22-10 property); the closure guards missing getters and malformed galaxies; traffic.test cases | closed |
| T-22-21 | Repudiation | a re-pin without a measured cause, or of an owner-reserved pin | high | mitigate | Phase 21 D-04 conditions applied per value; the SUMMARY lists old, new and cause; the acceptance criteria check the epoch pins and acceptance files did not move | closed |
| T-22-22 | Denial of service | an unrequested hostile or a collision in an opt-in spec's scripted geometry making the suite flaky | low | mitigate | ships are inert (`ai: null`, no fire); each spec's fixture adapted through existing hook arguments; no fixed sleeps | closed |
| T-22-23 | Repudiation | a browser re-pin that hides a Node/browser divergence | high | mitigate | condition (2): every twin re-pinned to the Node value of 22-13; a difference stops the plan; the acceptance criterion compares the two literals | closed |
| T-22-24 | Repudiation | counters read before render or from a blank frame giving a false pass | medium | mitigate | settled reads after every realised key's assets downloaded; `withinBudget` fails on 0; calls must be at least the key count | closed |
| T-22-25 | Tampering | a silent budget raise or traffic cut to pass | high | mitigate | budget constants pinned by acceptance criteria; the stop rule for any read above budget; the prohibition | closed |
| T-22-26 | Information disclosure | Oolite logs, screenshots, the probe OXP or a scenario save committed (licence, OXP scope) | medium | mitigate | probe and outputs outside the repository; the wrapper refuses an in-repo output directory; the acceptance criterion checks `git status` | closed |
| T-22-27 | Elevation of privilege | steps or probe content executed on the remote machine | low | accept | the operator's own machine and image; the steps grammar is validated before anything runs; the probe is a world script in Oolite's sandbox | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Evidence (L1, grep depth, 2026-11-26): every `mitigate` control named above is present at HEAD (`POPULATOR_SCRIPT_SHA256`/`PopulatorPinError`, `AI_HARNESS_SENTINEL`, `pruneEmptyGroups`, `clampGroupSize`, `MAX_PLACEMENT_TRIES`, `POPULATION_ENTITY_LIMIT`, `POPULATOR_CUTS`, `boolExtra`, `withinBudget`, the run-remote.sh in-repo output refusal) and its test or guard ran green in the remote phase-gate `verify-full` at 2d7dee83. No `src/sim/world/population/` module reads `missiles` or `maxMissiles` (comments only). No `.oxp/`, `Latest.log` or `.oolite-save` file is tracked. Each plan's SUMMARY reports "Threat Flags: None".

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-03 | dev-only, the operator's own pinned checkout, one fixed relative path through `readPinned`, `ENTRY_TIMEOUT_MS` per entry; never run in CI or at runtime | plan-time threat model (Phase 22 plans) | 2026-11-26 |
| AR-22-02 | T-22-SC | no package is installed or changed (RESEARCH "Package Legitimacy Audit": none) | plan-time threat model (Phase 22 plans) | 2026-11-26 |
| AR-22-03 | T-22-27 | the operator's own machine and image; the steps grammar is validated before anything runs; the probe is a world script in Oolite's sandbox | plan-time threat model (Phase 22 plans) | 2026-11-26 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-26 | 33 | 33 | 0 | /gsd-secure-phase 22 (orchestrator, L1 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-26
