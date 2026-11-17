---
status: testing
phase: 16-wreckage-cargo-and-the-entity-cap
source: [16-VERIFICATION.md]
started: 2026-11-17T09:40:00Z
updated: 2026-11-17T09:40:00Z
---

## Current Test

number: 6
name: OC-7: the debris vendoring run was done by the orchestrator
expected: |
  Owner confirms the provenance of commit 8b5cd65; the 14 files were re-hashed against the pinned blobs and match, and CHECKSUMS.sha256 only gained lines (D16-02).
awaiting: user response

## Tests

### 1. OC-1: a pod is one anonymous barrel with no commodity
expected: Owner accepts no commodity, amount or pod-role draw per pod (D16-01, D16-24); Oolite Universe.m 3863-3878 and 3977-3996 draws are not ported until scooping exists.
result: pass

### 2. OC-2: render-side tumble from the piece's own orientation
expected: Each piece tumbles differently, the same piece the same way every run; the entity id cannot seed it (id-scope guard). Rewords 15-CONTEXT D-03 (D16-10).
result: pass

### 3. OC-3: pods, plates and wrecks are not shootable or rammable until Phase 18
expected: Debris is no laser, ident, ram, mass-lock or jump-blockage candidate in this phase; the ROADMAP scope note's "can be shot" moves to Phase 18 (D16-03).
result: pass
note: owner accepted on 2026-11-17 on condition that Phase 18 makes pods and plates shootable and ramming candidates; recorded as a carry-over in ROADMAP Phase 18.

### 4. OC-4: the explosion blast pushes debris only, not ships or the player
expected: Pods, plates and wrecks are kicked by Oolite's formula; ships (at most 0.027 m/s) and the player (under 0.002 m/s) are not pushed in this phase (D16-04). Narrows ROADMAP criterion 1 "the blast pushing neighbours".
result: pass
note: owner accepted on 2026-11-17; Phase 18 must revisit whether the blast applies to ships and the player once they drift (ROADMAP Phase 18 carry-over).

### 5. OC-5: no code fix for the doubled hit sound
expected: shipHit has no consumer, so no sound or visual can double; the Phase 15 fix waits for the first consumer (D16-14).
result: pass
note: owner accepted on 2026-11-17; tracked by the todo 2026-11-17-skip-shiphit-for-a-doomed-target.md and a Phase 17 carry-over line.

### 6. OC-7: the debris vendoring run was done by the orchestrator
expected: Owner confirms the provenance of commit 8b5cd65; the 14 files were re-hashed against the pinned blobs and match, and CHECKSUMS.sha256 only gained lines (D16-02).
result: [pending]

### 7. Visual check of the explosion, wreckage burn-down and pod drift on a real GPU
expected: A destroyed ship shows a cloud and a white flash; then wrecks, plate and pods drift and tumble; nothing judders badly or looks wrong. The container renders on SwiftShader and cannot judge appearance.
result: [pending]

## Summary

total: 7
passed: 5
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
