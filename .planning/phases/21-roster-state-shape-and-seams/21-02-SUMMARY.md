---
phase: 21-roster-state-shape-and-seams
plan: 02
subsystem: content-vendoring
tags: [oolite, vendoring, provenance, licence, DATA-18, CC-BY-NC-SA-3.0]
requires:
  - phase: 21-roster-state-shape-and-seams
    provides: "21-01 inert-world isolation (the converter stays untouched here)"
provides:
  - "9 new hull models and 51 PNG maps vendored from the pinned Oolite blobs (7437f22)"
  - "FILES entries, ASSETS.md rows and CHECKSUMS lines for all 60 new paths"
affects: [21-04, 21-08]
tech-stack:
  added: []
  patterns: ["D16-02 route: --export-pin on the host, OOLITE_LOCAL container mode, prettier on ASSETS.md"]
key-files:
  created:
    - third_party/oolite/Models/oolite_anaconda.dat
    - third_party/oolite/Models/oolite_asp.dat
    - third_party/oolite/Models/oolite_boa-mk2.dat
    - third_party/oolite/Models/oolite_boa.dat
    - third_party/oolite/Models/oolite_ferdelance.dat
    - third_party/oolite/Models/oolite_python.dat
    - third_party/oolite/Models/oolite_python_trader.dat
    - third_party/oolite/Models/oolite_sidewinder_escort.dat
    - third_party/oolite/Models/oolite_viper_interceptor.dat
    - "third_party/oolite/Textures/ (51 PNGs, listed below)"
  modified:
    - scripts/vendor-oolite.sh
    - ASSETS.md
    - third_party/oolite/CHECKSUMS.sha256
    - tools/oolite-ingest/convert/textures.test.ts
key-decisions:
  - "FILES entries are appended at the end of the Models and Textures groups (plan wording), and ASSETS.md rows follow the same order as the existing rows (FILES order), not alphabetical"
  - "NOTICE left unchanged: its general clause already covers every Oolite model, image and configuration file"
requirements-completed: [DATA-18]
duration: ~35 min of work (about 90 min wall clock, most of it waiting for the full test run under container contention)
completed: 2026-11-26
status: complete
commits: 2
plan_head_before: a0a7fd4d602ac3edc89e02b31bff30e8bb39ba3f
plan_head_after: 78ba476deb7c396e34ad6e1071ad4e13b8b6691d
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
---

# Phase 21 Plan 02: Vendor the roster hulls and maps Summary

Nine new Oolite hull models and 51 PNG maps (58,365,169 bytes) vendored from the pinned `7437f22` blobs through `scripts/vendor-oolite.sh` only, each with an ASSETS.md row, a script-written CHECKSUMS line and the CC BY-NC-SA 3.0 provenance, with nothing generated changed.

## What was done

**Task 1 (tracer, commit `42855cf6`):** the Asp model and its four maps (`oolite_asp_diffuse/normal/specular/subents.png`) went end to end: FILES entries, ASSETS.md rows (copied from the adder rows, digest cell filled by the script), `--export-pin` on the host, the `OOLITE_LOCAL` container run, prettier on ASSETS.md, `tests/compliance-assets.test.ts` green (12 tests). Tracer verify re-run before expanding: green. The script accepted it without refusals.

**Task 2 (commit `78ba476d`):** the other eight models and 47 maps, same procedure, export-pin repeated so `pinned.sha256` covers every new path. The textures-test edit and the plan gates followed.

### Vendored list (9 models + 51 textures)

Models (1,397,369 bytes): `oolite_anaconda`, `oolite_asp`, `oolite_boa-mk2`, `oolite_boa`, `oolite_ferdelance`, `oolite_python`, `oolite_python_trader`, `oolite_sidewinder_escort`, `oolite_viper_interceptor` (all `.dat`).

Textures (51 PNG, 56,967,800 bytes): anaconda (diffuse, normal, specular, subents, subents_normal, subents_specular); asp (diffuse, normal, specular, subents); boa-mk2 (the same six); boa (the same six); cobra3 `diffuse_alt`, `diffuse_pirate`; cobramk1 `diffuse_alt`; ferdelance (the same six); mamba `diffuse_escort`; moray `diffuse_med`; python (`diffuse`, `normal`, `specular`, `subents`, `subents_normal`, `diffuse_blackdog`, `blackdog_normal`, `diffuse_trader`, `specular_trader`, `subents_trader`, `subents_normal_trader`, `subents_specular_trader`); sidewinder `diffuse_escort`, `normal_escort`, `specular_escort`; viper `diffuse_pursuit`; viper_interceptor `diffuse`, `normal`.

The list was recomputed before the export: the 28 roster records' material texture names from `src/content/generated/ships.json` (`shipDef.materials`, every `.png` string including `emission_map` names), minus `third_party/oolite/Textures`, gave exactly 51 names and the same 9 models as the frontmatter. The recompute was a read-only host Python script under the scratchpad (not a container script; it reads only committed JSON and a directory listing). The exported blobs total 56,967,800 bytes for the 51 PNGs, equal to the plan's figure.

### Provenance facts

