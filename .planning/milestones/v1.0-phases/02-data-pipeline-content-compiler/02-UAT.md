---
phase: 02-data-pipeline-content-compiler
status: complete
source: user
started: "2026-11-03"
updated: "2026-11-03"
items: 2
passed: 1
skipped: 1
---

# Phase 02 — User Acceptance Testing

Programmatic verification passed (`02-VERIFICATION.md`, score 4/5 with 0 failures). Two checks
needed human eyes or different hardware; one is confirmed, the other is a tracked CI gap.

## Tests

### 1. Coriolis letterbox / dock-opening handedness

**Why:** success criterion 3 requires the Coriolis letterbox to read correctly rather than
mirrored. Plan 02-06 proved the geometry and bounds numerically (1,076 Cobra and 2,226 Coriolis
faces with a positive face-normal dot, dock at `[0, 0, -500.2561]`) but deferred the visual
confirmation to end-of-phase.

**Steps:**

1. `docker compose up app` (port 5173) and open the running scene, or load
   `public/models/coriolis.glb` in a glTF viewer.
2. Look at the station's front face:
   - the dock opening faces the viewer and is centred;
   - the opening is **not** mirrored (the faceplate sits proud of the hull, not recessed);
   - the four parts (hull, dock, faceplate, tris) form one coherent station with no inverted
     triangles or see-through gaps.
3. Compare with `public/models/cobra3.glb`: the Cobra's nose faces −Z in Three.js space after
   conversion, with no inverted faces and the gun/hull split intact.

**Pass condition:** the station reads as a Coriolis in the item's own artwork; dock mirrored is a
failure.

**Result — PASS (2026-11-03, user).** Reviewed through a local `<model-viewer>` page served from
the built `dist/` tree so the 15 external textures resolve on the same origin
(`http://localhost:4173/viewer.html`; drag-and-drop viewers cannot resolve relative texture URIs).
The dock reads as a slot, the faceplate sits proud of the hull, and the four parts form one coherent
station with no inverted or missing faces. The Khronos glTF Validator run at the same time reported
**0 structural errors** on the same file (2,226 triangles, 4 materials, `KHR_materials_specular`).

result: pass
reason: User confirmed the dock reads as a slot with the faceplate proud and no inverted faces.

### 2. arm64 ↔ amd64 byte identity

**Why:** DATA-08 claims generated content is byte-identical across architectures. It is unmeasured
here: `sh scripts/check-arch-determinism.sh` exits **2** with
`linux/arm64 execution is unavailable, no QEMU binfmt`, which is the script's deliberate
"unrunnable environment" status, not a pass.

**Steps (on a host or CI runner with arm64 available — native or QEMU binfmt):**

```bash
sh scripts/check-arch-determinism.sh
```

Expected: exit 0 and a `Result:` line showing matching file sets, bytes, per-file SHA-256 and
manifests for both platforms. Exit 1 means a real difference; exit 2 means the environment still
cannot run the second platform.

**Pass condition:** exit 0 on a runner that can execute both `linux/arm64` and `linux/amd64`.

**Disposition — deferred, tracked CI gap (2026-11-03).** No arm64-capable runner is available in
this environment. The claim stays unmeasured; it is not a code defect and not a pass. Close it when
`sh scripts/check-arch-determinism.sh` runs green on an Apple Silicon host or an
`ubuntu-24.04-arm` runner. The script is intentionally absent from `verify` (review WR-07).

result: skipped
reason: "Deferred follow-up: no arm64-capable runner in this environment; tracked CI gap — the script exits 2 (unrunnable), not a pass."

## Summary

total: 2
passed: 1
issues: 0
pending: 0
skipped: 1
blocked: 0

## Known non-blocking findings

- `docker compose run --rm test` can fail intermittently (2 of 4 full runs) when
  `tests/guards/sim-purity.test.ts` leaves a DOM probe visible to `content-boundary.test.ts`'s
  project-wide `tsc`; both pass in isolation and `verify` passed twice. Fix by serializing or
  scoping the guard probes.
- Sim content boundary is a denylist (`src/content/systems.ts` is reachable from `src/sim`);
  no sim module imports it today (review WR-02).
- Other deferred review items (WR-03..WR-09) are recorded with reasons in
  `02-REVIEW-DISPOSITION.md`; none changes a generated value.
- The Khronos glTF Validator reports 4 `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings: the
  normal-mapped materials ship no `TANGENT` attribute, so clients derive tangents (the glTF spec
  says they SHOULD, and three.js does). Valid glTF and it renders correctly; adding explicit
  tangents is a possible polish item, not a defect.

## Gaps

None.

## Sign-off

| # | Item | Result | Date |
|---|------|--------|------|
| 1 | Coriolis letterbox not mirrored | pass | 2026-11-03 |
| 2 | arm64 ↔ amd64 byte identity | deferred (CI gap) | 2026-11-03 |
