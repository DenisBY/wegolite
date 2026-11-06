---
phase: 06-hyperspace-navigation-persistence
reviewed: 2026-11-06T21:47:31Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - index.html
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/main.ts
  - src/persistence/autosave.ts
  - src/persistence/save.ts
  - src/sim/commands.ts
  - src/sim/economy/market.ts
  - src/sim/events.ts
  - src/sim/flight/state.ts
  - src/sim/flight/step.ts
  - src/sim/hyperspace/arrival.ts
  - src/sim/hyperspace/countdown.ts
  - src/sim/hyperspace/jump.ts
  - src/ui/chart-draw.ts
  - src/ui/chart-model.ts
  - src/ui/chart.ts
  - src/ui/save-load.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/helpers/save-store.ts
  - tests/e2e/hyperspace.spec.ts
  - tests/e2e/save-load.spec.ts
  - tests/guards/economy-purity.test.ts
  - tests/input/bindings.test.ts
  - tests/persistence/autosave.test.ts
  - tests/persistence/save-v2.test.ts
  - tests/persistence/save.test.ts
  - tests/sim/economy/market.test.ts
  - tests/sim/hyperspace-arrival.test.ts
  - tests/sim/hyperspace.test.ts
  - tests/ui/chart-draw.test.ts
  - tests/ui/chart-model.test.ts
findings:
  critical: 2
  warning: 6
  info: 7
  total: 15
  necessity: 2
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-11-06T21:47:31Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 6 adds the hyperspace countdown, the deterministic witchpoint arrival, the v2 save schema
(market snapshot, pose, committed target), the galactic chart and the F2 Save/Load screen. The
persistence boundary is the strongest part of the change: `parseSave` is bounded before
`JSON.parse`, the shared `validateSaveSemantics` is genuinely shared by reader and writer, the
corrupt/future/unreadable classification is coherent, the writer fails closed, and the store
serialises revisions. The pure sim modules (jump math, countdown gate, arrival hash) are
deterministic and well pinned by tests.

The defects cluster in the new state machines around that core:

1. **Docking never cancels the hyperspace countdown.** The countdown is a sim field whose "am I
   counting" role is played by `hyperspaceCountdown > 0`, but the only exit paths are the commit
   and the explicit cancel. A dock (manual or computer) freezes it; it resumes on the next launch,
   and if a computer dock lands on the exact commit tick the jump commits after the dock event and
   leaves the station overlay over an in-flight state.
2. **The new F2 overwrite dialog's mouse Cancel path is not wired to the session.** After clicking
   Cancel, the next Save press is a silent no-op, which can lose a player's progress.
3. Two feedback defects feed the player wrong information: the flight HUD fuel is still the Phase 3
   constant (so it lies after every jump), and the short-range chart can move its selection to a
   system it does not paint.

Both critical findings are small, local fixes with clear tests. No security vulnerability was
found: every dynamic string goes through `textContent` or canvas text, the save parser is a
validated trust boundary, and the `?test=1` seam cannot persist.

## Narrative Findings (AI reviewer)

These are the reviewer's own findings from direct code review; no structural pre-pass was provided.

## Critical Issues

### CR-01: A dock never cancels the hyperspace countdown (frozen timer resumes; commit-after-dock soft-locks the UI)

**File:** `src/sim/flight/step.ts:238-277` (countdown tick), `src/sim/dock/step.ts:170-186`, `src/sim/dock/computer.ts:55-77`
**Issue:** `hyperspaceCountdown` is cleared only by `cancelHyperspace` and by the commit itself. Neither
dock path touches it, and `handleEvent("docked")` (`src/app/game-session.ts:1879-1911`) does not
either. Two failures follow:

1. **Frozen timer resumes after relaunch.** The tick gate is `modeAtStart === "inFlight"`
   (`step.ts:239`). After a dock the ship is `docked`, so the countdown freezes at its current value
   with `hyperspaceTarget` still set. On the next launch the mode returns to `inFlight` and the
   remaining steps run, so a jump the player never restarted commits — the full `576·dist²` clock
   advance (46,656 s for Lave→Diso), `fuelCost` deducted and a system swap. While docked H is the
   only obvious cancel, but `hyperspace` is `flight`-only (`src/input/actions.ts:308`), so it is
   inert exactly then; a different chart target committed while docked does cancel via step 1b, but
   nothing tells the player the timer is still live. A reload silently drops it (it is not in the
   save), so reload and no-reload diverged.
