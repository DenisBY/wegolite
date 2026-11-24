# Phase 20 Plan Review

Review basis: repository source at `791cec0` and Oolite source at pin `7437f22`. No builds or tests were run, as requested.

## 20-01

**Summary**

This plan establishes the simulation’s single death path: the ledger detects the lethal record, `killPlayer` performs the one mode transition, the player becomes collision-destroyable, the simulation freezes, and persistence refuses to encode a dead player. It also retires the old tripwire and introduces a producer-scope guard.

**Strengths**

- The lethal decision is placed where the damage is actually applied, using the pre-floor bank. `routeDamage` and `routeScrapeDamage` floor energy and return `applied` at `src/sim/combat/shields.ts:159-179` and `src/sim/combat/shields.ts:199-212`, so the proposed `energyBefore - applied <= 0` test avoids the next-tick recharge trap.
- The call placement fits the real combat pipeline. `resolveShots` applies the ledger, performs NPC kills, applies the player push, drains AI events, commits removals, and updates ident at `src/sim/combat/step.ts:798-837`. Inserting `killPlayer` after `applyPlayerPush` gives the required event order and allows a culprit destroyed on the same tick to remain nameable.
- Culprit resolution is compatible with actual collision records. Collision records carry the other collider’s id as `source` at `src/sim/combat/collide.ts:804-824`, while static ids resolve to `"buoy"`, `"buoy-witchpoint"`, or `"coriolis-station"` through `src/sim/world/statics.ts:79-100,167-172`.
- The freeze addresses a genuine fail-open site: the current clock block advances whenever the mode is not `"docked"` and then increments the tick at `src/sim/flight/step.ts:442-478`.
- The persistence backstop targets real danger: `snapshotForSave` currently maps every non-`inFlight` mode to `"docked"` at `src/persistence/autosave.ts:114`. Its only production app caller is `buildSnapshotInputs` at `src/app/session/save-controller.ts:158-182`, and the throw occurs before `queueSnapshot`.
- The stop-and-report requirement for the unmeasured 250 m/s case is appropriately cautious; it prevents fixture or kernel manipulation merely to obtain the expected death.

**Concerns**

- **MEDIUM — Pin maintenance could conceal regressions.** Task 3 generally instructs the executor to alter scenarios that now end in death so that they keep the player alive. Existing scenarios include non-vacuity-sensitive collision and hash work such as `tests/sim/world/collision-cadence.test.ts:130-205` and tightly pinned combat twins at `tests/app/session/tick-parity.test.ts:714-840`. Slowing or re-shielding every newly lethal scenario is not automatically the smallest correct response: for some, the new correct assertion is that the player dies.
- **LOW — The atomic commit is large.** It spans combat, flight, events, persistence, guards, and many tests. The atomicity is justified by the retired tripwire and the save invariant, but it increases the importance of recording every post-full-suite fixture change and its reason in the SUMMARY.

**Suggestions**

- Require every changed legacy scenario to assert its intended final mode (`"inFlight"` or `"dead"`) and to retain its original non-vacuity evidence. If a scenario’s subject is a lethal ram, prefer converting it into an explicit death case rather than weakening the contact until it survives.
- If any twin literal changes, halt the affected fixture work and report it before claiming a green suite, rather than treating “full suite green” and “never re-pin” as independently achievable.

**Risk Assessment: MEDIUM**

The core design is well matched to the source, but the breadth of the pin sweep carries regression-masking risk.

## 20-02

**Summary**

This plan covers the death contract’s edge cases: safe dock/jump/launch ticks, countdown and ident cleanup, mutual kills, lethal rams and bank-only comparisons, ledger boundaries, malformed-input properties, and fail-closed behavior at every exported sim entry point.

**Strengths**

