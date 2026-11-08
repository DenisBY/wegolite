---
status: diagnosed
phase: 04-manual-docking
source:
  - 04-VERIFICATION.md
started: 2026-11-05T11:18:00Z
updated: 2026-11-05T11:53:01.761Z
---

## Current Test

[testing complete]

## Tests

### 1. Bounce feedback feel
expected: Launch, fly off-axis into the Coriolis, and observe the contact. A clear message, camera shake and red HUD frame appear, all clear within about 0.5 s, and a second attempt is possible immediately.
why_human: Shake amplitude and flash feel are qualitative. Automation proves presence and expiry on the sim clock, not whether the feedback reads clearly.
result: pass

### 2. Docking-computer line, disabled state and Shift+C affordance
expected: Dock at Lave and inspect the docking-computer line, the disabled Buy control and the Controls screen. The line reads "Docking Computers — 1500.0 Cr (TL 9)", the refusal reads "Requires TL 9", the disabled control is visually distinct, and Controls tells the player the chord is Shift+C.
why_human: Layout, colour and discoverability are visual judgements. The current UI review reports the Controls label renders "C" rather than "Shift+C", the disabled Buy control looks active, and the reason sits in the label column.
result: issue
reported: "does not look disabled [screenshot of Docked screen: Buy docking computer button styled identically to Launch, Requires TL 9 under the label column]"
severity: major

### 3. New game save deletion decision
expected: With a committed save, click New game once. Either a confirmation or one-slot backup protects the only save, or the project records an explicit product decision that one-click deletion is intended.
why_human: This is a product/UX decision, not a DOCK-01..07 functional assertion. The current path deletes the only save with no confirmation, undo or backup; the UI review rates it a blocking UX defect.
result: issue
reported: "just wiped it without asking anything and I started at the Lave station. We should add a confirmation."
severity: major

### 4. Committed regression test for the disarmed tunnel-end clamp
expected: Add and run a committed test that places a disarmed in-flight ship past the 250 m tunnel end, calls `stepDocking`, and asserts the positional clamp, no bounce/docked/scrape event, and mode still `inFlight`.
why_human: No committed test exercises this behaviour. An ad-hoc Docker check passed on the verified tree, so the gap is regression coverage, not an observed product failure.
result: issue
reported: "issue, add tests"
severity: major

### 5. Committed regression test for orientation preservation through a bounce
expected: Add and run a committed test that captures the orientation quaternion, places a straddle or hull contact, calls `stepDocking`, and asserts exactly one bounce, unchanged orientation and mode still `inFlight`.
why_human: No committed assertion exists for orientation preservation. An ad-hoc Docker check observed `unchanged: true`, so the gap is regression coverage, not an observed product failure.
result: issue
reported: "issue, add tests"
severity: major

## Summary

total: 5
passed: 1
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-04-2
  truth: "The disabled Buy docking-computer control is visually distinct from an active control, and the refusal reason reads with the control rather than in the label column"
  status: failed
  reason: "User reported: \"does not look disabled\" — the Buy docking computer button is styled identically to the Launch button; Requires TL 9 sits under the label column"
  severity: major
  test: 2
  root_cause: "Presentation only: index.html has no :disabled rule, so #docked button and its hover/focus fill give the disabled control the same green border/text as Launch; the refusal is a bare <dd> with no <dt> and auto-places into column 1 of the #docked dl grid; Controls cannot print Shift+C because REQUIRES_SHIFT is private in src/input/keyboard.ts and ACTION_LABELS.dockingComputer is \"Docking computer (Shift+)\"."
  artifacts:
    - path: "index.html"
      issue: "#docked button rules (130-144) lack :disabled styling and :disabled hover/focus exclusion; dockcomp-message <dd> (287-289) lands in the label column of the two-column grid (108-113); no aria-describedby; no gap between Buy and Launch"
    - path: "src/ui/docked.ts"
      issue: "writes disabled/reason correctly but adds no ARIA association or owned-state label"
    - path: "src/ui/controls.ts"
      issue: "renders labelFor(bindings, action) as \"C\" with no shift modifier"
    - path: "src/input/actions.ts"
      issue: "ACTION_LABELS.dockingComputer is \"Docking computer (Shift+)\", which renders as a dangling fragment"
    - path: "src/input/keyboard.ts"
      issue: "REQUIRES_SHIFT is module-private, so the UI has no data path to the Shift requirement"
  missing:
    - "Add #docked button:disabled styling (dimmed colour/border, reduced opacity, cursor: not-allowed) and exclude :disabled from the hover/focus fill"
    - "Restructure the purchase row so the refusal reason sits in the value cell or a row wrapper, linked by aria-describedby, and add a gap between Buy and Launch"
    - "Expose the shift-required action set or a shared chord formatter so Controls prints \"Shift+C\""
    - "Add regression assertions for computed style, ARIA linkage and the Controls chord; the current e2e only asserts text plus toBeDisabled()"
  debug_session: .planning/debug/disabled-buy-control.md

