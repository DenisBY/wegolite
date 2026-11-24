---
created: 2026-11-20T00:00:00.000Z
title: Add a separate 20-seed acceptance variant with collisions on
source: Phase 18 UAT owner decision 2026-11-20 (18-12-SUMMARY owner question 3, review L189)
area: sim
severity: minor
files:
  - tests/acceptance/
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

The 20-seed NPC acceptance run (`npm run test:acceptance`, `tests/acceptance/`) runs with collisions off, so it
does not exercise the collision stage that Phase 18 added. The owner decided on 2026-11-20 that a collisions-on
run is wanted, as a separate variant.

## Fix

1. Add a SEPARATE 20-seed acceptance variant with collisions on. Do not change the frozen harness or its
   thresholds and detectors; that is the owner's approval rule, and the variant needs the owner's approval of the
   harness addition at the time it is written.
2. Schedule it for the next NPC-behaviour phase. Rerun it by hand on the remote test machine and record the
   result in that plan's SUMMARY, as for the existing run.

This todo is a test-coverage item, not a divergence: its goal is a collisions-on acceptance measurement
alongside the frozen run.