- The planned tests follow actual transition ordering. Docking emits `docked` before `stepPlayerCombat`, which then performs `dockReset` and returns at `src/sim/combat/step.ts:198-215`; the hyperspace tick skips the world through `src/sim/sim.ts:114-131`. These are meaningful tests, not assumptions about mode names.
- The two live-mode writers warrant explicit guards: `applyWitchpointArrival` writes `"inFlight"` at `src/sim/hyperspace/arrival.ts:118-150`, and `completeLaunch` writes it without a mode check at `src/sim/flight/launch.ts:127-133`.
- The bank-only test exercises the actual distinction between response reversal and ledger lethality. `selfDestroyed` compares raw ram damage against bank energy at `src/sim/combat/response.ts:281-310`, while shield absorption happens later in the ledger.
- Mutual-kill coverage is compatible with the ledger’s apply-before-kill architecture, and swapping spawn order tests outcome stability without incorrectly demanding identical entity ids or hashes.
- The internal-damage gates are preserved exactly where they currently exist at `src/sim/combat/ledger.ts:211-227`, matching Oolite’s different laser and scrape behavior at `PlayerEntity.m:5683-5697` and `PlayerEntity.m:5744-5752`.

**Concerns**

- **MEDIUM — One necessary freeze edit is known but left to discovery.** The freeze table explicitly includes direct `resolveShots` calls, yet neither 20-01 nor the planned file list gives `resolveShots` a dead-state guard. Today `resolveShotHits` drains NPC fire, recharges ships/statics, and cools ships at `src/sim/combat/step.ts:471-493`; `resolveShots` can then run collisions, the ledger, kills, and world commits at `src/sim/combat/step.ts:758-838`. A direct call on a dead state therefore need not be hash-preserving even though `stepSim` and `stepFlight` return early.
- **LOW — The repair license is broader than the task file declarations.** Task 1 permits fixes anywhere under `src/sim/combat/`, although its `<files>` list contains only `death.test.ts`. That makes the test a useful detector but weakens execution predictability and file-budget checks.

**Suggestions**

- Add an explicit first-statement dead-state return to `resolveShots` in the plan, including `src/sim/combat/step.ts` in the modified-file list and a test proving no NPC recharge, fire-queue drain, collision, or event emission occurs for a dead player.
- Keep the generic fail-open repair clause as a backstop, not as the primary mechanism for this already-identified path.

**Risk Assessment: MEDIUM**

Production entry through `stepSim` is covered, but the advertised “every exported entry point” guarantee needs the direct `resolveShots` guard to be made explicit.

## 20-03

**Summary**

This plan supplies QUAL-11’s combined determinism scenario: an NPC-on-NPC kill, a collision kill, and the player’s death, replayed at 30, 60, and 144 Hz with a stable post-death hash.

**Strengths**

- Step-indexed sampling directly solves the frozen-tick termination problem. The existing runner uses the fixed-step accumulator, frame clamp, and five-step cap at `tests/sim/world/collision-cadence.test.ts:209-229`; replacing its tick-based completion with a step budget is the correct adaptation.
- The non-vacuity assertions are essential: all three kill kinds must be observed at each cadence, at equal step indices, before declaring hash equivalence.
- The scenario reuses meaningful existing building blocks: full hulls and collisions from `tests/sim/world/collision-cadence.test.ts:45-67`, NPC fight fixtures, and real death through `stepSim`, rather than calling `killPlayer` directly.
- No source or frozen acceptance files need to change, limiting the determinism test’s blast radius.

**Concerns**

- **MEDIUM — Scenario construction is the main feasibility risk.** Arranging two independent NPC and collision kills before one player death, with no source changes and identical timelines at three cadences, can become a lengthy fixture search. The plan’s “stop and report” fallback would leave QUAL-11 incomplete if the events cannot be arranged reliably.
- **LOW — Diagnosing cross-cadence divergence could be cumbersome without a compact per-step event timeline alongside the hash logs.**

**Suggestions**

- Prove the combined timeline in a `/tmp` scratch scenario before writing the final test, recording each kill’s step index and the player’s death step.
- Log a cadence-independent trace of `{step, event kind, victim kind, cause}` for every kill and include it in assertion failures, so a timing difference is distinguishable from a missing kill or an accumulator defect.

**Risk Assessment: MEDIUM**

The design is correct and isolated, but constructing a non-vacuous three-kill timeline is more delicate than the file count suggests.

## 20-04

**Summary**

This plan adds the application’s death latch, routed `deathFlow`, `gameOver` input context, traffic-independent player explosion, and layered save refusals. It is the central DEATH-06 implementation.

**Strengths**