2. **Computer dock on the commit tick soft-locks the station overlay.** The `dockingComputer`
   command runs in the command phase and sets `mode = "docked"` (`computer.ts:55`), but step 4b still
   runs because it tests `modeAtStart`, not `state.mode`. If the timer reaches zero on that tick the
   jump commits (`step.ts:252-263`). `handleEvent("docked")` has already shown `#docked` and set the
   input context to `dockHome`; `handleHyperspaceJumped` then installs an in-flight state at the
   destination without hiding the station overlay or switching the context
   (`game-session.ts:1699-1727`). Every station action and the Launch button re-check
   `mode !== "docked"`, so the visible station UI is dead and the only escape is a page reload
   (which is recoverable: the arrival autosave is the newer blob).

Oolite is the source of truth here and it cancels explicitly: engaging the docking autopilot calls
`cancelWitchspaceCountdown` when the countdown status is active
(`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:3296-3297`,
`PlayerEntityControls.m:855-864`), and a manual dock leaves `STATUS_WITCHSPACE_COUNTDOWN`, so it can
never resume — whereas Wegolite's gate is re-entered by the next launch.
**Fix:** Clear the countdown in both dock paths and gate the tick on the live mode:

```ts
// src/sim/dock/step.ts, capture branch (and the same two lines in dockWithComputer)
state.mode = "docked";
state.hyperspaceCountdown = 0;
state.hyperspaceTarget = null;
```

```ts
// src/sim/flight/step.ts:239 — defence in depth against any other terminal transition
modeAtStart === "inFlight" &&
state.mode === "inFlight" &&
state.hyperspaceCountdown > 0 &&
!startedThisStep
```

Add two unit cases in `tests/sim/hyperspace.test.ts`: (a) begin, step twice, dock → countdown `0`,
target `null`, and stepping 1800 times still emits no `hyperspaceJumped`; (b) arm the timer at `1`
and issue `dockingComputer` with a fitted computer inside the aegis → one `docked` event, no
`hyperspaceJumped`.

### CR-02: Mouse Cancel on the overwrite dialog leaves `overwritePending` set, so Save silently stops working

**File:** `src/ui/save-load.ts:210-219`, `src/app/game-session.ts:1073-1099`
**Issue:** `manualSave` sets the session flag `overwritePending = true` before opening the dialog
(`game-session.ts:1089-1097`). Only the keyboard path (`saveScreenCancel`/`saveScreenReturn`, which
call `screen.cancelOverwrite()` and reset the flag) or leaving the screen resets it. The dialog's own
Cancel button handler sets only the module-local `confirming = false` and hides the dialog
(`save-load.ts:210-219`); it never notifies the session. After a mouse Cancel, every subsequent Save
(KeyS or the Save row) hits `if (!overwritePending) { … } return;` at `game-session.ts:1091-1093` and
does nothing — no dialog, no write, no notice. A player who believes they saved and then reloads
loses all progress since the previous autosave.

The same handler also bypasses `setConfirming(false)`, so
`[data-field="save-load-confirm"]` keeps the stale text `Overwrite the autosave? [Y/N]` after the
dialog is gone.

The e2e suite only exercises the keyboard cancel (`tests/e2e/save-load.spec.ts:278-285`), so the
mouse path is uncovered.
**Fix:** Route the button through the session like every other save-screen action:

```ts
// src/ui/save-load.ts
export interface SaveLoadScreen {
  /** Called when the player dismisses the overwrite dialog with the mouse. */
  onOverwriteCancelled(handler: () => void): void;
}

cancelButton.addEventListener("click", () => {
  setConfirming(false);          // clears the footer line as well as the dialog
  section.focus({ preventScroll: true });
  overwriteCancelled?.();
}, { signal: controller.signal });
```

```ts
// src/app/game-session.ts, next to saveLoad.onOverwriteConfirmed(...)
saveLoad.onOverwriteCancelled(() => {
  overwritePending = false;
  updateProbe();
});
```

Add a browser case: Save → confirm dialog → click `#save-load-confirm-cancel` → KeyS again →
`save.committed` increments exactly once and the footer confirm line is empty.

## Warnings

### WR-01: Flight HUD fuel is still the Phase 3 constant, so it lies after every jump

