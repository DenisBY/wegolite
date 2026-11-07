# Phase 7: Hardening & Community Release - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the existing launch → fly → dock → trade → jump loop fast, verifiably working on the supported browsers, documented, and legally clean enough to hand to the Oolite community. Requirements: QUAL-01 … QUAL-08 (see `.planning/REQUIREMENTS.md`). No new gameplay capability is added in this phase.

</domain>

<decisions>
## Implementation Decisions

### Source publication and licensing (QUAL-07)
- **D-01:** Publish the source before the release. Push local `main` to `DenisBY/wegolite` after the licence audit, so the `NOTICE` section 4 source offer becomes true. — **Reversibility:** one-way — a public push cannot be recalled once cloned or indexed. Execution is an outward-facing action and needs explicit owner confirmation at the moment of push, not only this decision.
- **D-02:** The public repo carries the built source. `.planning/` publication is not decided here; see Open Items.
- **D-03:** The site footer and `NOTICE` link to the public repository. The licence documents (`NOTICE`, `LICENSE`, `ASSETS.md`) ship in the built site output, not from `public/` by hand-copy (research Pattern 1).

### Hosting and CSP (QUAL-07, QUAL-08)
- **D-04:** The Content-Security-Policy is delivered as a `<meta http-equiv>` tag in `index.html` now. It works on any static host. — **Reversibility:** reversible — moving to a response header later is a host-config change, not a code change.
- **D-05:** The hosting target is not chosen. An HTTP response header for CSP is added when a host that supports it is selected.

### Release title and version (QUAL-07)
- **D-06:** The release title is `Wegolite 0.1.0`, taken from `package.json`. The four places that currently say "foundation build" (title, footer, README, manifest) are updated together. — **Reversibility:** reversible.

### Browser scope (QUAL-02)
- **D-07:** Supported browsers are **current stable Chrome and current stable Firefox**. Safari is NOT claimed. Do not write "Safari", "WebKit" or "macOS" as supported in README, the footer, or release notes.
- **D-08:** No minimum version numbers are stated beyond "current stable". — **Reversibility:** reversible.
- **D-09:** The cross-browser test runs as a separate Compose service `e2e-cross` with a documented command. `docker compose run --rm verify` stays Chromium-only. Firefox is added to the image for this service only (research Critical Finding 4). — **Reversibility:** costly — it defines the image layout and the verify chain.

### Performance proof (QUAL-01)
- **D-10:** 60 fps is proved in two parts: (a) container budgets (draw calls, triangles, planet noise evaluations) as gating tests; (b) a manual measurement on the owner's current desktop, recorded in the README or a dated note with GPU, CPU, browser and version, at 1920×1080 at DPR 1. The owner will supply the machine specification later.
- **D-11:** The pass criterion is a frame-time distribution per scenario, not a mean alone (research D4).
- **D-12:** Planet shader budget stays at the current ceiling (`BUDGET_CEILING = 9` octaves). Do not change the octave budget.
- **D-13:** If the manual measurement misses 60 fps, the first step is to measure further and document the result. The look is NOT changed without a new owner decision. Cheap fixes (`antialias: false`, half-resolution rendering) and a shader rewrite are each a look change and require owner sign-off first. — **Reversibility:** costly — changes the approved palette and look.
- **D-14:** Texture compression (KTX2 / Meshopt) is deferred. Phase 7 measures first-load time on the reference desktop. Compression is done only if a stated load budget fails. — **Reversibility:** reversible.

### Context loss and tab throttling (QUAL-05)
- **D-15:** On WebGL context loss the session recreates render resources and stays paused. The player resumes with P or Escape. The simulation and save state are not touched during recovery.
- **D-16:** If the context is not restored within **10 seconds**, the failure surface is shown. The current terminal behaviour (`src/main.ts:353-361`) is replaced.

