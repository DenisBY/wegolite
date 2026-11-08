---
status: diagnosed
trigger: "The disabled \"Buy docking computer\" control on the Docked screen must look clearly disabled and carry its refusal reason."
created: 2026-11-05T00:00:00Z
updated: 2026-11-05T00:00:00Z
---

## Current Focus

hypothesis: Confirmed. The DOM `disabled` flag is set correctly, but no author `:disabled` rule exists, so `#docked button` forces the same green border/text/cursor/hover on the disabled control; the refusal `<dd>` auto-places into the `dl` label column because it has no `<dt>`; and the Controls screen can only render the bound code ("C") because the Shift requirement is a private keyboard-layer set.
test: grep index.html for `:disabled` (none) vs `#docked button` author rules; inspect markup order in the 2-column `dl` grid; trace `labelFor`/`ACTION_LABELS`
expecting: n/a — root cause confirmed
next_action: Report root cause; no fix in this mode

## Symptoms

expected: On the Docked screen at Lave with 100.0 Cr, the "Buy docking computer" control is visually distinct from an active control (the Launch button), and the refusal reason "Requires TL 9" is presented with the control rather than floating under the label column. The Controls screen shows the docking-computer chord as "Shift+C".
actual: User reported "does not look disabled" with a screenshot where "Buy docking computer" is styled identically to "Launch" (same bright green border and text), and "Requires TL 9" sits under the label column, outside the Buy row.
errors: None reported.
reproduction: Dock at Lave, open the Docked screen panel.
started: Discovered during UAT for Phase 04 (manual docking).

## Eliminated

- hypothesis: The session never sets `buyDockComputer.disabled`, so the control is genuinely active.
  evidence: `src/ui/docked.ts:95` assigns `buyDockComputer.disabled = view.disabled`; `src/app/game-session.ts:322-326` returns `disabled: true` for the `techLevel` refusal at Lave; `tests/e2e/docking.spec.ts:390-393` asserts `toBeDisabled()` and passes. The defect is presentation, not state.
  timestamp: 2026-11-05T00:00:00Z

- hypothesis: Another stylesheet or an injected `<style>` block overrides the disabled appearance (e.g. a `[disabled]` rule elsewhere).
  evidence: `rg -n ":disabled|\[disabled\]"` over the repo (excluding `node_modules`, `third_party`) returns zero hits; `index.html` is the only stylesheet (`<style>` at line 7); `rg` for `createElement("style")`, `.style.`, `adoptedStyleSheets`, `insertRule` in `src/` finds only the HUD canvas width/height writes. The styles that apply are exactly the inline block.
  timestamp: 2026-11-05T00:00:00Z

- hypothesis: The reason text is rendered by a separate out-of-flow element positioned by script.
  evidence: `index.html:289` places `<dd class="docked-message" data-field="dockcomp-message">` as the 11th grid child of the `dl`; `src/ui/docked.ts:94` only writes `textContent`. Position comes from CSS grid auto-placement, not script.
  timestamp: 2026-11-05T00:00:00Z

## Evidence

- timestamp: 2026-11-05T00:00:00Z
  checked: `index.html:7-260` (the single inline stylesheet) for any disabled styling
  found: `rg -n "disabled" index.html` returns **no** hits. `#docked button` (lines 130-138) sets `border: 1px solid #33ff66; background: transparent; color: #33ff66; cursor: pointer` unconditionally, and `#docked button:hover, #docked button:focus-visible` (lines 140-144) fills `background: #33ff66; color: #000` without excluding `:disabled`.
  implication: An author rule with explicit `color`/`border`/`cursor` beats the UA `:disabled` styling, so the disabled Buy control renders with exactly the Launch button's border colour, text colour, opacity 1 and pointer cursor — and even takes the hover fill. Nothing in the cascade distinguishes the two states.

- timestamp: 2026-11-05T00:00:00Z
  checked: `src/ui/docked.ts:92-96` and `src/app/game-session.ts:303-334`
  found: `setDockComputer` writes `dockComputerField.textContent = view.line`, `dockComputerMessageField.textContent = view.reason`, `buyDockComputer.disabled = view.disabled`. `dockComputerView()` returns `{line, disabled: true, reason: "Requires TL 9"}` for the `techLevel` case.
  implication: The state and copy are correct in the DOM; only the presentation layer is wrong. The refusal string is delivered to the same `dd` that is misplaced.

