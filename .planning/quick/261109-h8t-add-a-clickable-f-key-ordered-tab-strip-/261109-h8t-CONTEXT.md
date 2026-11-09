# Quick Task 261109-h8t: Clickable F-key-ordered tab strip for the docked station computer - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Task Boundary

Add a clickable tab strip to the docked station computer (`#docked`), and to the F6 chart and F2 save/load overlays that cover it. One tab per Oolite F-key, ordered by key:

`Home | F1 Launch | F2 Save/Load | F3 Outfitting | F4 Interfaces | F5 Status | F6 Chart | F7 System data | F8 Market`

Out of scope (separate later tasks): Oolite repeat-F-key cycling (F5 again to manifest, F6 again short to long, F8 again to market info); a persistent ship-summary strip in the header; Shipyard and Market Info content; missions/contracts content.

</domain>

<decisions>
## Implementation Decisions

All decisions below were made by the owner in conversation, after a three-agent review (UX vs Oolite, technical feasibility, input/accessibility) and a second three-agent review (grouping, Oolite fidelity, registry architecture).

### Tab set and grouping
- One tab per F-key, in F-key order. Home is first and has no F-key (it is Wegolite's own menu screen, D-01).
- Do not merge F3/F5/F6/F8 onto one tab. A split Market+Hold view does not fit 1280x720 vertically, and Oolite keeps these screens separate.
- Sub-tabs only for real Oolite sub-pages: Status | Manifest (F5, `stationPage` 1/2) and Short | Long (F6, `chartRange`). Tab/PageUp/PageDown paging stays unchanged (D-04); arrow keys must never switch tabs (Left/Right are sell/buy-max in Outfitting).
- Hidden registry slots (status `hidden`, never rendered) are reserved for Shipyard (F3 sub-page, only on stations with a shipyard) and Market Info (F8 sub-page). No visible placeholder tab for them.

### F4 Interfaces
- Live tab, not a greyed placeholder. It opens a real screen showing the Oolite empty state: "No interfaces are installed on your ship or enabled at this station" (Oolite `PlayerEntity.m:8586`, `descriptions.plist:1906`). Contracts/missions (PROG-01) fill it later.

### Launch
- `F1 Launch` is enabled only on Home (D-03) and disabled on every other screen. A tab click must never launch from a section, from the chart or from the save screen.

### Architecture
- Data-driven registry in `src/ui/station-tabs.ts` (pure data and helpers, no DOM, no Three.js). A tab stores an `ActionId`; the displayed key is derived from `DEFAULT_BINDINGS`, so there is no second F-key list. Availability derives from `ACTION_CONTEXTS` plus paused/launching guards.
- One `navigateStation()` in `game-session.ts` routes clicks through the existing `openStationScreen`, `backToHome`, `openChart` and F2 open paths, closing an open overlay first so the input context restores. Clicking the active tab is a no-op.
- The same registry-hydrated `<nav aria-label="Station computer">` is rendered into `#docked`, `#chart` and the save-load screen (the overlays are siblings that cover `#docked`). It is hidden on the chart when not docked (F6 also works in flight). Active tab carries `aria-current="page"`.
- Tab buttons: `tabindex="-1"`, `mousedown` preventDefault, so native Enter/Space and keyboard focus are unaffected. Table/list rows stay non-focusable (T-05-25). Do not use `role="tablist"`.
- `keyHints()` is generated from the registry; screen-specific hints stay as a suffix.

### Layout and style
- Strip font about 15px so nine tabs fit one row at 1280x720; `flex-wrap` only as a safety net. Selected and focus-visible states must differ (underline or marker for selected). New borders/dim colours must reach 3:1 contrast (do not reuse `#1a5a2c` / `.dimmed` for control boundaries or disabled text).
- Vertical budget is tight (fixed footer, `padding-bottom: 14rem`): verify at 1280x720.

### Tests
- Unit `tests/ui/station-tabs.test.ts`: two-way drift (every live tab has a binding; every station/chart/saveLoad F-key action has a tab), availability matrix, `activeTabId` precedence, `keyHints` derivation.
- E2E: click each tab; overlay-to-overlay context restore; F1 disabled off Home; no launch from a tab; keyboard focus not stolen; no wrap at 1280x720.
- Keep existing hooks (`data-field`, `#station-screen[data-screen]`, `tr[data-key]`) and the "Market (F8)" style home strings unless intentionally updated.

### Claude's Discretion
- Exact label wording and abbreviations that fit the width budget.
- Exact data shape of registry entries and helper names.
- Visual details of the selected/disabled states within the contrast rule.
- Whether Home's existing menu tiles also become clickable (nice-to-have; same `navigateStation` sink, `tabindex="-1"`).
- Behaviour of a tab click while an Outfitting `[Y/N]` confirmation is pending: reuse whatever the F-key path does today (`openStationScreen` clears pending state).

### Resolved after research (see 261109-h8t-RESEARCH.md)
- Widen `RESERVED_F_KEYS` to include F1 and F4 so the browser help key cannot fire while docked (verify the claim in the container-tested e2e path; if it cannot be asserted, keep the code change and note it as untested).
- Do NOT add a FIDELITY.md row (it requires a verbatim excerpt pinned to Oolite commit 7437f22); record the divergences (tab strip, Home screen, Launch only from Home) in `.planning/PROJECT.md` Key Decisions only.
- Home menu tiles stay non-clickable in this task (out of scope; keeps T-05-25 surface unchanged).
- The Launch tab must NOT carry `data-action="launch"` (eight specs and `scene.spec.ts:131` rely on exactly one match); give the tabs their own `data-station-tab` attribute and route Launch through the existing launch command/guard.
- Tab availability is evaluated against a base context (`dockHome` when `stationScreen === "home"`, else `dockScreen`) plus overlay flags, not the live input context; `navigateStation` adds its own `paused`, `contextLost` and `saveLoad.isConfirming()` guards.
- F4 uses a literal empty-state constant with a Vitest guard that reads the vendored `third_party/oolite/Config/descriptions.plist` line (research says line 1861); F4 touches `ActionId`, `ACTION_IDS`, `DEFAULT_BINDINGS` (F4 and Digit4), `ACTION_LABELS`, `ACTION_CONTEXTS`, `STATION_SCREEN_ACTIONS`, the `StationScreen` union, the `probe.ts` union, index.html panel + CSS, and the README Controls table (pinned by `tests/contract/readme.test.ts`). No save-schema change.
- Scope the nav CSS by container id (`#docked`, `#chart`, save screen) because `#docked button` outranks class selectors and inverts colours on hover; use measured-contrast colour `#2f8a47` (4.85:1) or brighter for borders/disabled text.
- The fast `verify` gate must exercise the new nav: add a smoke assertion to an existing fast spec or add the new spec to `test:e2e:fast`.

</decisions>

<specifics>
## Specific Ideas

- Oolite has no tab strip and no Home menu; the strip and Home are deliberate Wegolite improvements, so FIDELITY.md/PROJECT.md should record them as divergences.
- Oolite F4 is never blocked: it always opens, with the empty-state text when no interface entries exist.
- Record the decisions in `.planning/PROJECT.md` Key Decisions. All docs, commit messages and planning artifacts in English.
- Verification is Docker-only: `docker compose run --rm verify`, and `docker compose run --rm verify-full` because input and render code change.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/05-docked-economy-station-screens/05-CONTEXT.md` (D-01 one station computer, D-02 persistent chrome, D-03 Launch only from Home, D-04 F5 two pages)
- `.planning/REQUIREMENTS.md` (v2 list: PROG-01 missions/contracts, PROG-03 shipyard)
- `AGENTS.md` (Docker-only gates, sim purity, documentation language)
- Oolite checkout `/home/opencode/git/oolite`: `src/Core/Entities/PlayerEntityControls.m:3910-4030` (F-key screen switching), `src/Core/Entities/PlayerEntity.m:8586-8680` (Interfaces empty state), `Resources/Config/descriptions.plist:1906`

</canonical_refs>