- Export-pin out-dir: a session scratchpad directory outside the repository (`.../scratchpad/oolite-pin-21`); `pinned.sha256` records `# commit 7437f22a543c442830774dea0f2cad4e59c04cbb`.
- `pin.json` unchanged (still `7437f22`, release `1.93.1-241`, retrieved `2026-11-03`): the script rewrote the same bytes.
- CHECKSUMS.sha256: 131 lines before, 191 after, exactly 60 added and 0 deleted (`git diff --numstat a0a7fd4d..HEAD`: `60 0`). No committed digest changed (the script refuses that before writing).
- Vendored tree after: 116 textures, 32 models (were 65 and 23).
- ASSETS.md diff: 60 new rows plus the one digest cell of the `CHECKSUMS.sha256` row (rewritten by the script, as designed).
- No byte came from the checkout's working tree (HEAD `21978c37b`, ahead of the pin) or the network.

### NOTICE finding

NOTICE is unchanged. Section 3 (CC BY-NC-SA 3.0) reads: "Oolite's artwork — its 3D models, images and sounds — as well as its configuration files are also available under the Creative Commons Attribution-NonCommercial-ShareAlike 3.0 licence ... Wegolite takes the CC BY-NC-SA 3.0 option for every Oolite-derived artwork or configuration file it reuses", and "Every reused asset and every reused configuration file is recorded, with its origin and licence, in `ASSETS.md`." It enumerates no vendored file, model family or texture set; the file lists it carries are for generated outputs (the GLBs, baked maps and generated catalogues), which land in plan 21-08. Its sentence on `ships-hulls.json` ("the nine NPC ships") is about a generated file and is 21-08's to update when that file grows.

### Textures test edit

`tools/oolite-ingest/convert/textures.test.ts`, case "keeps the Cobra variant textures out of the closure and both trees": removed only the `third_party/oolite/Textures` entry from the directory loop (the `cobra3-pirate` and `cobra3-alternate` maps are now vendored inputs). The closure assertions and the `public/textures` check stay, and a comment names plan 21-02 and that 21-08 replaces the case when the closure grows. `VENDORED_TEXTURES` (the converter's hard-coded allowlist) is untouched, so its `not.toContain` assertion still holds. No other test needed a change.

### Repository growth

About 58.4 MB of new vendored bytes (56,967,800 PNG plus 1,397,369 `.dat`), `third_party/oolite/Textures` 120,465,339 bytes and `Models` 3,426,132 bytes on disk after. Plan 21-08 adds the generated side (about 16 MB WebP, 20 GLBs). The flagged assumption (DATA-18 probe row, RESEARCH A12) stands: the owner accepts about 58 MB vendored now and about 16 MB of WebP later; dropping `sidewinder-escort` and `viper-pursuit` (26 records) is the lever if fewer variants are wanted. Recorded, not applied.

## Gate results

| Gate | Result |
|------|--------|
| `docker compose run --rm test npx vitest run tests/compliance-assets.test.ts` (Task 1) | 12 passed |
| `... tests/compliance-assets.test.ts tools/oolite-ingest/convert/textures.test.ts tests/sim/world/inert-isolation.test.ts` (Task 2) | 3 files, 71 tests passed |
| `docker compose run --rm assets npm run assets:check` | "no differences" (the converter and every generated file untouched) |
| `docker compose run --rm lint` | eslint and prettier clean |
| `docker compose run --rm test` (final run, quiet machine) | 290 of 290 files, 7691 passed, 10 skipped |
| `git diff --name-only a0a7fd4d..HEAD -- src public tools/oolite-ingest/convert/npc-ships.ts` | prints nothing |

No `verify` and no acceptance run (no file under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changed).

## Deviations from Plan

None - plan executed exactly as written, apart from two process notes, neither a code deviation.

- **Process note 1 (ASSETS.md row placement):** my first row insertion put the rows in a short curated block at the top of the third_party section; I reverted `ASSETS.md` (no commit had been made) and reinserted them after the last existing row of their group, matching the table's FILES-order layout. The script and compliance test accept either; the second layout is the consistent one.
- **Process note 2 (flaky timeouts under contention):** the two earlier full `test` runs, made while sibling worktrees ran their own `test` containers, failed 4 and then 2 tests with `TestTimeoutError` (`tests/guards/tools-determinism.test.ts` Math.sin lint probe at 30 s, `textures.test.ts` "serves each vendored texture as WebP only" at 5 s, and two others in the first run). Each passes alone (textures 1.4 s, determinism 13.5 s), and a third full run with no competing container was fully green. These are load timeouts, not caused by this plan, which adds no code. Worth knowing: the vendored directory is now 60 MB larger, but the textures case does not read it.

## Known Stubs

None. Nothing here is wired to UI or runtime data.

## Threat Flags

None. The only new trust-boundary crossing is the planned local-checkout import (T-21-03, T-21-04 mitigated as planned: `--export-pin` exports pinned blobs only, container mode verified every byte against `pinned.sha256`, the script refuses a missing ASSETS.md row and any changed committed digest).

## Self-Check: PASSED

- All 9 models and 51 textures exist on disk (`ls third_party/oolite/Textures | wc -l` is 116, `Models` is 32).
- `rg -c "^[0-9a-f]{64}  " third_party/oolite/CHECKSUMS.sha256` is 191; `rg -c "oolite_asp" ...CHECKSUMS.sha256` is 5; `rg -c "Models/oolite_asp.dat" scripts/vendor-oolite.sh` is 1.
- Commits `42855cf6` and `78ba476d` are ancestors of HEAD.
