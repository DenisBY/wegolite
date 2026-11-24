---
phase: "20"
slug: "player-death-and-game-over"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-23"
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| ledger record -> player state | a hit record (possibly from a malformed or hook-spawned source) decides whether the player dies | game state (no personal data) |
| sim event -> app | the `playerDestroyed` payload crosses into the app; it must carry no entity id and no kill credit | game state (no personal data) |
| exported sim writers -> flight mode | any caller (the app, a test hook path) can call an exported writer on a dead state | game state (no personal data) |
| frame delta -> fixed step | the accumulator turns an arbitrary frame rate into fixed steps; a cadence-dependent kill would break determinism | game state (no personal data) |
| sim event -> session state | the death event changes what the session may do next (save, pause, input) | game state (no personal data) |
| session -> IndexedDB | a snapshot crosses into durable storage; a dead state must never cross | game state (no personal data) |
| `?test=1` hook -> session | a page script can drive the session; it must not produce a dead save | game state (no personal data) |
| keyboard and pointer -> page reload | the only input accepted on the game-over view reloads the page | game state (no personal data) |
| compiled names -> DOM | a culprit name is written into the page | game state (no personal data) |
| browser events (blur, visibilitychange, webglcontextlost) -> session | focus and context events reach `pause()` and the context-loss handlers | game state (no personal data) |
| `?test=1` hook -> sim driver | `advanceTicks` steps the world on demand | game state (no personal data) |
| compiled content -> DOM | culprit names and labels from the compiled catalogue reach the page | game state (no personal data) |
| game-over view -> page lifecycle | the view's input reloads the page; the boot read then decides Continue | game state (no personal data) |
| session state -> window probe | the probe is read by page scripts (`?test=1` specs) | game state (no personal data) |
| render -> sim | the render driver must not write sim state | game state (no personal data) |
| test page scripts -> session | specs drive the session through `?test=1` hooks and seeded IndexedDB | game state (no personal data) |
| CI runner -> timeouts | a slower runner must not turn a correct spec red | game state (no personal data) |
| quoted Oolite source -> FIDELITY.md | GPL excerpts enter the repository and must be verbatim from the pin | game state (no personal data) |
| local checkout -> remote test machine | the wrapper ships the committed HEAD to the remote for the gates | game state (no personal data) |
| render layer -> GPU | per-add options decide how many instances are drawn; the pool and the draw objects are fixed at build time | game state (no personal data) |

---

## Threat Register