- The latch is synchronous inside event dispatch, ahead of timers, later animation frames, and subsequent save attempts. The real router dispatches synchronously at `src/app/session/event-router.ts:734-742`, and the sim driver calls it directly after each step at `src/app/session/sim-driver.ts:229-243`.
- Defaulting a missing `deathFlow` to `createDeathFlow(ctx)` follows the existing `worldLifecycle` fallback at `src/app/session/event-router.ts:726-733` and prevents an omitted test or construction dependency from disabling the latch.
- The refusal layers address the real producers. `autosave`, `manualSave`, and direct `writeManualSave` all converge on `buildSnapshotInputs` and `queueSnapshot` at `src/app/session/save-controller.ts:158-235,243-325`.
- The pending-write reasoning is sound: a write queued before death is a valid pre-death anchor and may commit; only later producers are refused.
- `PLAYER_EXPLOSION_SETTINGS` avoids unconditional content loading while preserving the traffic-off explosion. The compiled record’s duration and other fields exist at `src/content/generated/explosions.json`, and the drift test correctly compares the restated constant against it.
- The `gameOver` context is fail-closed in the actual keyboard implementation: no contextual action means only reserved F-keys are swallowed at `src/input/keyboard.ts:161-165`, and non-flight contexts return the zero input frame at `src/input/keyboard.ts:234-249`.
- Closing the chart/save screen before setting the final input context correctly handles their context-restoring side effects.

**Concerns**

- **LOW — A pending pre-death write can erase the visible `"dead"` skip reason.** The completion callback clears `saveSkipReason` on a successful commit at `src/app/session/save-controller.ts:197-212`. If death and a later refused save occur while that write is pending, the callback can leave the probe showing a successful status and an empty skip reason even though the latch remains set. Save integrity is unaffected, but post-death diagnostics can become misleading.
- **LOW — The default no-deps flow only guarantees the latch, not the full shutdown.** That is acceptable for test construction, but it should remain clear that production must always use the facade-wired deps; otherwise chart/HUD/message cleanup and the explosion are absent.

**Suggestions**

- Preserve valid completion fields for a pre-death write, but when `ctx.runtime.gameOver` is set, either retain `saveSkipReason = "dead"` or reassert it after the completion callback rather than clearing it.
- Add an integration assertion that the facade-created router includes the fully wired death flow, so the default minimal path cannot silently become the production behavior.

**Risk Assessment: MEDIUM**

The save-safety architecture is strong; remaining risk is chiefly integration and diagnostic consistency rather than dead-state persistence.

## 20-05

**Summary**

This plan implements a self-contained game-over model and DOM overlay: title, cause, score, prompt, fresh-Space or click reload, safe text rendering, and the required HTML/CSS.

**Strengths**

- Reusing `formatRating` at `src/ui/station-model.ts:537-540` preserves Oolite’s rating shape, and the kill count remains correctly deferred rather than introducing LAW scope.
- The name resolver deliberately differs from `identName`: unlike the raw-key fallback at `src/app/session/event-router.ts:324-337`, it returns `undefined`, ensuring no spec key or entity id reaches the screen.
- The fresh-press rule uses the browser’s real `event.repeat` edge semantics and works with the input context introduced in 20-04. Listeners existing only while shown and a one-shot reload guard prevent early or repeated reloads.
- `textContent`-only rendering, injected reload/key targets, and disposal through one `AbortController` are appropriate for Node tests and avoid HTML injection.
- A separate DOM overlay avoids the pinned eleven-element HUD surface and leaves the scene visible.

**Concerns**

- **LOW — The score template is not byte-faithful to Oolite.** The planned literal at `.planning/phases/20-player-death-and-game-over/20-05-PLAN.md:146` uses an ordinary space before `₢`. Oolite’s `third_party/oolite/Config/descriptions.plist:1991` contains U+00A0 between `[credits_number]` and `₢` (bytes `c2 a0`). The proposed expected strings also use an ordinary space, so the tests would enshrine rather than detect that difference.
- **LOW — No planned browser journey uses the mouse-click exit.** The shell test covers it with doubles, but the two browser specs in 20-09 describe fresh-Space interaction. A real overlay-root click would additionally cover markup, focus, stacking, and listener wiring together.

**Suggestions**