### Network guard (QUAL-08)
- **D-17:** The guard forbids any request to a **different origin** during the core loop. Same-origin static GETs (GLB models, textures, galaxy chunks) are allowed. This interpretation is recorded in `PROJECT.md` Key Decisions as part of Phase 7. — **Reversibility:** reversible.

### Test seams (Phase 6 WR-04)
- **D-18:** The failure injection for the destination-build negative control is a **constructor option consumed only by tests**. It is NOT reachable from a URL, so no user-facing URL can trigger a failure. Existing `?test=1` remains state-mutation only. — **Reversibility:** reversible.

### Claude's Discretion
The owner did not discuss these. Recommended values apply; the planner may refine them with evidence.
- **D-19 (QUAL-04, coverage):** Add `@vitest/coverage-v8`, but only after the owner human-checks the package (flagged as too new / SUS in research D12). Thresholds apply to `src/sim/**`, `src/persistence/**` and `src/content/**`, set from the first measured baseline and not invented.
- **D-20 (QUAL-04, IndexedDB):** `src/persistence/idb-store.ts` is covered in the browser e2e suite only. Do not add `fake-indexeddb` now (research D16).
- **D-21 (QUAL-03, journey fixture):** The new-game → launch → trade → hyperspace → dock → save/load journey may use an IndexedDB pose or save fixture for save-relevant steps. It must NOT use `?test=1` mutations at those steps, because they taint the save path (research D13, Critical Finding 6; PROJECT.md Key Decisions, Phase 6 autosave rows).
- **D-22 (QUAL-06, FIDELITY):** `FIDELITY.md` cites short quoted Oolite `.m` excerpts with line references, so citations are checkable in CI. Excerpts are recorded in `ASSETS.md` under GPL-2.0-or-later with the Oolite attribution (research D10).

### Deferred from Phase 6 (owner decision: defer everything)
- **D-23:** WR-05 (dead `onProfileChanged` wiring) — deferred. Not fixed in Phase 7.
- **D-24:** IN-06 (chart and Save/Load overlays not modal for focus or assistive technology) — deferred.
- **D-25:** Visual debt (chart footer, contrast, typography) — deferred. None of it is in Phase 7.

</decisions>

<open_items>
## Open Items for the Owner (not blocking planning)

- **Reference machine (D-10):** the owner will name the GPU, CPU, browser and version of the current desktop before the manual 60 fps run.
- **Public `.planning/` (D-02):** whether `.planning/` should be published in the public repo. Currently tracked and public on the remote.
- **Restore copy (D-16):** the wording of the failure message after the 10 s timeout is the owner's. Planner may draft a placeholder and flag it.
- **Hosting target (D-05):** not chosen yet.

</open_items>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §Phase 7 — goal and four success criteria
- `.planning/REQUIREMENTS.md` — QUAL-01 … QUAL-08 (lines ~93–100)
- `.planning/PROJECT.md` §Key Decisions — binding rows: "Accept the SwiftShader e2e cadence" (line ~89), "Oolite is the behavioural and data source of truth" (line ~112), Phase 6 save-v2, autosave and restore rows (lines ~123–128)
- `.planning/STATE.md` — current position: Phase 6 complete, Phase 7 next

### Research (binding inputs for planning)
- `.planning/phases/07-hardening-community-release/07-RESEARCH.md` — requirement status table, Critical Findings 1–6, Owner Decisions D1–D16 (each one is resolved, or given a recommended default, in the Decisions section above), Pitfalls 1–14, Validation Architecture

### Phase 6 carry-over
- `.planning/phases/06-hyperspace-navigation-persistence/06-GAP-CLOSURE.md` lines ~71–76 — deferral list
- `.planning/phases/06-hyperspace-navigation-persistence/06-VERIFICATION.md` lines ~19, ~27–28 — WR-04 deferred to Phase 7 test-seam work; human item 1 (SAVE-03 tolerance)
- `.planning/phases/06-hyperspace-navigation-persistence/06-REVIEW-DISPOSITION.md` — disposition of review findings
- Phase 3 deferrals: `.planning/phases/03-flight-in-the-lave-system/03-08-SUMMARY.md` line ~140 (context-loss recovery), `03-14-SUMMARY.md` lines ~333–334 (real-GPU QUAL-01 measurement)
- Phase 2 deferral: `.planning/phases/02-data-pipeline-content-compiler/02-07-SUMMARY.md` line ~258 (D-20, KTX2/Meshopt)

