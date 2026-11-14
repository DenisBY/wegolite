---
phase: "10"
slug: ship-mass
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-14"
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                  | Description                                                                              | Data Crossing                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Vendored Oolite models → content build    | `.dat` meshes read by the octree port and mass composer at build time                    | Untrusted-shaped mesh data (vertices, faces)        |
| Content build → compiled records          | Computed masses written to `ships-npc.json` and `ships-client.json`                      | One float32 number per record                       |
| Compiled records → client bundle          | Generated JSON shipped statically; `src/sim` must not read the catalogue or the tooling  | Mass values (no octree data)                        |
| Derived data → licence record             | Values derived from CC BY-NC-SA 3.0 models carry that licence                            | Provenance (`NOTICE`, `FIDELITY.md`)                |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
| --------- | -------- | --------- | -------- | ----------- | ---------- | ------ |
| T-10-01 | Tampering | `octree.ts` triangle extraction (NaN coordinate, all-degenerate mesh) | medium | mitigate | DAT_MESH errors at `octree.ts:126-143,189-195`; `ship-mass.ts:61-65`; bounds in `dat.ts:106,308,330-346`; tests `octree.test.ts`, `ship-mass.test.ts` | closed |
| T-10-02 | Denial of Service | Octree recursion and triangle splitting | low | mitigate | `OCTREE_MAX_DEPTH = 7` (`octree.ts:41,221,400`); `MAX_MESH_COUNT` (`dat.ts:106`); constants pinned in `octree.test.ts` | closed |
| T-10-03 | Tampering | Silent precision drift across platforms / evaluation order | medium | mitigate | `Math.fround` after every operation; 16 hull masses and composites pinned with `toBe` in `ship-mass.test.ts` | closed |
| T-10-04 | Tampering | Unimplemented authored key (`model_scale_factor`) or malformed `density` | low | mitigate | SCHEMA failures at `ship-mass.ts:74-122,141-147`; tests `ship-mass.test.ts:372-460` | closed |
| T-10-05 | Tampering | `mass` in `ships-npc.json` / `ships-client.json` (missing, zero, negative, non-finite) | medium | mitigate | `schemas/ship-npc.ts:36`, `schemas/ship.ts:97`; `loadNpcCatalogue` safeParse; build guards in `ships.ts:565-568` | closed |
| T-10-06 | Information Disclosure | Octree data or extra fields leaking into a bundle / first load | low | mitigate | `strictObject` schema; `ships.json` carries no mass (tested); `rg octree src` matches comments only | closed |
| T-10-07 | Repudiation | Provenance of values derived from vendored `.dat` models | medium | mitigate | `NOTICE:74-91` states CC BY-NC-SA 3.0 derivation; `tests/compliance.test.ts` | closed |
| T-10-08 | Tampering | Changed mesh or octree rule silently moving a mass | medium | mitigate | Hand-written golden `tests/golden/content/ships-npc.json`; byte-for-byte regeneration test; `assets:check`; manifest hashes | closed |
| T-10-09 | Elevation of Privilege | `src/sim` reading the catalogue or the tooling | low | mitigate | `eslint.config.js:331-378` `no-restricted-imports`; `tests/guards/content-boundary.test.ts` | closed |
| T-10-10 | Tampering | `CORIOLIS_STATION_MASS` drifting from the compiled `coriolis-station` mass | medium | mitigate | `tests/sim/hyperspace-blockage.test.ts:110-132` pins the constant to the compiled record | closed |
| T-10-11 | Repudiation | Blockage value changed without the owner's decision | medium | mitigate | Blocking decision checkpoint; owner answers recorded in `10-03-SUMMARY.md`; PROJECT.md Key Decision; `fidelity.test.ts` enforces the quoted title | closed |
| T-10-12 | Denial of Service | Larger radius refusing jumps in flows that used to complete near the station | low | mitigate | Pins restated at 7,100 m / 7,300 m; e2e fly-away margins restated for 7,179.7 m; `hyperspace.spec.ts` reported passing (not independently re-run) | closed |
| T-10-13 | Denial of Service | First-load size growing with the buoy entry | low | mitigate | `budget.spec.ts` ceiling 9,437,184 B; measured 8,835,212 B (reported by plan 10-04, not independently re-run) | closed |
| T-10-14 | Tampering | Buoy mass written to the wrong key or differing between buoys | low | mitigate | `ships-client.test.ts:58-64,117-125`; `ship-mass.test.ts:160-161` | closed |
| T-10-15 | Repudiation | Records or comments contradicting the owner's answers | low | mitigate | No stale radius or data-gap wording remains; `fidelity.test.ts:264-271` | closed |
| T-10-16 | Repudiation | Provenance of the buoy mass | low | mitigate | `NOTICE:83-91` names `oolite_buoy` and `oolite_buoy_subents` | closed |
| T-10-SC (10-01) | Tampering | npm/pip/cargo installs | low | accept | No package manifest or Dockerfile changed in the phase | closed (accepted) |
| T-10-SC (10-02) | Tampering | npm/pip/cargo installs | low | accept | Same | closed (accepted) |
| T-10-SC (10-03) | Tampering | npm/pip/cargo installs | low | accept | Same | closed (accepted) |
| T-10-SC (10-04) | Tampering | npm/pip/cargo installs | low | accept | Same | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
| ------- | ---------- | --------- | ----------- | ---- |
| AR-10-01 | T-10-SC (10-01) | Supply-chain risk of installs accepted at plan time; verified that no package, lockfile or Dockerfile changed since `c36663d` | Plan threat_model disposition | 2026-11-14 |
| AR-10-02 | T-10-SC (10-02) | Same | Plan threat_model disposition | 2026-11-14 |
| AR-10-03 | T-10-SC (10-03) | Same | Plan threat_model disposition | 2026-11-14 |
| AR-10-04 | T-10-SC (10-04) | Same | Plan threat_model disposition | 2026-11-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Observations (informational, not threats)

1. `loadShipCatalogue` (`src/content/ships.ts:50-54`) still only does `JSON.parse` plus `Array.isArray`. Unchanged by this phase; nothing in `src/` reads `.mass` yet. Revisit when Phase 12 reads the client masses.
2. `CatalogEntrySchema.mass` has an accept test but no negative cases (zero, negative, NaN); build-time guards cover it. A negative test would make the T-10-05 claim literal.
3. The `hyperspace.spec.ts` and `budget.spec.ts` results rest on the plan 10-04 executor's report. First-hand re-run: `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` (about 4.5 min).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
| ---------- | ------------- | ------ | ---- | ------ |
| 2026-11-14 | 20 | 20 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-14