- Copy the exact U+00A0 character into `GAME_OVER_SCORE_TEMPLATE` and add a code-point assertion for the separator before `₢`.
- Use a mouse click instead of Space in the no-save variant of `death-and-reload.spec.ts`. This covers both accepted inputs without adding a third spec or violating D-16.

**Risk Assessment: LOW**

The module is localized and well tested; the main issue is one subtle text-fidelity discrepancy.

## 20-06

**Summary**

This plan freezes the runtime around a dead session: remaining fixed steps become no-ops, the manual hook refuses to advance the world, the frame loop only drains input and renders presentation, and pause/focus/context/chart routes refuse to reopen anything.

**Strengths**

- The frame branch is placed before the current chart and save-screen handlers at `src/app/session/frame-loop.ts:127-168`, preventing those queues from reopening overlays or running in-flight world advancement behind the chart.
- `stepOnce` has an identified mutation-free insertion point before `previousPose`, controller updates, option construction, and the sim call at `src/app/session/sim-driver.ts:173-249`.
- The `advanceTicks` design preserves its existing refusal contract: return before `markHookMutation` and break on the latch in the loop at `src/app/session/sim-driver.ts:420-459`.
- The pause guard covers the real fan-out: `focusLost`, the P toggle, and `enterContextLoss` all use `pause()` at `src/app/session/settings-controller.ts:63-98,121-125`.
- Wall-time `gameOverSeconds` remains independent of the frozen simulation clock and works under both real and manual clock modes.
- Testing death on step two of a five-step frame addresses the most consequential same-frame race directly.

**Concerns**

- **LOW — This plan depends heavily on final integration order rather than isolated guards alone.** The crucial proof is that the death flow, chart closure, loop reset, and frame branch all execute after one real lethal `stepOnce`; the proposed real-router test is therefore more important than the individual refusal cases and should not be reduced to mocks.
- No HIGH or MEDIUM correctness issue was found in the specified branch placement or refusal inventory.

**Suggestions**

- Keep the full lethal-frame integration case as the tracer’s primary assertion: lethal on step two, no later steps, no later autosave/docked/launch activity, then only presentation on subsequent frames.
- Include a visibility-change/focus-loss sequence followed by a chart and pause attempt in the same test session to detect latch state leaking between refusal routes.

**Risk Assessment: LOW**

The changes are broad but mechanical, and the planned real-frame integration test addresses the principal ordering risk.

## 20-07

**Summary**

This plan wires the game-over overlay from `main.ts` through session construction and displays the four lines synchronously in the death flow. It relies on page reload and the existing boot/title behavior rather than adding an in-session load path.

**Strengths**

- The root plumbing follows a proven lifecycle: the pause overlay is created at `src/app/session/start-session.ts:769-781` and disposed at `src/app/session/start-session.ts:1007-1018`.
- Showing the lines after the latch ensures an absent overlay cannot weaken save safety; the no-DOM no-overlay test preserves that priority.
- The cause text is sourced from live compiled tables through `ctx.core.npcTraffic?.catalogue` and `ctx.core.targetNames`, whose ownership and traffic dependency are explicit at `src/app/session/context.ts:188-217`.
- The no-new-title-logic decision matches actual boot behavior: `title.setContinueVisible(bootSave !== undefined)` and the ordinary Continue callback already exist at `src/main.ts:379-393`.
- Avoiding a new in-session load pipeline removes substantial complexity and is consistent with D-12.
- Identical lines across absent/corrupt/future/unreadable/unavailable save statuses correctly keeps game-over presentation independent of persistence state.

**Concerns**

- **LOW — Most success evidence is necessarily deferred.** Node tests can prove line construction and overlay invocation, but only 20-09 can prove reload, boot-read, Continue, and save restoration. This is a reasonable dependency split, but 20-07 should not be treated as independently satisfying criterion 3.
- No scope or architectural defect was found in the root lifecycle or reload-only exit.

**Suggestions**

- Keep 20-07’s claimed completion wording limited to “overlay wired and shown”; reserve the end-to-end title/Continue criterion for 20-09 and the phase gate.
- Add a disposal assertion that the overlay hides and its listeners are removed before the scene and input are disposed.

**Risk Assessment: LOW**