### Licensing and compliance
- `NOTICE` — section 4 source offer (lines ~67–72) that Phase 7 makes true
- `ASSETS.md` — asset provenance; must gain rows for `.agents/` skills, `skills-lock.json` and FIDELITY excerpts (research QUAL-07)
- `LICENSE` — GPL-2.0-or-later for project code

### Code touchpoints (verify before editing)
- `src/main.ts:257-261, 329-335, 353-361` — stopSession, visibility pause, terminal context-loss handler
- `src/sim/step.ts:11, 14` — `MAX_STEPS_PER_FRAME`, `MAX_FRAME_DELTA`
- `src/render/shaders/planet.glsl.ts:45-49` and `tests/render/planet-budget.test.ts` — octave budget gate
- `src/app/game-session.ts:1086-1088, 1118, 2083-2085, 2749-2753` — autosave taint, manual save, probes, `?test=1` seam
- `playwright.config.ts:19` — single Desktop Chrome project
- `Dockerfile:29` — Chromium-only install
- `index.html:843-848` — footer disclaimer

No external specs beyond the above. Oolite reference checkout: `/home/opencode/git/oolite` (read behaviour there; do not fetch over the network).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `compliance.test.ts` already pins the content of `NOTICE`, `LICENSE` and `ASSETS.md` — extend it rather than writing a new check.
- `DEFAULT_BINDINGS` (`src/input/actions.ts:147-158`) — source for README controls (research Pattern 9).
- `src/render/shaders/planet.glsl.ts` `BUDGET_CEILING = 9` and `tests/render/planet-budget.test.ts` — existing static budget gate to extend to draw-call and triangle budgets.
- Probe counters `calls` and `triangles` already published (`src/app/game-session.ts:2083-2085`).

### Established Patterns
- Sim core (`src/sim/`) is pure TypeScript with no Three.js or DOM; context-loss and throttling recovery must stay outside it (AGENTS.md conventions).
- Save writes are gated by a `testTainted` flag; any new QUAL-03 step must respect it (D-21).
- Playwright tests live in `tests/e2e`; new browser projects go through a separate Compose service (D-09).

### Integration Points
- Context-loss handler in `src/main.ts` (replace the terminal handler with restore state machine, D-15/D-16).
- Network guard: a Playwright request-listener plus a CSP meta tag in `index.html` (D-04, D-17).
- Build pipeline: licence documents must be copied into the built output by the build, not by `public/` (research Pattern 1).

</code_context>

<specifics>
## Specific Ideas

- Release title "Wegolite 0.1.0" everywhere the "foundation build" string appears today.
- Browser claim is "current stable Chrome and Firefox" only, stated in the README.
- Context-loss copy is the owner's: placeholder wording is acceptable until the owner supplies it.

No other specific references were given.

</specifics>

<deferred>
## Deferred Ideas

- **Safari support** — out of the claim for Phase 7. Adding it needs a real macOS smoke run; a future phase.
- **KTX2 / Meshopt texture compression** — deferred (D-14) unless the load budget fails.
- **Phase 6 debt WR-05, IN-06, visual debt** — deferred entirely (D-23 … D-25).
- **Hosting-level CSP header** — added when a host is chosen (D-05).
- **Changing the planet look or shader** — only with a new owner decision after the reference-machine measurement (D-13).

### Reviewed Todos (not folded)
None reviewed in this discussion.

</deferred>

---

*Phase: 07-hardening-community-release*
*Context gathered: 2026-11-07*
</content>
