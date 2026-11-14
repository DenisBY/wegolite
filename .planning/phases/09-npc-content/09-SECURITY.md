---
phase: "09"
slug: npc-content
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-14"
---

# Phase 09 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail. Audited at HEAD `c93e72b` against base `acea0f4`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| network -> third_party/oolite | Bytes fetched from raw.githubusercontent.com at pinned commit 7437f22 enter the repository | Public Oolite art and config |
| third_party/oolite -> converter | Vendored `.dat`, PNG and plist values are parsed at build time | Untrusted-format binary input |
| converter -> public/ | Emitted GLB and texture bytes are served to every player | Static build outputs |
| shipdata.plist -> compiled record | Plist strings become record fields, later used as fetch paths | Model and glb path strings |
| generated JSON -> client | The client parses the lazily fetched record chunk | Validated catalogue |
| content -> src/sim | The simulation receives types only, never the catalogue | Type-only import |
| caller -> AssetCache.loadNpcModel | A path string decides what the browser fetches | Same-origin relative path |
| repository -> redistribution | Oolite art is redistributed under CC BY-NC-SA 3.0 | Per-file provenance |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-09-01 | Tampering | vendor script network fetch | high | mitigate | URLs pinned to 7437f22, HTTP 200 required (`scripts/vendor-oolite.sh:27,29,157`); 42 new files cross-checked against the checkout (`checked=42 mismatches=0`), confirmed by the orchestrator under owner delegation and independently re-verified at audit time | closed |
| T-09-02 | Tampering | previously vendored files | medium | mitigate | CHECKSUMS.sha256 diff: 0 removed, 42 added; pin.json diff empty | closed |
| T-09-03 | Repudiation | provenance of new Oolite assets | high | mitigate | 204 files each with one ASSETS.md row, SHA-256 equal to disk; `tests/compliance-assets.test.ts` | closed |
| T-09-04 | Spoofing | fetched file not the named Oolite file | medium | mitigate | Same cross-check as T-09-01 against the pinned git blob | closed |
| T-09-05 | Information Disclosure | network use from assets container | low | accept | Bare unauthenticated GETs; no credentials or headers | closed |
| T-09-06 | Tampering | shipGlbFile / emitModels output path | medium | mitigate | `SHIP_MODEL_PATTERN`, `shipGlbFile` fails closed, `resolveOutputFile`, `assertModelInsideModels` | closed |
| T-09-07 | Tampering | buildCobraGlb refactor | medium | mitigate | cobra3, coriolis, buoy GLBs byte-identical to base | closed |
| T-09-08 | Denial of Service | malformed or oversized mesh or PNG | low | mitigate | MAX_MESH_COUNT, 8192 px cap, 16-bit PNG refusal, MODEL_BOUNDS before conversion | closed |
| T-09-09 | Repudiation | provenance of public files | high | mitigate | All 87 `public/` files have a matching row; NOTICE covers every GLB | closed |
| T-09-10 | Tampering | GLB from wrong owner's materials | low | mitigate | Owner model equals row source, asserted in `emitModels` and tests | closed |
| T-09-11 | Repudiation | provenance of 48 public files | high | mitigate | Same walk and compliance test | closed |
| T-09-12 | Denial of Service | oversized meshes and PNGs (8 models) | low | mitigate | Same bounds chain; largest input 1024 px | closed |
| T-09-13 | Tampering | catalogue change by derivation | medium | mitigate | ships.json diff only flips `modelVendored`; ships-client.json unchanged; golden updated | closed |
| T-09-14 | Tampering | out-of-scope asset compiled | medium | mitigate | Explicit NPC_SHIP_GLBS and VENDORED_TEXTURES with both-direction closure; name guard clean | closed |
| T-09-15 | Denial of Service | repository growth (~12 MB) | low | accept | 11.8 MiB, bounded to nine models, lazily fetched | closed |
| T-09-16 | Tampering | record `glb` and `model` as fetch paths | medium | mitigate | `glb` derived, never copied; schema pattern at build time and in `loadNpcCatalogue` | closed |
| T-09-17 | Tampering | malformed generated JSON | low | mitigate | Strict schema, path-named Error, fail-closed | closed |
| T-09-18 | Elevation of Privilege | src/sim importing catalogue | low | mitigate | ESLint denials `**/content/ships*`, `**/content/schemas/**`; type-only export; no reference under `src/sim` | closed |
| T-09-19 | Information Disclosure | stats compiled ahead of DATA-15 | low | mitigate | `z.strictObject` with six fields; exact field-set test | closed |
| T-09-20 | Repudiation | licence of ships-npc.json | medium | mitigate | NOTICE paragraph added | closed |
| T-09-21 | Tampering | loadNpcModel path handling | medium | mitigate | `NPC_GLB_PATH_PATTERN` before any loader call (`asset-cache.ts:136`); seven refused shapes tested with zero loader calls | closed |
| T-09-22 | Information Disclosure | fetch to a new origin | low | mitigate | Same-origin only; CSP `connect-src 'self'` unchanged | closed |
| T-09-23 | Denial of Service | first-load regression | medium | mitigate | `budget.spec.ts` no-NPC-request assertion with live-log control; 9 MiB ceiling unchanged; boot-path guard | closed |
| T-09-24 | Denial of Service | GPU and memory leak | low | mitigate | `dispose()` frees NPC resources once; late loads not cached | closed |
| T-09-25 | Denial of Service | decode cost of malformed image | low | accept | Build-time validated outputs, at most 2048 px; decoded in `npc-assets.spec.ts` | closed |
| T-09-SC | Tampering | npm/pip/cargo installs (plans 01 to 05) | low | accept | No package, lockfile, Dockerfile or compose file changed | closed |

*Status: open · closed · open — below high threshold (non-blocking)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-09-01 | T-09-05 | Unauthenticated GETs to a public host; nothing sensitive leaves the machine | Plan 09-01 | 2026-11-14 |
| AR-09-02 | T-09-15 | Repository growth bounded by the nine-model set; assets are static and lazy | Plan 09-03 | 2026-11-14 |
| AR-09-03 | T-09-25 | Images are build-validated outputs; decode only on demand | Plan 09-05 | 2026-11-14 |
| AR-09-04 | T-09-SC | No dependency changes in any Phase 9 plan | Plans 09-01 to 09-05 | 2026-11-14 |

Recorded owner exceptions (see `.planning/PROJECT.md` Key Decisions rows d and e): network vendoring script pinned to 7437f22 with a mandatory hash cross-check, run on the host because the `wegolite-ci` image has no `git`.

---

## Audit Notes

- T-09-01: the plan called for an owner checkpoint; the orchestrator confirmed the cross-check under overnight owner delegation (commit 821fdd7), after later plans had built from the bytes. The control is independently re-verified (42/42 equal to the pinned blob and the working tree).
- Informational, not counted: `JSON.parse` in `loadNpcCatalogue` (`src/content/ships-npc.ts:43-45`) sits outside the schema-error branch, so syntactically broken JSON rejects with a bare `SyntaxError`. Still fail-closed; related to review warning WR-01.
- No unregistered threat flags; all five SUMMARYs report none.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-14 | 30 | 30 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-14