The work is primarily established-pattern plumbing, with end-to-end coverage explicitly scheduled afterward.

## 20-08

**Summary**

This plan supplies the dead presentation: aft camera with the 100 m displacement, animated explosion/shots/debris on a presentation clock, hidden HUD, five-second saturation fade, redraw settling, and `probe.death`.

**Strengths**

- `computeViewCamera` already provides the ship-relative view offset and orientation at `src/render/launch-camera.ts:121-145`. Moving the ship pose along local forward before requesting the aft view is consistent with Oolite’s `VIEW_AFT` plus `moveForward:100.0` at `PlayerEntity.m:6203-6209`.
- The presentation clock fixes a real defect: `stepSim` freezes `flightTime`, while explosion particles are evaluated from `flightTime - start` at `src/render/bodies/explosions.ts:452-476`. Adding `gameOverSeconds` only to visual layers leaves simulation and hashes untouched.
- Using `PLAYER_EXPLOSION_SETTINGS.duration` with the five-second fade yields the correct settle time of five seconds; the generated record’s duration is only 1.5 seconds.
- The redraw strategy is efficient: draw continuously during the effect, then let `RedrawGate.next` settle and idle using its existing behavior at `src/app/redraw-gate.ts:56-79`.
- The CSS filter adds no draw calls, and the death probe is absent unless latched, preserving the sampled probe-shape fixture.

**Concerns**

- **MEDIUM — Cross-browser acceptance of the visual effect remains manual.** The current Firefox project is restricted to `engine` and `core-loop` specs at `playwright.config.ts:43-50`, so the two new Chromium-oriented specs will not exercise the fade in Firefox. The planned UAT addresses this, but an incorrect canvas-filter assumption could otherwise survive every automated gate.
- **LOW — Filter cleanup is not explicit in session disposal.** The plan writes `renderer.domElement.style.filter` in the render driver, while session disposal currently tears down scenes and HUD without a render-driver cleanup hook at `src/app/session/start-session.ts:1020-1045`. Page reload makes this mostly harmless, but same-page test/session replacement can inherit a stale filter until another render resets it.

**Suggestions**

- Add a non-pixel computed-style assertion to one of the already-planned browser specs, and retain the explicit manual Firefox UAT for actual canvas rendering; do not add a third spec.
- Clear the canvas filter and `data-dead` attribute through an explicit render-driver cleanup called from session `dispose()`, rather than relying on the next render or page reload.

**Risk Assessment: MEDIUM**

The camera and clocks are well reasoned; the remaining risk is browser rendering behavior and lifecycle cleanup.

## 20-09

**Summary**

This plan adds the Node death twin and the two permitted browser specs: manual-clock death/reload/Continue plus an untainted real-time game-over guard. It also covers no-save title behavior and CI timeout margins.

**Strengths**

- The route is deterministic and uses production data and restore semantics. `FixturePose` already includes speed at `tests/e2e/helpers/save-fixtures.ts:32-37,78-91`, and `restoreFromSave` restores it at `src/persistence/autosave.ts:272-295`; there is no hidden need to accelerate through input in the Node twin.
- Requiring the Node twin to prove lethality from the restored full shields and bank before writing browser assertions is the right precondition. Existing recorded collision analysis also supports the route: `.planning/PROJECT.md:333` records approximately 1,712 player damage at 350 m/s against the nav buoy.
- The untainted guard is meaningful. `createTestHook.advanceTicks` and spawn methods taint at `src/app/probe.ts:637-653`; avoiding every hook member means `save.writes` and the raw blob can actually change if the death protection fails.
- Seed production uses the real writer and strict boot reader, and docked damaged-equipment Continue coverage already exists at `tests/e2e/save-load.spec.ts:651-728`.
- Probe-only waits, Node-twin tick pins, explicit timeout budgets, and the 60% CI-margin rule address timing and CI-flake risk without pixel or wall-clock assertions.
- The no-save case correctly deletes the raw blob outside the app rather than using a tainting session mechanism.

**Concerns**