**File:** `src/app/game-session.ts:2179-2186`, `src/app/hud-model.ts:102-111,139` (`src/render/hud/draw.ts:400-407`)
**Issue:** `buildHudModel` never receives the profile's fuel. `buildBars` hard-codes `fuel: 1` with
the comment "Phase 3 has no fuel consumption", and `fuelText` is `formatFuel(config.maxFuel)`
(always `7.0 LY`). Phase 6 consumes fuel (`step.ts`/`handleHyperspaceJumped`), so after Lave→Diso
(`fuel 70 → 34`) the F5 status reads `3.4 Light Years` (`src/ui/station-model.ts:340`) and the chart
fuel circle is drawn from `profile.fuel` (`game-session.ts:1449`), while the flight HUD still paints
a full bar and `7.0 LY`. The HUD is the only in-flight tank readout and fuel gates every jump.
No test pins it: `tests/ui/hud-model.test.ts` never asserts `fuelText` or `bars.fuel`.
**Fix:** Pass the live tenths into the model and derive both the bar and the text from it:

```ts
export function buildHudModel(
  state, layout, config, message, flashAlpha = 0, hyperspaceTarget = "",
  fuelTenths = config.maxFuel,
): HudModel { /* ... */
  fuel: config.maxFuel > 0 ? clamp(fuelTenths / config.maxFuel, 0, 1) : 0,
  fuelText: formatFuel(fuelTenths),
}
```

`renderFrame` passes `profile.fuel`; extend `tests/ui/hud-model.test.ts` with a half-tank case and
assert the browser HUD message/readout after a jump.

### WR-02: Short-range chart arrow selection can land on a marker it never paints

**File:** `src/ui/chart-model.ts:420-442,502-522`, `src/ui/chart-draw.ts:123-125`, `src/app/game-session.ts:1605-1613`
**Issue:** `nearestInDirection` searches all 256 systems and is unbounded by the range window, while
`drawChart` skips a marker unless `visible || isCurrent || isTarget` (line 124) and `selectLabels`
forces only current/target (line 507). The selection is not forced. The design comment says every
system "stays reachable by arrow selection" (`chart-model.ts:278-280`), but nothing paints the
selected system when it is outside the window — the footer readout changes to a name the player
cannot see.

This is not an edge case: the short window is ±40 chart-x, Lave is at (20,173), and the first
ArrowRight selects Ermaso at (139,175) — 119 chart units away, off-window and unlabelled. Every
subsequent press walks further away. (The long range, `Tab`, shows it again, but the default range is
short.)
**Fix:** Treat the selection like the target:

```ts
// chart-draw.ts:124
if (!marker.visible && !marker.isCurrent && !marker.isTarget && !marker.isSelected) continue;

// chart-model.ts:507
const forced = marker.isCurrent || marker.isTarget || marker.isSelected;
```

Alternatively constrain `nearestInDirection` to `marker.visible` systems while `range === "short"`,
but that contradicts the recorded D-04 intent. Add a chart-model case: short range, Lave, one
`right` step → the selected marker is either visible or forced into the painted set.

### WR-03: Two H presses in one frame start the countdown instead of cancelling it

**File:** `src/app/game-session.ts:2296-2305`, `src/sim/flight/step.ts:147-153`
**Issue:** The "same key aborts" mapping is decided from `currentState.hyperspaceCountdown > 0`, i.e.
the state before the frame's commands run. When both `beginHyperspace` edges are drained into the
same `commands` array (reachable when the frame is long — a backgrounded tab, a SwiftShader stall,
or a fast double-tap), the pre-condition is false, so neither is mapped. The sim then drains both on
one step: the first starts the countdown and the second hits `if (state.hyperspaceCountdown > 0)
break;`. The player asked to start then abort and got a live countdown. This is the documented D-06
contract ("a second press aborts at no cost") failing on a same-frame pair.
**Fix:** Map relative to the array as well as the live state:

```ts
let countdownLive = currentState.hyperspaceCountdown > 0;
for (let index = 0; index < commands.length; index += 1) {
  const kind = commands[index]?.kind;
  if (kind === "cancelHyperspace") countdownLive = false;
  if (kind === "beginHyperspace" && countdownLive) {
    commands[index] = { kind: "cancelHyperspace" };
    countdownLive = false;
  } else if (kind === "beginHyperspace") {
    countdownLive = true;
  }
}
```