- timestamp: 2026-11-05T00:00:00Z
  checked: `index.html:275-296` (`#docked` markup) against `index.html:108-113` (`#docked dl { display: grid; grid-template-columns: auto 1fr }`)
  found: The `dl` children are `dt,dd` × 5 then a bare `<dd class="docked-message" data-field="dockcomp-message">` as the 11th child. Row-major auto-placement puts the 5th `dd` (the dockcomp line) at row 5 column 2, and the reason `dd` starts row 6 **column 1** — the `auto` label column. The reason `dd` has no preceding `dt` and no `aria-describedby` link to the button.
  implication: "Requires TL 9" renders in the narrow label column, detached from both the value it qualifies and the Buy control below, exactly as the screenshot shows. It is also invalid `dl` grouping (a `dd` without a `dt`), so assistive tech announces it as an unlabeled field.

- timestamp: 2026-11-05T00:00:00Z
  checked: `index.html:292-295` (button order/gap) and `src/ui/docked.ts:115-117`
  found: `button[data-action="buy-dockcomp"]` is immediately followed by `button[data-action="launch"]` with no gap/margin rule; both are 100% width with 1 px borders, so the disabled secondary sits above the primary Launch with zero separation and equal weight.
  implication: Even after a `:disabled` style is added, the pair still reads as one segmented control rather than secondary-vs-primary; the disabled control is the more prominent of the two. (UI review W-03; corroborates the screenshot.)

- timestamp: 2026-11-05T00:00:00Z
  checked: `src/ui/controls.ts:184-202`, `src/input/actions.ts:82`, `src/input/bindings.ts:146-161`, `src/input/keyboard.ts:38-46`
  found: The Controls row renders `label.textContent = ACTION_LABELS[action]` (= `"Docking computer (Shift+)"`) beside `codes.textContent = labelFor(bindings, action)`, and `labelFor` maps only `map[action]` codes through `codeLabel`, so `KeyC` → `"C"`. The knowledge that this action requires Shift lives in `REQUIRES_SHIFT`, a module-private `ReadonlySet` in `src/input/keyboard.ts:44`, not exported and not consulted by the UI. `palette`-wise the chords are otherwise stored as plain `KeyboardEvent.code` values by design (04-04 decision).
  implication: The Controls screen physically cannot print "Shift+C": it renders the raw bound code plus a dangling "(Shift+)" fragment on the action label. Discoverability of the chord is broken independently of the Buy control, with no data path from the keyboard layer to the UI.

- timestamp: 2026-11-05T00:00:00Z
  checked: regression coverage for this surface
  found: `tests/e2e/docking.spec.ts:384-397` asserts the exact line text, the reason text and `toBeDisabled()` only — no computed-style or layout assertion, no `aria-describedby` check, no Controls-label assertion for "Shift+C". `rg -l "createDockedPanel|buy-dockcomp" tests/` finds only the e2e locator; there is no unit test over the docked panel DOM.
  implication: The suite is green while the control is visually indistinguishable; nothing pins the presentation contract, so a pass here is not evidence the UAT expectation holds.

- timestamp: 2026-11-05T00:00:00Z
  checked: prior review findings and git history
  found: `.planning/phases/04-manual-docking/04-UI-REVIEW.md` W-02/W-03 and `.planning/phases/04-manual-docking/04-VERIFICATION.md:310-311` already recorded all three defects (label column, identical disabled styling, `"Docking computer (Shift+)"` beside `"C"`). `git log --oneline -- index.html src/ui/docked.ts src/ui/controls.ts src/input/actions.ts` shows no commit after `dd0ea2d` touched these files, so the review was never actioned.
  implication: The defects are known, unaddressed, and reproducible from the current tree rather than a regression.

## Resolution

root_cause: >
  The disabled state is applied correctly (`src/ui/docked.ts:95`) but is styled
  nowhere: `index.html` has no `:disabled` rule at all, and the author rule
  `#docked button` sets the same border, text colour, transparent background,
  opacity and `cursor: pointer` as the enabled Launch button (with `:hover` not
  excluding `:disabled`), so the disabled Buy control renders identically to an
  active one. Separately, the refusal reason is a bare `<dd>` with no `<dt>`
  in a two-column `display: grid` `dl` (`index.html:108-113,287-289`), so
  auto-placement drops it into column 1 — the label column — detached from the
  value and the button, and it has no `aria-describedby` association. Third, the
  Controls screen renders only the bound code via `labelFor` (`"C"`) while the
  Shift requirement is a module-private set in `src/input/keyboard.ts:44`, so
  the chord cannot be displayed as "Shift+C" and the action label carries a
  dangling `"(Shift+)"` fragment instead.
fix: (diagnosis only)
verification: (not applicable — find_root_cause_only)
files_changed: []