- **MEDIUM — D-16’s 90% Vitest ratio is not controlled during design.** The guard spec describes many post-death invariants across Space repeat, H, F2, P, Escape, F6, held W, blur, and visibility change. Depending on Assertion granularity, browser assertions could approach the extensive new Vitest inventory. The SUMMARY merely reports the ratio after implementation rather than making it a design budget.
- **MEDIUM — The untainted real-time death is the phase’s most fragile test.** It combines asynchronous content loading, real animation frames, a physical ram, held-key handling, visibility events, and IndexedDB verification. Probe waits and the twin reduce timing guesswork, but they do not remove environment-dependent frame scheduling or real-time input races.
- **LOW — The fallback reduces browser-level DEATH-06 evidence.** If the ram is not lethal, the hooked fallback cannot prove the untainted save refusal because a hooked session never writes. The plan records this honestly, but owner visibility is essential.

**Suggestions**

- Budget assertions before implementing: aggregate per-trigger probe snapshots into a small number of browser assertions, and record the Vitest/browser totals in an acceptance criterion rather than only in the retrospective SUMMARY.
- Assert a firm pre-death checkpoint in the guard: restored pose and speed equal the seed, `probe.test.tainted` is false, and Space is still held before the first fatal contact. This prevents a missed ram from becoming a misleading guard failure.
- Use a mouse click for one reload path to cover D-07’s second input without expanding the suite.

**Risk Assessment: MEDIUM**

The design deliberately addresses taint and determinism, but runtime complexity and assertion budgeting remain material execution risks.

## 20-10

**Summary**

This plan performs documentation and milestone close-out: Key Decisions, requirement wording, FIDELITY rows and pinned excerpts, todo resolution, CHANGLEOG verification, remote `verify-full`, and the frozen 20-seed acceptance run.

**Strengths**

- The reviewer-agreement precondition is unusually strong and correctly rejects silence, inferred consent, or generic plan approval as evidence for a specific divergence. Requiring named accepting comments and citation locations implements the project’s fidelity rule faithfully.
- The contract test genuinely verifies Wegolite paths, citation/excerpt correspondence, excerpt lengths, Key Decisions quotations, and optional verbatim Oolite source at `tests/contract/fidelity.test.ts:1-21`.
- Excerpt extraction from `git show 7437f22:` avoids the documented checkout-versus-pin drift. The planned Oolite sites are consistent with the pin: `getDestroyedBy:` at `PlayerEntity.m:6187-6221`, the game-over methods around `PlayerEntity.m:3551-3566,3630`, game-over controls at `PlayerEntityControls.m:4016-4027`, and direct loading at `Universe.m:2961-2967`.
- Rewriting DEATH-01 without checking off requirements preserves the verification workflow’s ownership of completion state.
- QUAL-11 is closed with both independent artifacts: cross-cadence evidence from 20-03 and the by-hand 21/21 acceptance run at the actual phase HEAD, with trigger-path and frozen-detector diff checks.
- No version bump, Unreleased move, tag, acceptance-threshold edit, or unneeded asset provenance is introduced.

**Concerns**

- **MEDIUM — Close-out can legitimately halt on evidence rather than code.** Every divergence needs an explicit accepting comment, all FIDELITY links must resolve to post-implementation lines, the verbatim contract must pass, and remote release gates must be green. Any one can block completion despite the implementation itself being correct.
- **LOW — Plist citation handling needs care.** The FIDELITY row parser expects Oolite row cells under `src/Core/...`, and excerpt headings under `src/...` at `tests/contract/fidelity.test.ts:40-49`; `Resources/Config/descriptions.plist` does not fit those patterns. A dedicated plist row/excerpt written mechanically like the other rows would fail validation.

**Suggestions**

- For the game-over strings, use `showGameOver` as the FIDELITY Oolite cell and retain an inline citation to the already-vendored `third_party/oolite/Config/descriptions.plist:1991-1993`; do not invent an unsupported `Resources/...` excerpt row.
- Before Task 1, create a checklist mapping every FIDELITY divergence to its named reviewer comment and its eventual Key Decisions substring. After Tasks 1–2, run both contract modes before attempting the expensive remote gate.
- Keep the conditional fallback and any non-green 20-seed or browser results prominent in the SUMMARY rather than burying them under a successful final rerun.

**Risk Assessment: MEDIUM**

This is low-code work but high process risk, concentrated in review evidence, source citations, and remote gate completion.