Extend `tests/input/bindings.test.ts` or a session-level test with a two-edge drain.

### WR-04: `handleHyperspaceJumped` lets the destination scene build throw after the jump is committed

**File:** `src/app/game-session.ts:1699` (contrast `:1213-1219`)
**Issue:** `enterSystemById(destination.id)` runs inside the fixed-step callback, after the sim has
already emitted `hyperspaceJumped` and advanced `clockSeconds` by `576·dist²` (`step.ts:252-263`).
`loadFromSave` guards the identical call with `try/catch` and falls back to a visible `failLoad`;
the live jump path does not. If `scenes.enterSystem` throws (GPU/scene build failure), the exception
escapes `currentLoop.advance` into `frame()`, where the next RAF is already scheduled
(`game-session.ts:2216`). The origin scene and system stay installed while the ship clock has jumped
by up to 166,464 s (the dist-17 maximum) and the countdown/target are cleared — a silent divergence
plus an uncaught `pageerror`, with no `showBootFailure`/`publishFailure` surface.
**Fix:** Wrap the enter/install block:

```ts
let arrivedLayout: SystemLayout;
try {
  arrivedLayout = enterSystemById(destination.id);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  showBootFailure(`Hyperspace arrival failed. ${reason}`);
  publishFailure(reason);
  return;
}
```

and add a unit/browser negative control (stub `scenes.enterSystem` to throw) asserting a visible
failure rather than an uncaught error.

### WR-05: Phantom requirement — `onProfileChanged` has no producer and duplicates the explicit autosaves

