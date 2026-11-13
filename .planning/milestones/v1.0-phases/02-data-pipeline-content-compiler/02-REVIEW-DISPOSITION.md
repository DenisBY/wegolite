---
phase: 02-data-pipeline-content-compiler
review: 02-REVIEW.md
reviewed: 2026-11-03T13:02:44Z
disposition_date: 2026-11-03
critical: 0
warning: 6
info: 6
open: 0
fixed: 2
deferred: 13
skipped: 0
---

# Phase 02 — Code Review Disposition

Advisory gate: this ledger records what was decided about each finding. It does not
block phase completion. Findings are from `02-REVIEW.md` (standard depth, 62 files).

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| CR-01 | critical | fixed | Fixed in `4583156`: all 16 `public/textures/*.png` rows now carry Kind, Origin, Source URL, Author, Licence, Modifications and the verified SHA-256, matching the vendored identity of each byte-identical copy. |
| WR-01 | warning | fixed | Fixed in `4583156`: `parseAssetRows` now throws on any row that is not 8 cells, so a malformed row can no longer be silently dropped; a new `committed public assets` block walks `public/` (excluding dotfiles) and asserts one full row plus a matching SHA-256 and a non-empty licence per file. |
| WR-02 | warning | deferred | The sim boundary is a denylist (`content/index*`, `content/schemas/**`, `content/generated/**`). Converting it to an allowlist (only `content/types`) touches the eslint config, `tsconfig.sim.json` and the guard tests; scoped as a follow-up so it lands with its own review. Mitigation today: `src/content/systems.ts` is only reachable if a sim module imports it explicitly, and no sim module does. |
| WR-03 | warning | deferred | The determinism zone bans the `Math` members the pipeline actually uses plus the obvious transcendental set, but not the full class (`atan2`, `hypot`, `cbrt`, `log2`, `toExponential`, …). Widening the selector list is mechanical but must be proven by seeded-probe updates; queued behind WR-02 in the same follow-up. |
| WR-04 | warning | deferred | String-form `emission_map` (`shipdata.plist:1037`) is dropped by `materialFor` rather than failing the build. No current `EMITTED_ENTRIES` entry uses it, so no shipped GLB is wrong today; a hard failure belongs with the next ship addition. |
| WR-05 | warning | deferred | `cli.ts` exits 0 when the entry-point guard does not fire (symlinked/wrapper invocation). The container invokes the CLI by direct path, so the drift gate has been exercised correctly; hardening the guard is a follow-up. |
| WR-06 | warning | deferred | `check-arch-determinism.sh`'s `set -e` EXIT trap can turn a successful comparison into exit 1 when root-owned container output cannot be removed. The script has never reported a pass locally (no arm64 emulation), so this is untriggered; fix with WR-07. |
| WR-07 | warning | deferred | The arm64↔amd64 byte-identity measurement runs in no gate. It is out of `verify` by design, but with no CI job the claim stays unmeasured. Recorded as a manual-only item in `02-VALIDATION.md` and tracked for the CI arm64 runner. |
| WR-08 | warning | deferred | `generateContent` writes GLBs/JSON before the texture allowlist closure asserts, so a failed `assets:build` can leave a half-written tree plus a stale manifest. `assets:check` catches the mismatch on the next run; reordering the closure before the writes is a follow-up. |
| IN-01 | info | deferred | `CONTENT_MANIFEST_SCHEMA_VERSION` is dead while the schema hardcodes `z.literal(1)`. Cosmetic; fold into the next manifest change. |
| IN-02 | info | deferred | Dead re-exports in the systems converter. No behavioural impact. |
| IN-03 | info | deferred | Subentity projection uses first-match where the pipeline is otherwise last-wins. No current entry has duplicate subentity keys. |
| IN-04 | info | deferred | Ship lookup table keyed by authored keys in a plain object. Keys come from the pinned plist, and prototype pollution is already excluded by `dictToMap`; consider a `Map` on the next pass. |
| IN-05 | info | skipped | Unreachable tokenizer branch; removing it is a readability change with no correctness effect. Accepted as-is. |
| IN-06 | info | deferred | `emissionModulateColorNormalized` reports `26.47` for the Coriolis rather than a 0–1 triple. The value is carried as authored metadata and is not used for rendering; clarify the name or normalise it with the next material change. |

## Verification

- `docker compose run --rm verify` → exit 0 after the fix (lint, typecheck, `assets:check`,
  193 unit tests, production build, 3 Playwright tests).
- `docker compose run --rm test npx vitest run tests/compliance-assets.test.ts tests/compliance.test.ts`
  → 22 tests passed (12 + 10).
- `docker compose run --rm assets` regeneration unaffected: `ASSETS.md` is not a generated artefact.

## Follow-ups queued (not phase-02 gaps)

1. Sim boundary as an allowlist + complete determinism lint coverage (WR-02, WR-03).
2. Cross-arch determinism in CI, with the cleanup-trap fix (WR-06, WR-07).
3. Emissive-map hard failure, CLI entry-guard hardening, and closure-before-write in
   generation (WR-04, WR-05, WR-08).