- gap_id: G-04-3
  truth: "Clicking New game with a committed save asks for confirmation (or protects the save with a one-slot backup) before discarding it"
  status: failed
  reason: "User reported: \"just wiped it without asking anything and I started at the Lave station. We should add a confirmation.\""
  severity: major
  test: 3
  root_cause: "The title click is wired straight to the destructive path: src/ui/title.ts onStart fires immediately, src/main.ts wires it to session.start(), and src/app/game-session.ts start() awaits clearSaveForNewGame() before asset preload. clearSaveForNewGame() calls store.clear(revision) for any 'absent | valid | corrupt' status and src/persistence/idb-store.ts clear() deletes AUTOSAVE_KEY. No confirmation gate or backup exists, and PROJECT.md records no product decision accepting one-click deletion."
  artifacts:
    - path: "src/ui/title.ts"
      issue: "onStart invokes the handler unconditionally; no confirmation or backup state"
    - path: "src/main.ts"
      issue: "New game handler is `void session.start()` with no bootSave check; the boot raw blob is discarded"
    - path: "src/app/game-session.ts"
      issue: "start() clears the save before preload; clearSaveForNewGame() deletes any clearable save"
    - path: "src/persistence/idb-store.ts"
      issue: "clear() deletes AUTOSAVE_KEY; the store already has the serialized queue, revision/oncomplete contract and a second-key put pattern (backupCorrupt) a backup slot could reuse"
    - path: "tests/e2e/autosave.spec.ts"
      issue: "lines 370-393 pin the current one-click clear and must change with the fix"
  missing:
    - "Add a confirmation gate in the title layer (static markup, AbortController and focus handling mirroring src/ui/pause.ts), enabled by main.ts only when bootSave is defined or saveStatus is clearable"
    - "Optionally add a one-slot backup key in the SaveStore using the existing queue/revision/oncomplete contract, copying the retained boot raw before clear()"
    - "Update the autosave e2e New-game case to assert the save survives the first click and clears only after confirmation"
  debug_session: .planning/debug/new-game-save-confirmation.md

- gap_id: G-04-4
  truth: "A committed test places a disarmed in-flight ship past the 250 m tunnel end, calls stepDocking, and asserts the positional clamp, no bounce/docked/scrape event, and mode still inFlight"
  status: failed
  reason: "User reported: \"issue, add tests\" — no committed regression test exercises the disarmed tunnel-end clamp"
  severity: major
  test: 4
  root_cause: "No committed test exists. src/sim/dock/step.ts:153-157 already clamps the position and returns before the contact switch, but tests/sim/dock-corridor.test.ts only covers the non-finite pose guard and tests/sim/dock-capture.test.ts never pushes a disarmed ship past port.depth."
  artifacts:
    - path: "tests/sim/dock-corridor.test.ts"
      issue: "covers the finite-pose guard only; no disarmed past-end clamp case"
    - path: "src/sim/dock/step.ts"
      issue: "clamp behaviour is implemented at 153-157 and needs a committed regression test"
  missing:
    - "Add a sim test with a disarmed in-flight state whose box.min.z < -port.depth; call stepDocking and assert the clamped position, empty events, and mode === \"inFlight\""
  debug_session: .planning/debug/disarmed-tunnel-end-clamp.md

- gap_id: G-04-5
  truth: "A committed test asserts exactly one bounce, unchanged orientation and mode inFlight through a straddle or hull contact"
  status: failed
  reason: "User reported: \"issue, add tests\" — no committed assertion exists for orientation preservation through a bounce"
  severity: major
  test: 5
  root_cause: "No committed assertion exists. respondToContact in src/sim/dock/step.ts adjusts speed and impulse and never writes orientation, but tests/sim/dock-no-trap.test.ts only asserts the quaternion components are finite and tests/sim/dock-hull.test.ts does not check orientation invariance."
  artifacts:
    - path: "tests/sim/dock-no-trap.test.ts"
      issue: "captures the quaternion but asserts finiteness only"
    - path: "tests/sim/dock-hull.test.ts"
      issue: "covers hull contact without asserting orientation preservation"
    - path: "src/sim/dock/step.ts"
      issue: "respondToContact leaves orientation untouched and needs a committed regression test"
  missing:
    - "Add a sim test that records the quaternion, drives a straddle or hull contact, calls stepDocking, and asserts exactly one bounce event, deep-equal orientation, and mode === \"inFlight\""
  debug_session: .planning/debug/bounce-orientation-preservation.md