**File:** `src/app/game-session.ts:232-237, 877-884` (call site), `src/main.ts:232-252` (composition root)
**Category:** necessity
**Issue:** The option is documented as the purchase-autosave attach point ("Called after every
accepted profile change (purchase or dev-seam grant), so a reload cannot silently undo it"), but no
caller in the repository supplies it: the only occurrences are the declaration, the no-op default and
the call, and `main.ts` omits it. Durability is in fact provided by the explicit `autosave()` calls
in `confirmTrade` (`:652`) and `confirmFit` (`:721`); a dev-seam grant must *not* be saved, so wiring
this hook would be wrong for one of its two claimed cases. The guarded requirement has lapsed, so the
hook is unreachable wiring rather than a live seam.
**Fix:** Remove the option, the default and the call, and correct the comment so the durability
statement points at the explicit `autosave()` calls; or wire it in `main.ts` and delete the
duplicated `autosave()` calls (one owner, not two).

### WR-06: `destination === undefined` in the jump handler is an impossible-state guard that half-applies the jump

**File:** `src/app/game-session.ts:1686-1691`
**Category:** necessity
**Issue:** The guarded state cannot occur. `event.destinationId` is copied from
`state.hyperspaceTarget.id`, which `canStartJump` snapshotted from `StepOptions.hyperspace.target`;
that object is built from `targetSystem()` (`:1430-1441, 2330-2342`), which resolves through
`galaxyById.get`. `galaxyById` is populated once in `start()` (`:2386-2388`) and never mutated
afterwards. So `galaxyById.get(event.destinationId)` is guaranteed to hit for any committed jump. If
the branch ever ran it would be worse than throwing: the clock has already jumped and the target is
cleared, but the system does not change, leaving the session silently inconsistent.
**Fix:** Either drop the branch and rely on the resolution invariant (with a comment recording it), or
make the invariant explicit by failing loudly (`throw new Error(...)`/`publishFailure`) instead of
emitting a `"too far"` refusal that the player never asked for.

## Info

### IN-01: An in-session Load leaves the `?test=1` taint latched, disabling autosave for the session

**File:** `src/app/game-session.ts:1221-1280` (install block), `:1084-1088`
**Issue:** `loadFromSave` replaces `profile`/`state` from the validated save but never resets
`testTainted`. In a `?test=1` session that used the hook and then loaded (exactly the flow in
`tests/e2e/save-load.spec.ts:374`), every later autosave skips with `skipReason: "tainted"` and the
manual Save shows "Save skipped — test changes are not saved", even though the live state is the
saved state. Test-only reachability, so the product impact is nil, but the notice is misleading and
the harness can silently stop proving the save path after a load.
**Fix:** Clear `testTainted` in the synchronous install block (the tainted state no longer exists) and
add a case asserting one committed write after Load; or document the latch as intentional.

### IN-02: The global overlay still says "new game: Lave" after Continue or a jump

**File:** `src/main.ts:372-380`
**Issue:** `#status` is visible over the game (`index.html:625`, `#overlay`) and is set once to
`"Wegolite — new game: Lave"`. After Continue into another system, or after any hyperspace arrival,
the page still claims the new game is at Lave. Phase 6 makes this reachable in normal play.
**Fix:** Update the line from `probe.systemId`/the live system name (or hide it once the session
starts); the F5 screen already owns the authoritative "Present System" row.

### IN-03: Stale test documentation states the superseded Phase 4 launch clock

**File:** `tests/persistence/autosave.test.ts:4-10, 126-139`
**Issue:** The header says the launch snapshot is "post-`beginLaunch`, clock already +600 s", and the
first case is named "records the post-launch clock" while asserting `CLOCK_START + 600`. D-17
(`.planning/PROJECT.md:124`) and the shipped code (`game-session.ts:2287-2295`) take the anchor
*before* `beginLaunch`. `snapshotForSave` itself is correct, but the stale framing invites a future
maintainer to move the anchor back "to match the test".
**Fix:** Rename the case to what it proves ("records the clock of the state it is given") and correct
the header to the pre-launch anchor, citing D-17.

### IN-04: `MAX_SAVE_CARGO_ENTRIES` comment says 17 commodities

**File:** `src/persistence/save.ts:73-74`
**Issue:** "The most cargo entries one profile may carry (17 commodities)" — the cargo map has 16
tradeable keys; the 17th is the market snapshot's Alien Items, which the cargo allow-list
deliberately excludes (`src/main.ts:146-152`). The value is harmless (a 17th distinct key must be
non-allow-listed and is rejected), but the comment contradicts the D-15 rationale right below it.
**Fix:** Say "17 is the schema ceiling for the array; the allow-list caps valid entries at the 16
tradeable commodities".

### IN-05: Dead public surface on the new UI modules and the save parser

**File:** `src/ui/save-load.ts:31,253`; `src/ui/chart.ts:52,249-251`; `src/persistence/save.ts:337`
**Issue:** `SaveLoadScreen.isOpen()` and `ChartOverlay.paintCount` are declared and implemented but
never read in `src/` (the e2e reads `canvas[data-paints]`, not the getter). `MAX_VERSION_SNIFF_CHARS`
is exported but only used inside `save.ts`.
**Fix:** Delete them, or use `isOpen()` in place of the duplicated `saveScreenOpen` flag if that
consolidation is wanted; un-export `MAX_VERSION_SNIFF_CHARS`.

### IN-06: The chart and Save/Load overlays are not modal to focus or assistive tech

**File:** `index.html:741-753` (`#chart`), `:754-812` (`#save-load`); `src/ui/save-load.ts:238-247`
**Issue:** Both are full-screen, opaque, `z-index: 10` siblings of `#docked`, but neither is a
dialog (`role`/`aria-modal`) and nothing makes `#docked` inert. Focus is left on (or can Tab to) the
station screen's Launch button behind the overlay; `#chart` never moves focus at all. This phase
already treats the title and overwrite confirmations as `alertdialog`s with focus management and a
Tab trap, so the omission is inconsistent. (No launch is possible through the hidden button — the
frozen-frame branches clear `pending` — so this is an accessibility/quality gap, not a state bug.)
**Fix:** Give both overlays `role="dialog" aria-modal="true"` with a label, focus the overlay on open,
set `inert`/`aria-hidden` on `#docked`/`#overlay` while they are open, and trap Tab as
`save-load.ts:173-191` already does for the confirm dialog.

### IN-07: `RESERVED_F_KEYS` comments say "four" while six are reserved

**File:** `src/input/keyboard.ts:19-20, 347-352`
**Issue:** The set contains F2, F3, F5, F6, F7, F8 (`src/input/actions.ts:270-277`) but both comments
describe "the four browser-reserved F-keys". A future editor trusting the comment could drop F2/F6
from the capture guard and reintroduce browser defaults for the two Phase 6 screens.
**Fix:** Refer to the set instead of a count, or say six.

---

_Reviewed: 2026-11-06T21:47:31Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