Register authored at plan time (the `<threat_model>` block of each plan); evidence verified at HEAD by gsd-security-auditor on 2026-11-23.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-20-01 | Tampering | `applyLedger` player branch on a non-finite or negative amount or bank | medium | mitigate | Plan 20-01; evidence: ledger.ts:203, :234 (finite skips); death.property.test.ts:106 | closed |
| T-20-02 | Information disclosure | `playerDestroyed.cause.culprit` leaking an entity id out of the world | medium | mitigate | Plan 20-01; evidence: events.ts:46-49 (no EntityId in payload); death.ts:41-46; entity-id-scope guard green | closed |
| T-20-03 | Elevation of privilege | a second death or a revive through repeated records or calls | medium | mitigate | Plan 20-01; evidence: death.ts:63; ledger.ts:209; sim.ts:84; flight/step.ts:143; combat/step.ts:780; death.test.ts:227, :286 | closed |
| T-20-04 | Repudiation | removing the tripwire without its replacement behaviour, or a second `playerDestroyed` producer added later | medium | mitigate | Plan 20-01; evidence: commit b10e191 (tripwire removed with the death); tests/guards/player-death-producer.test.ts:69-148 | closed |
| T-20-33 | Tampering | a dead player encoded as `docked` by an autosave or manual save in the commits between this plan and 20-04 (no latch yet) | high | mitigate | Plan 20-01; evidence: persistence/autosave.ts:104-106 (throws on dead); save-controller.ts:162, :198; save-controller.test.ts:413; autosave.test.ts:160 | closed |
| T-20-35 | Repudiation | a ram outcome pinned without a measurement, or a legacy scenario weakened until it survives so that an intended death is hidden | medium | mitigate | Plan 20-01; evidence: collision-buoy.test.ts:304, :349, :374 (measured rams pinned); collision-stage.test.ts:573 | closed |
| T-20-05 | Elevation of privilege | `applyWitchpointArrival` / `completeLaunch` writing `"inFlight"` on a dead state | medium | mitigate | Plan 20-02; evidence: hyperspace/arrival.ts:125; flight/launch.ts:131; death-freeze.test.ts:230-262 | closed |
| T-20-06 | Tampering | malformed ledger input (non-finite bank, shields or amount) producing a false death or a throw | medium | mitigate | Plan 20-02; evidence: death.property.test.ts:41-52 (NaN/±Inf), :106; ledger.ts:203, :234 | closed |
| T-20-07 | Denial of service | a same-frame step after the lethal one mutating the frozen hash | low | mitigate | Plan 20-02; evidence: death.test.ts:1019-1020; death-freeze.test.ts:230 | closed |
| T-20-08 | Repudiation | a cadence scenario that passes vacuously (no kill, or ended on its frame bound) | medium | mitigate | Plan 20-03; evidence: death-cadence.test.ts:368-391 (non-vacuity), :460-461 (ends by step count) | closed |
| T-20-09 | Tampering | editing the frozen acceptance thresholds to make a run pass | high | mitigate | Plan 20-03; evidence: `git diff 43f594d HEAD -- tests/acceptance` empty | closed |
| T-20-37 | Repudiation | a per-kind fallback that silently weakens criterion 4's "one scenario", or a shift common to all cadences that equality alone cannot see | medium | mitigate | Plan 20-03; evidence: death-cadence.test.ts:8, :99-118, :404 (literal pins, no fallback) | closed |
| T-20-10 | Tampering | overwriting the last good save with a dead or "docked" player | high | mitigate | Plan 20-04; evidence: save-controller.ts:259, :298, :341 (latch first), :162, :198; autosave.ts:104; save-controller.test.ts:436-592 (races) | closed |
| T-20-11 | Tampering | a missing `deathFlow` in some construction path leaving the session unlatched | medium | mitigate | Plan 20-04; evidence: event-router.ts:900 (default createDeathFlow); death-flow.test.ts:254 | closed |
| T-20-12 | Elevation of privilege | input reaching the flight controller or station screens after death | medium | mitigate | Plan 20-04; evidence: input/keyboard.ts:152; event-router.ts:765; frame-loop.ts:124-129 | closed |
| T-20-13 | Tampering | HTML injection through a culprit name | low | transfer | Plan 20-04; evidence: transferred to 20-05: game-over.ts:198 writes textContent only | closed |
| T-20-41 | Tampering | `loadFromSave` or `clearSaveForNewGame` replacing or clearing the save after a death, or a late completion hiding the `dead` refusal | medium | mitigate | Plan 20-04; evidence: save-controller.ts:394, :573, :217; save-controller.test.ts:503, :521, :554, :581 (note below) | closed |
| T-20-14 | Tampering | HTML injection through a culprit name or a line | low | mitigate | Plan 20-05; evidence: game-over.ts:198; no innerHTML/outerHTML/insertAdjacentHTML/DOMParser in game-over.ts or event-router.ts | closed |
| T-20-15 | Denial of service | a held or repeated key reloading the page repeatedly or before the view shows | low | mitigate | Plan 20-05; evidence: game-over.ts:180-183 (one-shot), :188 (repeat ignored), :204-205 | closed |
| T-20-16 | Spoofing | a default browser action (page scroll, a focused control) consuming Space | low | mitigate | Plan 20-05; evidence: game-over.ts:189, :201; index.html:2141 (tabindex -1) | closed |
| T-20-17 | Elevation of privilege | `resume()` or `advanceTicks` restarting a dead session | medium | mitigate | Plan 20-06; evidence: settings-controller.ts:110; sim-driver.ts:438 (before markHookMutation), :462, :191 | closed |
| T-20-18 | Tampering | the remaining fixed steps of the lethal frame emitting docked/autosave/station work | medium | mitigate | Plan 20-06; evidence: event-router.ts:764; sim-driver.ts:191; sim-driver.test.ts:1915, :1955 | closed |
| T-20-19 | Denial of service | an overlay (pause, chart) stealing focus or input from the game-over view | low | mitigate | Plan 20-06; evidence: settings-controller.ts:70; chart-controller.ts:60, :75, :127, :206, :255; chart-controller.test.ts:249 | closed |
| T-20-40 | Repudiation | a test that passes vacuously because the path it names is never reached (the frame case and the `stepOnce` early return) | low | mitigate | Plan 20-06; evidence: sim-driver.test.ts:1915, :1955-1964 | closed |
| T-20-20 | Tampering | a name or label injected as HTML | low | mitigate | Plan 20-07; evidence: game-over.ts:82-92 (resolveCulpritName from compiled tables), :198 | closed |
| T-20-21 | Elevation of privilege | an in-session load or a save rewrite on game over | medium | mitigate | Plan 20-07; evidence: only location.reload: game-over.ts:173; death-flow.test.ts:786 | closed |
| T-20-22 | Denial of service | a leaked overlay listener after the session is disposed | low | mitigate | Plan 20-07; evidence: start-session.ts:1024-1026; game-over.ts:175, :202-205, :213-217 (AbortController); game-over.test.ts:160 | closed |
| T-20-23 | Information disclosure | `probe.death.cause` exposing an entity id | low | mitigate | Plan 20-08; evidence: app/probe.ts:438-441 (cause is a key string); probe-publisher.ts:376-385 | closed |
| T-20-24 | Tampering | the presentation clock or the debris drift leaking into the sim or the hash | medium | mitigate | Plan 20-08; evidence: render-driver.ts:229-243, :457, :465; no gameOverSeconds under src/sim; render-driver.test.ts:1834 | closed |
| T-20-25 | Denial of service | a CSS filter or redraw loop costing frames forever | low | mitigate | Superseded by T-20-42 (plan 20-12, D-01e, owner-confirmed 2026-11-24): the visibility redraw bound was removed; the dead view redraws every frame while shown, accepted at a flight frame's cost | superseded |
| T-20-42 | Denial of service | `shouldDraw` drawing every dead frame while the game-over view is shown | low | accept | Plan 20-12, D-01e: the coasting camera changes the image every frame; ends on Space or a click; a hidden tab gets no animation frames; no draw call, timer or allocation added | accepted, verify at /gsd-secure-phase |
| T-20-43 | Tampering | the coasting camera or the dead dust arguments leaking into the sim or the hash | medium | mitigate | Plan 20-12: locals only, no `src/sim` change, Vitest pins `hashWorld`, `hashFlight`, the pose and debris to 600 s | open, verify at /gsd-secure-phase |
| T-20-26 | Repudiation | a browser spec that passes on wall-time luck | medium | mitigate | Plan 20-09; evidence: death-twin.test.ts:113 (tick 1682) feeds both specs; no waitForTimeout/screenshot/Date.now | closed |
| T-20-27 | Tampering | a fixture the production writer could not write | low | mitigate | Plan 20-09; evidence: tests/e2e/helpers/save-fixtures.ts:88-104 (production encoder) | closed |
| T-20-28 | Denial of service | a new spec timing out on the slower CI runner | low | mitigate | Plan 20-09; evidence: death-and-reload.spec.ts:83-84; game-over-guard.spec.ts:78, :87-88; ci-e2e-timeout-margins todo:147-156 | closed |
| T-20-34 | Repudiation | a guard spec that cannot fail because its session is tainted (a hooked session never writes) | medium | mitigate | Plan 20-09; evidence: game-over-guard.spec.ts:47 (no manual clock), :128, :198 (tainted only), :185, :222, :302, :306, :320 | closed |
| T-20-39 | Repudiation | game-over-guard racing the wall clock: the death arriving before Continue, the baselines or the held Space, so a missed checkpoint reads as a guard result | medium | mitigate | Plan 20-09; evidence: save-fixtures.ts:137 (5000 m run-up), :146-154; game-over-guard.spec.ts:78, :215 (named checkpoint) | closed |
| T-20-29 | Repudiation | a FIDELITY excerpt not matching the pinned Oolite lines (checkout drift) | medium | mitigate | Plan 20-10; evidence: tests/contract/fidelity.test.ts:287-306 (verbatim mode, pin 7437f22) | closed |
| T-20-30 | Repudiation | a divergence recorded without reviewer agreement or a Key Decisions row (including silence counted as agreement, or a DIV-9, DIV-2 or DIV-7 row written without its `## Round 2` verdicts) | medium | mitigate | Plan 20-10; evidence: fidelity.test.ts:264-274; 20-REVIEWS.md:954, :980-1020 (explicit ACCEPTs) | closed |
| T-20-31 | Tampering | a gate made green by editing acceptance thresholds | high | mitigate | Plan 20-10; evidence: `git diff 43f594d HEAD -- tests/acceptance` empty; AGENTS.md frozen-detector rule | closed |
| T-20-32 | Information disclosure | licence obligations of quoted excerpts | low | mitigate | Plan 20-10; evidence: fidelity.test.ts:276-285 (ASSETS.md row) passes | closed |
| T-20-38 | Repudiation | a FIDELITY Wegolite cell into a file Phase 20 edited that still resolves but now names another statement, or a quoted Key Decisions title deleted under a row that still quotes it | medium | mitigate | Plan 20-10; evidence: E-45 cites shields.ts:170; drift check: 2 intentional rewrites only (E-45, HUD row) | closed |
| T-20-36 | Denial of service | the player's eight bursts overwriting a same-tick NPC explosion (D-09) in a pool of 8, or a seed or burst-kind change altering every Phase 16 explosion | low | mitigate | Plan 20-11; evidence: render/bodies/explosions.ts:119 (EXPLOSION_POOL = 16); explosion-layer.test.ts:160, :402, :665, :834, :857 | closed |
| T-20-SC | Tampering | npm/pip/cargo installs | low | accept | no package is installed or changed; evidence: package.json and package-lock.json unchanged 43f594d..HEAD (accepted) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Audit note (non-blocking, T-20-41):** only the committed branch of the `queueSnapshot` completion keeps `saveSkipReason = "dead"` (src/app/session/save-controller.ts:217); the two failure branches (:225, :232) overwrite it with the failure reason when a pre-death write fails after the latch. Only a probe/diagnostic string changes; no write path opens. Candidate follow-up todo.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-20-01 | T-20-SC | Supply chain (npm installs): Phase 20 installs or changes no package; package.json and package-lock.json are unchanged across the phase | Plan threat registers (all 11 plans), confirmed by gsd-security-auditor | 2026-11-23 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-23 | 42 | 42 | 0 | gsd-security-auditor (opus), ASVS L1, block_on high |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-23
