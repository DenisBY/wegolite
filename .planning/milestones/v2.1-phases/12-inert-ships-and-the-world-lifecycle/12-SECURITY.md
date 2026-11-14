---
phase: "12"
slug: inert-ships-and-the-world-lifecycle
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-14"
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Save store to session | A saved game read from IndexedDB, possibly hand-edited | epoch, nextEntityId, flight state |
| Content to runtime | Generated NPC catalogue and model paths loaded at start-up | ship records, masses, radii, glb paths |
| Build to production bundle | Build-time traffic define and the e2e build config | traffic default |
| URL to test flags | Query flags honoured only under the test hook | traffic, clock |
| AI module to world step | An AI module that may throw inside the fixed step | module call, events |
| Spawn input to world store | Entity init data handed to spawnEntity | position, orientation, params |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | DoS | AI module call in the world step | high | mitigate | try/catch around the module call; the catch sets ai = null and emits aiFaulted (step.ts); step.test.ts | closed |
| T-12-02 | Info disclosure | aiFaulted event payload | low | mitigate | catch without a binding; the event carries only id and site; step.test.ts asserts a secret is absent | closed |
| T-12-03 | DoS | spawnEntity input | high | mitigate | isMalformedInit typeof/isRecord guards run before any property read; spawn-refusal.test.ts (68 rows) | closed |
| T-12-04 | Tampering | spawn refusal and id counter | medium | mitigate | every refusal happens before store.allocate; nextId, live.length and rng.s unchanged (tests) | closed |
| T-12-05 | Tampering | ai.params keys | low | mitigate | forbidden key list, no `in` operator, Object.hasOwn; store.test.ts covers constructor, prototype, __proto__ | closed |
| T-12-06 | Tampering | traffic build-time define | high | mitigate | define true in the production config, false only in e2e/seams configs; pages.yml builds with npm run build; container-contract.test.ts pins it | closed |
| T-12-07 | Tampering | ?traffic= URL flag | medium | mitigate | test-flags.ts reads the flag only under the test hook; test-flags.test.ts and tick-hook.spec.ts | closed |
| T-12-08 | Repudiation | contributor docs for build:e2e | low | mitigate | AGENTS.md names build:e2e; contract test fails on an npm script that does not exist | closed |
| T-12-09 | DoS | mass-lock and blockage queries | medium | mitigate | linear walks over at most 256 live entities, one field per tick, no pair scan (ship-field.ts) | closed |
| T-12-10 | Tampering | ship mass input | medium | mitigate | massOf accepts only finite positive values; ship-field.test.ts | closed |
| T-12-11 | Info disclosure | jump refusal copy | low | mitigate | fixed copy from a two-value blocker; lastRefusal stores the reason only | closed |
| T-12-12 | Tampering | frozen flight hash pins | medium | mitigate | flight-hash pins and goldens unmodified in Phase 12 and passing | closed |
| T-12-13 | Tampering | compiled ship radius | medium | mitigate | ship-radius.ts fails on empty mesh, non-finite radius or a solid subentity | closed |
| T-12-14 | Tampering | generated content drift | medium | mitigate | assets:check in verify and verify-full; hand-written golden with independent float32 derivation | closed |
| T-12-15 | Tampering | NPC record schema | low | mitigate | strict object with radius positive; ships-npc.test.ts rejects 0, negative, NaN, Infinity | closed |
| T-12-16 | DoS | populator placement loops | high | mitigate | MAX_PLACEMENT_TRIES = 256 on every loop with a fallback flag; galaxy-0 sweep shows 0 fallbacks | closed |
| T-12-17 | Tampering | role and scan-class tokens | medium | mitigate | array comparisons with ===, no object keyed by role; tests use constructor, __proto__, toString | closed |
| T-12-18 | Tampering | populator content input | medium | mitigate | bad weight is 0, empty total draws nothing, unknown class dropped before any draw, refused spawns skipped | closed |
| T-12-19 | DoS | population size against the store cap | low | accept | 12 ships against MAX_ENTITIES 256; a storeFull refusal is skipped (see Accepted Risks Log) | closed |
| T-12-20 | DoS | catalogue load at start-up | high | mitigate | traffic.ts is synchronous and total; the catalogue loads in the boot Promise.all before any begin/resume | closed |
| T-12-21 | Tampering | NPC catalogue content | medium | mitigate | strict schema safeParse with the glb path pattern; a failed load reaches the boot failure surface | closed |
| T-12-22 | Tampering | saved nextEntityId | medium | mitigate | no restore path reads the saved counter; the anchor is rebuilt from the regenerated world (save-v3.test.ts, tampered 5000) | closed |
| T-12-23 | Info disclosure | entity ids outside the sim | low | mitigate | traffic.ts holds records and masses only; no EntityId outside src/sim; entity-id-scope guard passes | closed |
| T-12-24 | Tampering | NPC model path | medium | mitigate | asset cache re-tests the path pattern; path comes only from the validated catalogue; unknown key ignored | closed |
| T-12-25 | DoS | instanced layer capacity | medium | mitigate | NPC_INSTANCE_CAPACITY = 256, fixed allocation, extras dropped in order | closed |
| T-12-26 | DoS | shared geometry and material disposal | medium | mitigate | the layer disposes only its own InstancedMeshes; npc-ships.test.ts spies on shared dispose | closed |
| T-12-27 | Info disclosure | scanner contacts | low | mitigate | contacts copy five fields and no id; contacts.test.ts asserts the keys | closed |
| T-12-28 | DoS | failed NPC model | low | mitigate | a failed key is never re-requested and logs nothing (npc-models.test.ts) | closed |
| T-12-29 | Tampering | simulation behind the chart | medium | mitigate | the chart branch steps with no commands and a zero input frame (sim-driver.test.ts) | closed |
| T-12-30 | DoS | catch-up behind the chart | medium | mitigate | advanceBehind goes through the loop with MAX_FRAME_DELTA and MAX_STEPS_PER_FRAME | closed |
| T-12-31 | Tampering | game-loop reset inside a step | low | mitigate | reset generation counter; the loop returns 0 and the accumulator never goes negative | closed |
| T-12-32 | EoP | advanceTicks behind the chart | low | mitigate | still gated on the manual clock; refuses unless the mode is inFlight | closed |
| T-12-33 | Tampering | old world after a jump commit | medium | mitigate | PARTIAL: the old world is never stepped on the hyperspaceJumped tick; but a refused begin() (epoch at 0xfffffffe, reachable only with a hand-edited save) leaves the origin world installed (review finding WR-01) | open — below high threshold (non-blocking) |
| T-12-34 | DoS | traffic.spec route holds | low | mitigate | routes released in finally; every wait has a timeout (static reading) | closed |
| T-12-35 | Tampering | existing browser specs | medium | mitigate | traffic.spec opts in by URL only; tick-hook, budget and npc-assets specs unchanged since dcfe476 (static reading) | closed |
| T-12-36 | DoS | NPC requests before the first in-flight frame | medium | mitigate | loader ignores requests until open(), called once from the render driver after an in-flight frame is drawn | closed |
| T-12-37 | DoS | first-load transfer with traffic on | medium | mitigate | traffic.spec asserts zero NPC requests before the first in-flight frame and the 9,437,184-byte ceiling (8,839,791 measured; static reading) | closed |
| T-12-SC | Tampering | supply chain (no package installed) | high | accept | no dependency added in Phase 12; package.json gains only the build:e2e script; lockfile, Dockerfile and workflows unchanged (see Accepted Risks Log) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-19 | The populator spawns 12 ships against a store cap of 256; a storeFull refusal is skipped without a throw, so the worst case is a smaller population | plan-time disposition (accept), verified by the security auditor | 2026-11-14 |
| AR-12-02 | T-12-SC | No package, lockfile, Dockerfile or workflow was changed in Phase 12; package.json gains only the build:e2e script | plan-time disposition (accept), verified by the security auditor | 2026-11-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Open Items (non-blocking)

- **T-12-33 (medium).** The refused-begin() case at a hyperspace arrival: reachable only with a hand-edited save at epoch 4,294,967,294. Tracked in `.planning/todos/pending/2026-11-14-clear-world-when-arrival-begin-is-refused.md` and `12-REVIEW-DISPOSITION.md` (WR-01). Owner decision 2026-11-14: not fixed in Phase 12. Closes when WR-01 is fixed.
- Informational residuals that change no status: IN-02 (aiFaulted has no recorder), IN-03 (spawnEntity "never throws" does not cover a throwing accessor), IN-04 (a failed NPC model leaves an invisible obstacle).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-14 | 38 | 37 | 1 | gsd-security-auditor (HEAD 0936e83; 23 threat-relevant Vitest files, assets:check) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed (the one open threat is below the high threshold)