## Cross-plan assessment

- **Coverage:** DEATH-01, DEATH-06, and QUAL-11 are each addressed through simulation, application, presentation, persistence, and integration layers without introducing escape pods, kill tallies, LAW behavior, version release work, or other backlog scope.
- **Dependency ordering:** The wave graph is coherent. Notably, 20-08 correctly depends on 20-04 for the explosion settings and 20-07 for the CHANGELOG entry; 20-09 depends on both the runtime guards and probe; 20-10 transitively depends on all implementation plans.
- **Security:** The principal controls are well targeted: no entity ids in payloads, no HTML parsing of names, fresh-only restart input, no hooked untainted-save false confidence, and three layers preventing a dead save.
- **Performance:** Freezing the sim bounds ongoing work; the redraw loop settles after five seconds; and the CSS fade adds no WebGL draw calls.
- **Principal residual risks:** the direct `resolveShots` freeze guard should be made explicit; collision-pin edits must not mask intended new deaths; the combined QUAL-11 scenario needs early feasibility proof; and the real-time untainted browser guard needs careful assertion and timeout budgeting.
- **Overall risk: MEDIUM.** The plans are detailed and source-aware, with no identified phase-blocking architectural defect. Execution risk is dominated by integration breadth and verification discipline rather than conceptual uncertainty.

## Divergence verdicts

- DIV-1 (launching player never dies): ACCEPT — Oolite’s death check excludes only docked players (`PlayerEntity.m:6189`) and its laser death branch is at `PlayerEntity.m:5683-5689`, so restricting Wegolite death to `inFlight` is a real divergence. It prevents an unsc可控 launch cinematic from entering a partially implemented death flow and consistently preserves the owner’s dock/launch safety boundary.
- DIV-2 (explosion form, D-01): ACCEPT — Oolite’s `becomeLargeExplosion:4.0` emits four small and four big fragment bursts (`PlayerEntity.m:6208`, `ShipEntity.m:8308-8320`), whereas this uses one pooled cloud at the corresponding scale. The reuse preserves a legible large explosion without adding particle systems or draw calls; the UAT should confirm the visual result remains convincing.
- DIV-3 (cause line, D-02): ACCEPT — Oolite’s `showGameOver` displays only game-over, score, and prompt lines (`PlayerEntity.m:3630`, `descriptions.plist:1991-1993`). A concise cause line provides useful browser-game feedback, does not alter simulation or save behavior, and safely uses compiled names with name-free fallbacks.
- DIV-4 (no 30 s auto-restart, D-06): ACCEPT — Oolite restarts after `kDeadResetTime` in `performDeadUpdates` (`PlayerEntity.m:99,3551-3562`). Waiting for explicit input avoids racing the player through the cause and score, while fresh Space and click provide a reliable exit with or without a loadable save.
- DIV-5 (input rule, D-07): ACCEPT — Oolite’s Space latch is in `pollGameOverControls` at `PlayerEntityControls.m:4016-4027`. Requiring a fresh press prevents a key held during combat from accidentally reloading, and click support is appropriate for a browser UI; both exits reach the same guarded one-shot path.
- DIV-6 (reload to title, D-12): ACCEPT — Oolite directly invokes `loadPlayerIfRequired` at `Universe.m:2961-2967`, but Wegolite already has a boot path that validates saves and exposes Continue only when appropriate (`src/main.ts:379-393`). Reloading reuses that boundary, avoids a second in-session restore implementation, and preserves the “never save a dead player” invariant.
- DIV-7 (frozen world): ACCEPT — Oolite continues dead-window updates while `performDeadUpdates` handles fade/reset (`PlayerEntity.m:3551-3562`), whereas the owner explicitly requires a deterministic dead hash. Freezing sim state while advancing only presentation clocks gives a stable replay surface and keeps all further kills, saves, and AI effects out of the death window.
- DIV-8 (no equipment removal): ACCEPT — Oolite calls `removeAllEquipment` at `PlayerEntity.m:6220`, but Wegolite restores the stored save after reload rather than continuing with the dead entity. Since the profile and equipment are never mutated by `killPlayer`, skipping this transient teardown has no durable effect and avoids unnecessary destructive work.
