---
phase: 02-data-pipeline-content-compiler
status: pending
created: "2026-11-03"
items: 2
---

# Phase 02 — User Acceptance Testing

Programmatic verification passed (`02-VERIFICATION.md`, status `human_needed`, score 4/5 with
0 failures). Two checks need human eyes or different hardware.

## 1. Coriolis letterbox / dock-opening handedness

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

**Pass condition:** the station reads as a Coriolis in the item's own artwork, dock mirrored is a
failure.

## 2. arm64 ↔ amd64 byte identity

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
If no such runner exists yet, accept this as a tracked CI gap rather than a code defect.

## Known non-blocking findings

- `docker compose run --rm test` can fail intermittently (2 of 4 full runs) when
  `tests/guards/sim-purity.test.ts` leaves a DOM probe visible to `content-boundary.test.ts`'s
  project-wide `tsc`; both pass in isolation and `verify` passed twice. Fix by serializing or
  scoping the guard probes.
- Sim content boundary is a denylist (`src/content/systems.ts` is reachable from `src/sim`);
  no sim module imports it today (review WR-02).
- Other deferred review items (WR-03..WR-09) are recorded with reasons in
  `02-REVIEW-DISPOSITION.md`; none changes a generated value.

## Sign-off

| # | Item | Result | Date |
|---|------|--------|------|
| 1 | Coriolis letterbox not mirrored | pending | — |
| 2 | arm64 ↔ amd64 byte identity | pending | — |
