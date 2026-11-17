---
phase: "16"
slug: wreckage-cargo-and-the-entity-cap
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-17"
---

# Phase 16 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail. The auditor's per-threat evidence (file and line, pinning test) is in the audit of 2026-11-17; the declared mitigations are in each `16-0N-PLAN.md` `<threat_model>`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Local Oolite checkout to the repository | `scripts/vendor-oolite.sh` copies 14 debris models and textures from the pinned commit's blobs | bytes with provenance, checked by SHA-256 against the pinned list and `CHECKSUMS.sha256` |
| Compiled catalogues to the client | `ships-debris.json`, `explosions.json` and `boundingBox` on `ships-npc.json` are fetched and parsed at load | strict-schema parsed JSON, treated as untrusted |
| Debris content to the simulation | `CombatOptions.debris` carries pod, plate and wreck content into `releaseDebris` | finite, bounded numbers; spawn keys |
| Simulation to render | `shipDestroyed` and `debrisContacts` feed the explosion and debris layers | position and radius only, never an entity id |
| Test hook to the world | `spawnTestShooter(cargo?)` | a cargo count, refused outside 0 to 200, always taints the session |

The project has no network surface beyond same-origin static files and no database.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-16-01 | Tampering | vendor script | high | mitigate | full pinned SHA, bytes from `git cat-file blob`, per-file digest check, committed digests never change | closed |
| T-16-02 | Tampering | vendor script paths | medium | mitigate | absolute and `..` paths refused; fixed targets | closed |
| T-16-03 | Repudiation | vendoring run | low | mitigate | digests written only by the script; run recorded in the SUMMARY; owner accepted OC-7 | closed |
| T-16-04 | DoS | debris release | high | mitigate | pod limit, cargo cap 200, per-piece gates at 243.2 and 128, `storeFull` refusal | closed |
| T-16-05 | Tampering | debris velocity | high | mitigate | clamp at every velocity write, velocity domain check in `spawnEntity` | closed |
| T-16-06 | DoS | release totality | high | mitigate | no throw path; lookups guarded | closed |
| T-16-07 | Info disclosure | release events | low | mitigate | `releaseDebris` takes no event list; id-scope guard | closed |
| T-16-08 | Tampering | debris catalogue | high | mitigate | strict schema, loader parse, GLB path re-check before fetch | closed |
| T-16-09 | Tampering | public assets | medium | mitigate | `assets:check` drift gate, SHA-256 of every public file in `ASSETS.md` | closed |
| T-16-10 | EoP | legacy material rule | low | mitigate | rule limited to five wreck keys | closed |
| T-16-11 | Tampering | wreck burn-down | high | mitigate | energy floored at 0 in the write; idempotent `killShip` | closed |
| T-16-12 | DoS | octree sampling | medium | mitigate | fixed octant walk, fixed depth, no recursion | closed |
| T-16-13 | Tampering | blast kick | high | mitigate | clamp per component | closed |
| T-16-14 | DoS | scan and pair cost | low | accept | debris filtered from the test pilot scan; revisit if the cap rises | closed (accepted) |
| T-16-15 | Tampering | explosion catalogue | high | mitigate | strict schema, texture name pattern | closed |
| T-16-16 | Tampering | hull bounding box | medium | mitigate | finite values, min <= max | closed |
| T-16-17 | EoP | sim imports content | low | mitigate | ESLint ban on `**/content/explosions*` in the sim | closed |
| T-16-18 | Tampering | hook cargo argument | medium | mitigate | taint before the world is touched; domain checks | closed |
| T-16-19 | Tampering | live and replay content | medium | mitigate | one builder; boot failure is visible | closed |
| T-16-20 | Info disclosure | traffic content | low | mitigate | static content keyed by spec key; boolean hook result | closed |
| T-16-21 | Info disclosure | router arm | medium | mitigate | reads position and radius only; throwing-getter test | closed |
| T-16-22 | DoS | explosion pool | medium | mitigate | pool of 8, at most 10 particles, 2 instanced meshes | closed |
| T-16-23 | Tampering | particle texture URL | low | mitigate | name pattern checked before the URL is built | closed |
| T-16-24 | Tampering | render randomness | high | mitigate | seeded from the event, no sim stream | closed |
| T-16-25 | Info disclosure | debris contacts | medium | mitigate | contacts are id-free copies | closed |
| T-16-26 | Tampering | debris model paths | low | mitigate | path pattern, re-check, no retry of a failed key | closed |
| T-16-27 | DoS | debris instancing | medium | mitigate | one mesh per (model, primitive), capacity 256 | closed |
| T-16-28 | DoS | cold start | medium | mitigate | no debris or particle asset before the first in-flight frame; byte ceiling holds | closed |
| T-16-29 | Repudiation | divergences | medium | mitigate | fidelity contract: each divergence names a Key Decisions row | closed |
| T-16-30 | Tampering | hash with layers on | high | mitigate | browser hash equals the Node twin (`a10b2dfc`) | closed |
| T-16-31 | DoS | hull mass bound | medium | mitigate | `NpcShipSchema.mass` capped at `MAX_FLIGHT_MAGNITUDE_BOUND` (1e12), so the alloy count stays at most about 114; test `rejects a mass above the flight magnitude bound`. Found by the audit as W-1 and fixed in the same close-out | closed |
| T-16-SC | Tampering | supply chain | low | accept | no dependency or build-infrastructure change in plans 16-01 to 16-09 | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-16-01 | T-16-14 | Scan and pair cost with hundreds of debris pieces was measured only at a few pieces; debris is filtered from the test pilot scan and the proximity pass returns early for AI-less massless pairs. Revisit with a measurement if a later phase raises the entity cap | phase plan 16-04 | 2026-11-17 |
| AR-16-02 | T-16-SC | No dependency or build-infrastructure change in this phase | phase plans 16-01 to 16-09 | 2026-11-17 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-17 | 31 | 31 | 0 | gsd-security-auditor (Opus), plus the orchestrator's W-1 fix (T-16-31) |

Notes from the audit that are not threats: the `--export-pin` out-of-repo guard compares path text only (review IN-03, recorded as a todo); `ships-debris.json` and `explosions.json` carry NOTICE paragraphs rather than `ASSETS.md` rows, like the other generated catalogues.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-17
