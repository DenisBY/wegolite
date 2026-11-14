---
status: testing
phase: 11-minimal-save-schema-v3
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md]
started: 2026-11-14T13:48:49Z
updated: 2026-11-14T13:48:49Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Stop any running dev/preview container and clear browser site data for the app (IndexedDB). Start the app from scratch (docker compose up preview, http://localhost:4173). The title screen loads with no console errors, New game starts, and a manual Save (F2) completes without an error footer.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Fresh start of the app from scratch loads the title screen with no console errors; New game starts; manual Save (F2) completes without an error.
result: [pending]

### 2. Writer call sites, types and boot compile against SaveV3
expected: Every writer call site, type and the boot compile against SaveV3; the writer-bound cases still commit the v3 maxima under MAX_SAVE_CHARS (covered by autosave writer-bounds test, typecheck and lint; all green in verify-full on final code).
coverage_id: D4
result: [pending]

### 3. Auto-covered: v3 strict write, v1/v2 migration chain, world-seed round trip (11-02 D1-D3), 11-01 D1-D3, 11-03 D1-D4, 11-04 D1-D3
expected: Deterministically covered by passing tests (see SUMMARY coverage blocks; verify-full exit 0).
source: automated
result: pass

## Summary

total: 3
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
