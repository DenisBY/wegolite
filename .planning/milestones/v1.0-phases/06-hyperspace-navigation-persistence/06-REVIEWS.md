# Phase 6 — Independent Review Validation

Three independent reviewers were run after `06-REVIEW.md`:

| Reviewer | Focus | Verdict |
| --- | --- | --- |
| `reviewer-algorithm-claude-opus-5-5` | Algorithms, invariants, determinism, precision | Found one new critical: arrival teleport |
| `reviewer-correctness-claude-sonnet-5-5` | Behaviour vs plans/requirements, state machines, coverage | Confirmed CR-01/CR-02, added H-3 arrow coverage and test gaps |
| `reviewer-adversarial-claude-opus-5-5` | Trust boundaries, data loss, exploits | Confirmed CR-01/CR-02 and arrival teleport in Docker + browser |
| `reviewer-architect-claude-opus-5-5` | Root cause, ownership, layering | Confirmed all, re-rated arrival teleport Critical, proposed layer-correct fixes |
| `reviewer-triage-claude-haiku-5-5` | Independent existence check and ranking | Confirmed 15 findings, UNCERTAIN only on frequencies |

All reviewers ran tests and reproductions in Docker only. Scratch files were mounted from `/tmp` (`/tmp/wg-val`, `/tmp/wg-review`, `/tmp/wg-fix`); no tracked file was modified by a reviewer.

## Consolidated verdict

| Finding | `06-REVIEW.md` | Independent verdict | Final severity |
| --- | --- | --- | --- |
| Arrival/restore teleports the ship (dock clamp fires with `dockArmed=false`) | not found | **CONFIRMED** by algorithm, adversarial, architect; 73.0–73.6% of real routes, median ~180 km, max 751 km | **Critical** |
| CR-01 Dock never cancels the countdown | Critical | **CONFIRMED** in sim and browser | **Critical** |
| CR-02 Mouse Cancel latches `overwritePending` | Critical | **CONFIRMED** in browser; Accept has the same desync | **High** |
| WR-01 HUD fuel constant | Warning | **CONFIRMED** | **Medium** |
| WR-02 Chart arrows select unpainted far systems | Warning | **CONFIRMED**; 42% of first presses land off-window, 4 systems unreachable | **Medium** |
| WR-03 Two H presses in one frame start instead of cancel | Warning | **CONFIRMED** | Low |
| WR-04 Jump half-applies if `enterSystemById` throws | Warning | **CONFIRMED** ordering; throw reachability low | Low |
| WR-05 `onProfileChanged` has no producer | Warning | **CONFIRMED** | Low |
| WR-06 Unreachable `destination === undefined` branch | Warning | **CONFIRMED** | Low |
| IN-01..IN-07 | Info | **CONFIRMED** | Info |
| Enter confirms overwrite while Cancel is focused | UI review blocker | **CONFIRMED** in browser; contradicts the focus comment | **High** (data loss) |
| In-session Load keeps messages/scrape timer after `flightTime` reset | not found | **CONFIRMED**; stale message lasted 904 s in reproduction | **Medium** |
| Writer gate skips system/station allow-list checks | IN-05 adjacent | **CONFIRMED**; latent, current callers pass validated ids | Low |
| `loadFromSave` no re-check after await | not found | **CONFIRMED**; small race | Low |
| Oolite mass-blockage check missing | not found | **CONFIRMED absent**; v1 space is empty, no blocker exists | Out of scope |
| Chart is vertically mirrored vs Oolite | not found | **CONFIRMED**; needs a recorded decision or a flip | Decision |

## Evidence highlights

### Arrival teleport (new Critical)

- `src/sim/hyperspace/arrival.ts:92` and `src/persistence/autosave.ts:257` set `dockArmed = false`.
- `src/sim/dock/step.ts:153-157` clamps any ship with `box.min.z < -depth` onto the dock plane, with no x/y footprint bound, so it acts as an infinite wall.
- Browser, Lave → Diso: saved pose `(8179.6, 0, -2528.4)`; after 0.19 s the live pose was `(-718, -202467, -131902)` — 240.4 km away. Reload → Continue repeated the 240.4 km snap because the autosave holds the pre-teleport pose.
- Real-route census: 1,278/1,750 edges (73.0%) across galaxy 0, 10,678/14,516 (73.6%) across all eight galaxies; median shift ~180 km, max 751 km.
- Sim test: a ship flying back toward the witchpoint stayed pinned at `z = -250` — an invisible wall.
- Why green: `hyperspace.spec.ts` samples the probe before the first fixed step; arrival unit tests never step with a dock geometry.
- Fix: set `dockArmed = true` in both producers (architect measured 0 displaced, 0 events, nearest arrival 209 km from a station); update `hyperspace-arrival.test.ts:158` and `autosave.test.ts:668`, make the e2e wait for frames, add an every-route stepped test.

### Countdown survives docking

- Browser: computer dock froze the timer at 1,499; after launch the jump to Diso committed with no H press — fuel 70 → 34, clock +46,656 s.
- Commit-tick dock emits `[docked, hyperspaceJumped]`; `#docked` and `dockHome` survive into `inFlight`, and every station action, W, arrows, H, F2/F8 and Launch are inert. Reload recovers from the arrival autosave.
- Fix is sim-only: gate the tick on `state.mode === "inFlight"` and clear the countdown when a dock occurs (one site covers manual and computer dock). This amends D-06, so record it in PROJECT.md.

### F2 overwrite confirm

- Mouse Cancel leaves `overwritePending = true`; later S/click/Enter do nothing and the stale “Saved at…” notice remains.
- Mouse Accept also leaves the dialog state stale and focus on `BODY`.
- Enter is bound to `saveScreenConfirm` and `preventDefault`s the focused button, so Enter on Cancel commits the overwrite (committed 1 → 2).
- Fix: use `saveLoad.isConfirming()` as the single source of truth, route both buttons through it, and make Enter follow the focused button (or accept Y only).

### Chart arrows

- `lateral * 1000 + forward` lets alignment dominate distance: Right from Lave selects Ermaso (47.6 LY, off-window); 42% of first presses land off-window, 68% out of jump range; Retila, Beusrior, Veale and Xexedi are unreachable from any origin.
- Fix in `src/ui`: reject `lateral > forward`, score squared distance; pass only visible systems from `moveChartSelection`.

### HUD fuel

- `src/app/hud-model.ts:109-110,139` still returns `fuel: 1` and `formatFuel(config.maxFuel)`; after Lave→Diso the tank is 34 but the HUD reads full/7.0 LY.
- Fix: pass `profile.fuel` as a required parameter.

## Fix order

1. Arrival teleport (blocks NAV-05/SAVE-03 on most routes).
2. Countdown-vs-dock lifecycle (resumed jump + soft-lock).
3. F2 overwrite confirmation (data loss).
4. HUD fuel.
5. Chart arrow selection.
6. In-session Load message/scrape reset, target reset on arrival, post-await screen re-check.
7. Writer allow-list gate, test-seam rebind, remaining info items.
8. Record the vertical-mirror and mass-blockage decisions.

## Verdict

The phase cannot pass verification as-is. Findings 1–3 reproduce in the browser and invalidate phase-goal claims; they must be fixed before `phase.complete`.
