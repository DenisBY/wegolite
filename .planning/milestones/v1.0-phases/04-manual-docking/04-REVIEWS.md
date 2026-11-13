---
phase: 4
reviewers: [architect, adversarial, algorithm]
reviewed_at: 2026-11-04T21:00:37Z
plans_reviewed: [04-01-PLAN.md, 04-02-PLAN.md, 04-03-PLAN.md, 04-04-PLAN.md, 04-05-PLAN.md]
review_backends:
  architect: "subagent: reviewer-architect (GPT-6.1 Terra)"
  adversarial: "subagent: reviewer-adversarial (Grok 4.7)"
  algorithm: "subagent: reviewer-algorithm (Kimi K3.1 Pro)"
models:
  architect: "gpt-6.1-terra (reasoning=xhigh)"
  adversarial: "grok-4.7 (reasoning=xhigh)"
  algorithm: "kimi-k3.1-pro (reasoning=max)"
model_sources:
  architect: "agent-config"
  adversarial: "agent-config"
  algorithm: "agent-config"
---

# Cross-AI Plan Review — Phase 4

> Backend note: the only external CLI installed on this host is `opencode`, which is the runtime executing this review, so the workflow's self-CLI exclusion left zero external lanes. The review was run instead through three independent reviewer models available in-harness (GPT-6.1 Terra, Grok 4.7, Kimi K3.1 Pro). Each reviewer read the source-grounding prompt and verified claims against the repository. `reviewer-correctness` (Claude Sonnet 5.5) was skipped at the user's request.

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Consensus Summary

All three reviewers independently rated the phase **HIGH risk** before execution. The aperture/port-frame foundation and Oolite fidelity work drew consistently positive marks; the failures cluster in state transitions, safety invariants, purchase gating, and persistence.

### Agreed Strengths

- **Port-frame geometry is anchored to the real renderer.** `portFrame()` reuses `mul(stationBaseQuat, axisAngle(0,0,1,stationAngle))`, matching `src/render/bodies/station.ts:201-213`, and the outward axis agrees with `dockMouthPosition` (`src/sim/flight/state.ts:118-124`).
- **The measured quantity is Oolite's own.** Aperture comes from the dock mesh bbox extents, as in `DockEntity.m:1044-1045`, and the asymmetric port origin is preserved rather than centred.
- **Existing drift and layering controls are reused.** `assets:check` regenerates into a temp root and compares file sets/bytes/manifest hashes (`tools/oolite-ingest/cli.ts:8-16,214-227`), and `eslint.config.js:106` already blocks `src/sim` from importing generated content.
- **Deterministic, fixed-step design.** Integer decicredits, catalogue-driven pricing, `aegisStatus` squared-distance check, sim-clock message expiry, and no `Math.random` in the sim path.
- **Save shape avoids float-pose drift** by deriving the docked pose from layout (`src/sim/flight/state.ts:62-83,118-124`) and using strict, versioned JSON.

### Agreed Concerns

1. **HIGH — `dockArmed` can never become true after launch (04-02).** `beginLaunch` clears the flag, while `stepDocking` is specified to run only when armed and to arm itself on `min.z >= 0`. The launch test (`dockCount === 0`) passes for a permanently disarmed ship. Cited by all three reviewers.
2. **HIGH — The TL 9 gate is dropped, not enforced (04-04).** `canPurchase` checks ownership and credits only, so Lave (raw TL 4, `src/content/generated/systems/g0.json:1009`) can sell a TL 9 item. It contradicts D-10 and the roadmap success criterion; the deviation is documented in the plan but not accepted in the phase contract.
3. **HIGH — Future-save policy is self-contradictory and can destroy newer progress (04-05).** Prohibitions say never overwrite; Task 1 clears on New game; Task 2 overwrites on the next launch; the e2e only checks boot. `src/settings/store.ts:58-65` already shows the correct preserve-newer precedent.
4. **HIGH — IndexedDB writes are fire-and-forget with no transaction-durability or ordering contract (04-05).** Resolving on `onsuccess` is not commit, and New game's clear races the reload test. Reload can resurrect an old save or lose a new one.
5. **HIGH — The no-trap oracle does not test the invariant (04-03).** The property test asserts only mode and finite position; an embedded, endlessly bouncing ship still passes. Contact detection is corner-inside only, so edge/face intersections and tunnelling under the unrestricted `setSpeed` hook are missed. A straddle can also trigger both hull and straddle responses in one tick.
6. **HIGH — Wave 1 emits to the wrong root (04-01).** Returning `{path: "dock-port.json"}` places the file at the repo/temp root, not `src/content/generated/`, so `assets:check` and the typed loader fail. Existing emitters use full repo-relative paths (`tools/oolite-ingest/convert/equipment.ts:36-40`).
7. **HIGH — Computer docking advances the clock by `1200 + dt`, not exactly 1200 (04-04).** `stepFlight` gates time advancement on `modeAtStart`, which is still `inFlight` for a same-tick `Shift+C`.
8. **HIGH — The `?test` hook is a durable credit/equipment injection path.** `game-session.ts:705` enables it for any `?test` query; 04-04 adds `setCredits`/`grantEquipment`; 04-05 then autosaves the mutated profile on launch.
9. **MEDIUM — Mutating `installed` on drained commands can mutate shared `EDGE_COMMANDS` singletons** (`src/input/keyboard.ts:29-34,85-92`), leaking state for the page lifetime.

### Divergent Views

- **04-03 overall risk:** Adversarial rated it LOW-to-MEDIUM (normal approach cannot torus-tunnel; mass lock bounds speed), while Algorithm and Architect rated it HIGH over the collision/no-trap gap. The disagreement is about the threat model (normal play vs. the test hook), not the mechanism.
- **04-01 risk:** Adversarial rated it LOW (build-time data, guarded by schema and drift check); Architect and Algorithm rated it HIGH/MEDIUM because the output path is a guaranteed Wave 1 failure if followed literally.
- **The 35° roll fixture (Algorithm only):** with committed Cobra bounds the real limit is ~31.296°, so the mandated "35° stays in lane" test is numerically false. The other reviewers did not evaluate this fixture.

### Recommended disposition before execution

Fix the 04-01 output path, the `dockArmed` arming order, the TL decision (enforce or record explicit product acceptance), the single-response contact pipeline, the exact +1200 s clock guard, and one unambiguous future-save policy with transaction-committed, ordered writes. Then make an integrated launch → clearance → failed approach → retry → dock matrix and a committed-write reload test the phase gate.

## Architecture Review

**Overall verdict: HIGH risk — the plans contain a build blocker, docking failures, and a destructive save path.**

## 04-01

**Summary:** The specified emitter path does not match the generator's repository-relative output contract. Following the plan literally prevents the drift check from passing and leaves the runtime loader without its asset.

**Strengths:** —

**Concerns:**
- **HIGH:** The emitter returns `dock-port.json` (`.planning/phases/04-manual-docking/04-01-PLAN.md:85`), but the generator writes paths relative to the repository root (`tools/oolite-ingest/generate.ts:142`) and the drift check scans only its declared output roots (`tools/oolite-ingest/cli.ts:140`). The file lands at the root rather than `src/content/generated/`, and the check reports it missing.

**Suggestions:**
- Emit `src/content/generated/dock-port.json` and assert its path in both the generated tree and manifest.

**Risk: HIGH** — Wave 1 cannot satisfy its acceptance criteria as written.

## 04-02

**Summary:** The launch-suppression rule has a circular arming contract. It can leave manual docking disabled after every launch.

**Strengths:** —

**Concerns:**
- **HIGH:** `beginLaunch` sets `dockArmed` false, while `stepDocking` is specified both to run only when armed and to arm the flag itself (`.planning/phases/04-manual-docking/04-02-PLAN.md:86,97`). If implemented literally, the flag can never become true after launch, so a later aligned approach cannot dock. The existing skip path hands control to flight immediately (`src/sim/flight/step.ts:86`).

**Suggestions:**
- Evaluate the clearance and arming transition independently of the collision gate; test launch, clearance, and an actual return approach.

**Risk: HIGH** — The phase's primary manual-docking path depends on this state transition.

## 04-03

**Summary:** The proposed contact test does not detect every intersection between the ship and station boxes. Its no-trap property also does not establish geometric clearance.

**Strengths:** —

**Concerns:**
- **HIGH:** `hullContact` detects only ship corners inside the station box (`.planning/phases/04-manual-docking/04-03-PLAN.md:92`). A rotated Cobra can straddle a station edge with its centre and all eight corners outside while its body intersects the box; neither contact nor the centre-inside fallback fires. The proposed property checks mode and finite position, not overlap or ability to escape (`.planning/phases/04-manual-docking/04-03-PLAN.md:109`).

**Suggestions:**
- Use an OBB-versus-box intersection test with a separating axis or equivalent contact response; test edge intersections, clearance, and retry after collision.

**Risk: HIGH** — Off-axis approaches can pass through geometry without the required feedback or recovery.

## 04-04

**Summary:** The purchase rule contradicts the locked tech-level requirement. Existing rebinding settings can also make the new shortcut toggle pause instead of docking.

**Strengths:** —

**Concerns:**
- **HIGH:** The plan deliberately removes the TL check (`.planning/phases/04-manual-docking/04-04-PLAN.md:80`), although the phase decision requires it (`.planning/phases/04-manual-docking/04-CONTEXT.md:39`). With sufficient credits, Lave's TL 4 system can sell TL 9 equipment (`src/content/generated/systems/g0.json:1117`).
- **MEDIUM:** Adding `KeyC` as a default for an absent action can collide with an existing user rebind (`src/input/bindings.ts:50`). If that key is already bound to pause, Shift+C queues both actions (`src/input/keyboard.ts:80`); the frame processes pause first and discards commands while paused (`src/app/game-session.ts:542`).

**Suggestions:**
- Enforce the TL gate and test purchase in an eligible fixture, or obtain approval for the deviation.
- Reconcile migrated bindings against existing assignments or make conflict detection chord-aware.

**Risk: HIGH** — The planned purchase violates a phase decision, and some existing configurations cannot reliably invoke the shortcut.

## 04-05

**Summary:** The future-version save policy is internally contradictory. The adapter contract also acknowledges requests without requiring transaction commit.

**Strengths:** —

**Concerns:**
- **HIGH:** The plan prohibits overwriting future saves (`.planning/phases/04-manual-docking/04-05-PLAN.md:49`) but explicitly overwrites one on the next launch after hiding Continue (`.planning/phases/04-manual-docking/04-05-PLAN.md:109`). A player is not told that newer progress exists before it is destroyed.
- **HIGH:** Wrapping individual IndexedDB requests and firing the write without a transaction-completion contract (`.planning/phases/04-manual-docking/04-05-PLAN.md:92,109`) can report a write before commit; a later transaction abort or immediate reload can leave no resumable save.

**Suggestions:**
- Preserve future-version data in a separate slot or require informed confirmation before replacement.
- Resolve writes on transaction completion, handle aborts, and test reload and transaction-failure paths against real IndexedDB.

**Risk: HIGH** — The persistence design can silently lose either newer or newly launched progress.

## Cross-Plan

- The wave ordering makes the incorrect 04-01 output path a blocker for all downstream geometry work.
- The 04-02 arming gate and 04-03 contact algorithm must be tested together: a successful isolated capture test does not prove launch → clearance → failed approach → retry.
- The final integration gate should exercise existing rebinding settings and save replacement through the real browser paths, not only injected state.

## Risk Assessment

**HIGH.** Correct the artifact path, arming lifecycle, collision detection, TL decision, and save durability contract before execution.

---

## Adversarial Review

Overall verdict: HIGH risk. The plans are structurally sound, but they leave a durable credit injection path, a post-launch docking deadlock, and contradictory future-save rules.

## 04-01

Summary: Measuring the aperture from `oolite_coriolis_dock.dat` and keeping numbers out of `src/sim/` is the right trust boundary. Schema guards against a zero aperture are real, but they do not make every positive float safe, and the golden/emitter precision contract is loose.

Strengths:
- Matches Oolite's bbox extents (`DockEntity.m:1044-1045`) and refuses to centre on the asymmetric mesh (x ∈ [-53.4118, 50.0005]).
- `eslint.config.js:106` already denies `src/sim` imports of `content/generated`. Drift registration in `generate.ts:133-139` is the existing gate.
- Player mesh is `oolite_cobra3.dat` (`ships.json:15036`), so the emitted bbox is the ship the sim flies.

Concerns:
- MEDIUM: `width > 0` still allows subnormals. `apertureHalfExtents` can grow `ww` to `Infinity` and make every finite pose "in lane". The hang/DoS mitigation is only one layer up, not in the loop (`04-01` T-04-02).
- LOW: Golden "4 decimals" versus canonical emitter bytes can fail `assets:check` or silently round the contract the corridor tests assume.
- LOW: Ship `min < max` per axis is not required, only hull `zMin < zMax`.

Suggestions:
- Cap expansion iterations inside the emitter and the runtime helper. Reject non-positive and non-finite results after `×1.25`.
- Pin the golden to the emitter's canonical JSON, not a hand-rounded copy.

Risk: LOW. Bad geometry is build-time data, and the schema plus drift check are the right controls if the loop itself is bounded.

## 04-02

Summary: The port frame matches the renderer (`station.ts:209-212`, `layout.ts:179`) and `dockMouthPosition` (`state.ts:119-124`), so a correct `k = local -Z` lines up with the visible slot. The arming flag, as written, can make that corridor unreachable after the first launch.

Strengths:
- Strict Oolite inequalities, symmetric y-guard (deviation from `DockEntity.m:752`), and no `0.08` roll literal. Real rate is `layout.ts:181`.
- Origin-equals-mouth test at angle 0 catches a flipped dock axis.
- `stepFlight` already applies commands before motion (`step.ts:58-110`) and rolls the station after (`step.ts:115-117`).

Concerns:
- HIGH: `stepDocking` "runs only when `dockArmed`" while `beginLaunch` sets `dockArmed = false` and arming requires `min.z >= 0` inside `stepDocking`. A single early return never arms. The launch test only requires `dockCount === 0`, which a permanently disarmed ship also satisfies. `launch.ts:43-56` is the only exit from `docked`.
- MEDIUM: `skipLaunch` (`launch.ts:60-64`) leaves wings across the slot with the tail inside and collision suppressed while `!dockArmed`. A 180° turn in that window clips through the hull with push-out off.
- LOW: Unit and e2e poses both come from `placeShipInPortFrame`, so a helper bug is invisible. The mouth-equality test is the only independent check.

Suggestions:
- Arm in a prefix that runs while `!dockArmed`. Add a test: launch, skip, fly clear, roll 90°, re-enter, expect `docked`.
- Place one e2e ship along `stationToPlanet` from the probe station position, not only via the helper.

Risk: HIGH. Manual docking can ship green and still be unreachable after launch.

## 04-03

Summary: Bounce-without-damage and app-side feedback match the phase boundary. The no-trap claim does not cover the inputs that actually poison state, and the one-tick push-out is stronger than the algorithm.

Strengths:
- Normal approach cannot torus-tunnel the hull. Mass lock is 25 600 m (`torus.ts:102`). At the boundary the factor is clamped to 32 (`torus.ts:83-86`). The speed is about 11 200 u/s and the mass-lock decel distance is about 4 km, against about 25 km of clearance. The 350 u/s claim holds after that.
- Message cap is 4 (`messages.ts:32-54`). Throttling scrape copy is necessary.
- Fixed strings via `textContent` (`docked.ts:9-10`). No `Math.random` in the sim clock path.

Concerns:
- HIGH: `setSpeed` and `setPosition` write through (`probe.ts:161-166`). `speed.ts:65-67` only rejects non-finite speed, then integrates a huge finite speed (`speed.ts:69-70`) to `Infinity`. The plan's "outside, no mutation" guard does not repair an already-poisoned pose. The property test's 1 500 m box never generates this.
- MEDIUM: One-tick "all corners outside" is not implied by a single-face push. Passing that test invites a teleport, which D-07 forbids, and may drop an unrolled ship back into a straddle loop.
- MEDIUM: Lane/band suppress hull contact. That is correct for the tunnel, but combined with `!dockArmed` there is no unstick at all.
- LOW: Straddle copy teaches the 90° roll, but a face bounce does not. Centred unrolled flight does straddle (130 m wings versus 103 m slot), so this is a hint gap, not a hard trap.

Suggestions:
- At the start of `stepFlight`, replace non-finite position, orientation, speed, and impulse. Clamp the hook. Assert the next tick's centre is outside the hull and the normal points outward.
- Keep the property test, and add one seeded case at `1e308` speed and a `NaN` hook pose.

Risk: HIGH. DOCK-06 is false for the production `?test` hook the plans extend.

## 04-04

Summary: The aegis check should reuse `aegisStatus` (`aegis.ts:34-41`), which fails closed on `NaN`. The purchase rule and the command plumbing do not. TL 9 is cosmetic, and the same tick can dock and relaunch.

Strengths:
- Lave raw TL is 4 (`g0.json:1009`, `techLevelRaw` 4). `EQ_DOCK_COMP` is 15 000 decicredits, TL 9 (`equipment.json:58-62`). A faithful gate really does refuse at Lave.
- Keyboard fails closed if the session forgets to set `installed` (the input layer emits `false`). `Ctrl`/`Alt`/`Meta` never reach `keyDown` (`keyboard.ts:170-175`).
- New game at 1 000 decicredits cannot pay. Boundary tests for 14 999 and 15 000 are the right purchase tests.

Concerns:
- HIGH: `canPurchase` ignores TL. The real Oolite gate is `PlayerEntity.m:8226-8295` (raw TL, bargain only within +3). `oolite-conditions.js:70-90` is only the military-jammer TL 99 hack. The research citation is wrong. The conclusion "Lave cannot sell it" is right. Dropping the gate contradicts D-10. The displayed "(TL 9)" is a lie, and Phase 5 will likely keep this API.
- MEDIUM: `launch` is bound to `Digit1` and `F1` (`actions.ts:63`). All commands hit the first step (`game-loop.ts:45-48`). `beginLaunch` checks the current mode (`launch.ts:43`), not `modeAtStart`. `Shift+C` then `1` docks and immediately relaunches, adding 1 200 plus 600 seconds, and skips the panel.
- MEDIUM: `EquipmentSchema.price` is any int (`equipment.ts:25`). `purchase` is specified as "subtract the injected price" and "invalid input unchanged", but negative and zero prices are not defined as invalid. A negative price mints credits.
- MEDIUM: `EDGE_COMMANDS` pushes one shared object (`keyboard.ts:29-34`, `90-91`). Mutating `installed` on that object sticks for the page lifetime.
- LOW: Step 5 still adds `dt` when the tick started in flight (`step.ts:115-117`). The unit test wants exactly 1 200 seconds. The e2e allows one frame. They disagree.

Suggestions:
- Keep a real `techLevelRaw` argument. Refuse at Lave. Let e2e call `grantEquipment` for `Shift+C` only.
- Apply the dock command only if `modeAtStart === "inFlight"`, and launch only if `modeAtStart === "docked"`.
- Look up the price by key from the validated catalogue. Reject `price <= 0`. Push a fresh command object every keydown.

Risk: HIGH. This is the economy bypass the phase writes down as a feature.

## 04-05

Summary: Versioned strict JSON, no pose floats, and no new dependency are the right save shape. The boot wiring drops the allow-lists the threat model relies on, and the future-version rules contradict each other and the settings precedent.

Strengths:
- Settings already refuse to overwrite a newer blob on load (`store.ts:58-65`) and parse with an explicit key allow-list plus an own-key `__proto__` skip (`schema.ts:97-104`).
- Storing a JSON string, not a structured clone, plus `zod` strict, is the right pollution boundary.
- Launch-only autosave matches DOCK-07. `launch.spec.ts:96-102` can keep clicking `#title-start` if that button stays New game. Today the label is "Start" (`index.html:272`).

Concerns:
- HIGH: Task 1 clears a future save on New game. Task 2 leaves it until the next launch, which then overwrites it. T-04-26 says never write or clear it. `resetSettings` (`store.ts:99-101`) already deletes blindly. An older client can destroy a Phase 6 save.
- HIGH: `parseSave` allow-lists are "caller-supplied", but Task 2's `main.ts` path never passes them. `findShip` throws on an unknown key (`ships.ts:56-62`). An unchecked `station.key` can crash boot, which the plan says never happens. The allow-list also does not stop a forged `EQ_DOCK_COMP` or `credits` up to `MAX_SAFE_INTEGER`. T-04-24 overclaims.
- MEDIUM: Fire-and-forget `put` has no revision. A slow launch write can commit after New game `clear`, resurrecting the save. Two skip-launches can reorder.
- MEDIUM: `JSON.parse` runs before the 64-by-64 caps. T-04-27 does not stop a multi-megabyte blob from hanging boot.
- MEDIUM: The buy button mutates credits, but only launch persists them. Reload undoes the only purchase this phase has.
- LOW: `clockSeconds` is finite and `>= CLOCK_START` only. `1e308` is accepted. `version > 1` is checked after `JSON.parse`, so it does not bound size.
- LOW: On `VersionError`, an implementer "fixing" `open(v1)` with `deleteDatabase` wipes a newer DB. That is not prohibited.

Suggestions:
- One rule, matching `store.ts:58-65`: a future blob is never cleared and never replaced by this build. Test the byte identity after New game and after launch.
- Chain writes on a monotonic revision. Ignore stale completions.
- Pass equipment, system, and station allow-lists at the boot call site. Cap `raw.length` before `parse`. Integer-cap the clock.
- Autosave after a successful purchase, or state that the deduction is ephemeral until launch.

Risk: HIGH. Hostile and newer saves are not inert under the instructions as written.

## Cross-Plan

- HIGH: Credit injection becomes durable. `game-session.ts:705` enables the hook for any `?test` query, not only `?test=1`. `probe.ts:16-17` and `game-session.ts:703-704` promise live mutation and no save. 04-04 adds `setCredits` and `grantEquipment`. 04-05 writes that live profile on `launched`. Reload without the query and Continue keeps the cheat. Taint the profile and refuse to autosave it, or strip the hook from production bundles.
- HIGH: Non-finite and huge hook poses are a trap 04-03's invariant does not cover, and 04-02 and 04-04 add more unvalidated setters (`setOrientation`, `setStationAngle`).
- HIGH: The TL gate, the aegis flag, and the save allow-list are three different trust decisions. The sim trusts an `installed` boolean. The UI trusts credits only. The save trusts any known equipment key. A player can sidestep TL at Lave, sidestep payment via the hook plus autosave, and sidestep both via IndexedDB. Aegis itself is sound if `dockWithComputer` calls `aegisStatus` and ignores the command's own idea of range.
- MEDIUM: `dockArmed` off plus lane/band collision suppression is the trap window. 04-02 creates it. 04-03's push-out explicitly does not run there.
- MEDIUM: Purchase durability, future-save overwrite, and unordered IDB puts are one persistence bug seen three ways. Phase 6 will inherit the schema.
- Normal torus approach is not a docking DoS. Do not spend the fix budget there. Spend it on hook clamps and output finite-checks.

## Risk Assessment

Overall: HIGH. Corridor math and the content boundary are in good shape. The phase as specified can persist cheated credits, leave manual docking disarmed, and destroy a newer save, and its tests do not catch those three.

---

## Algorithms Review

# Phase 4 plan review — algorithms, numerics, determinism and performance

This review checks the plans against the current Wegolite source and the local Oolite checkout. I also evaluated the port-frame Cobra corners at the planned roll angles and checked the IEEE-754 progress condition of the proposed aperture-expansion loop. No implementation tests were run because the Phase 4 implementation does not yet exist.

## 04-01

### Summary

The build-time measurement approach is sound and matches Oolite: use the dock mesh's full vertex bounds, retain the port-origin asymmetry, convert ship/hull Z exactly once, and inject plain numbers into the sim. The existing generator already provides strong source and output drift checks. One concrete emitter-path error would nevertheless prevent the tracer from producing the promised file, and the geometry contract needs a little more shape validation before claiming invalid geometry is unrepresentable.

### Strengths

- **The measured quantity is the correct Oolite quantity.** Oolite assigns `port_dimensions` from `bb.max - bb.min`, not from the station hull or a hand-tuned trigger (`/home/opencode/git/oolite/src/Core/Entities/DockEntity.m:1044-1045`). The proposed emitter calls the existing all-vertex `boundingBox`, which really does scan every parsed vertex (`tools/oolite-ingest/convert/dat.ts:709-730`; `.planning/phases/04-manual-docking/04-01-PLAN.md:85`).
- **Source and generated-data drift protection already exists rather than being aspirational.** `readModels` applies `assertBounds` to each source mesh before conversion (`tools/oolite-ingest/generate.ts:166-186`), and `assets:check` regenerates into a temporary root and compares file sets, bytes and manifest hashes (`tools/oolite-ingest/cli.ts:8-16`, `tools/oolite-ingest/cli.ts:214-227`). Registering the new emitter in `emitted[]` is therefore the right integration (`tools/oolite-ingest/generate.ts:133-140`).
- **The proposed Z conversion agrees with both the GLB boundary and the committed geometry evidence.** The GLB conversion is explicitly `(x,y,-z)` (`tools/oolite-ingest/convert/glb.ts:17-25`), and the golden records Cobra source Z `[-37.9071,43.4655]` becoming `[-43.4655,37.9071]` (`tests/golden/content/ship-bounds.json:4-12`). The plan's negate-and-swap rule is consistent with those artifacts (`.planning/phases/04-manual-docking/04-01-PLAN.md:103`).

### Concerns

- **HIGH — The emitter's specified `path` writes to the wrong root, so the tracer cannot meet its loader/manifest contract as written.** Task 1 says to return `{path: "dock-port.json", bytes}` while also promising `src/content/generated/dock-port.json` (`.planning/phases/04-manual-docking/04-01-PLAN.md:82-96`). `generateContent` receives the repository/temp root and resolves each emitted path directly beneath that root (`tools/oolite-ingest/generate.ts:84-90`, `tools/oolite-ingest/generate.ts:142-145`; `tools/oolite-ingest/cli.ts:217-224`). The literal path therefore produces `<root>/dock-port.json`, not `<root>/src/content/generated/dock-port.json`. Existing emitters use the full repository-relative path, e.g. `EQUIPMENT_PATH = "src/content/generated/equipment.json"` (`tools/oolite-ingest/convert/equipment.ts:36-40`).
- **MEDIUM — “Invalid geometry is unrepresentable” is stronger than the stated schema.** The ship arrays are only required to be finite; there is no stated `min.x <= max.x`, `min.y <= max.y`, `min.z <= max.z`, nonzero-span, or finite-derived-extent check (`.planning/phases/04-manual-docking/04-01-PLAN.md:101-110`). A reversed or degenerate Cobra box would pass this schema and later produce meaningless rotation comparisons and port boxes. The existing `boundingBox` also maps an empty mesh to zero bounds (`tools/oolite-ingest/convert/dat.ts:724-730`), so explicit per-axis ship invariants are needed in addition to the zero-aperture test.
- **LOW — Parsing the model set twice would add avoidable build cost.** The current array already evaluates `readModels` for `emitModels` (`tools/oolite-ingest/generate.ts:133-140`), while the new emitter also needs those meshes (`.planning/phases/04-manual-docking/04-01-PLAN.md:85`). An implementation that adds a second `await readModels(inputRoot)` doubles DAT I/O, parsing and bounds checks; this is build-time rather than hot-path cost, but easy to avoid.

### Suggestions

- Define `DOCK_PORT_PATH = "src/content/generated/dock-port.json"` beside the emitter, exactly like `EQUIPMENT_PATH`, and assert that exact manifest row and output location in the tracer (`tools/oolite-ingest/convert/equipment.ts:36-40`; `tools/oolite-ingest/manifest.ts:24-25`).
- Validate `ship.min`/`ship.max` component ordering and positive X/Y/Z spans, plus `hull.zMin < hull.zMax` and finite derived extents. Test empty, reversed and degenerate boxes as well as zero aperture (`.planning/phases/04-manual-docking/04-01-PLAN.md:101-110`).
- Read the models once into a local `const models = await readModels(inputRoot)` and pass that same record to both emitters (`tools/oolite-ingest/generate.ts:133-140`).

### Risk Assessment

**MEDIUM.** The measurement and drift design is well grounded, but the output-path defect is a guaranteed Wave 1 integration failure if followed literally. It is localized and inexpensive to correct before execution.

## 04-02

### Summary

The port-frame construction and capture ordering are the strongest parts of the phase. They use the same station quaternion as the renderer, operate on relative coordinates, preserve Oolite's strict comparisons, and put capture after motion and station-roll advancement. The main numerical fixture is wrong, however: a 35° deviation from the matched roll does not fit the strict Cobra lane. The launch-arming gate also needs an unambiguous evaluation order, and the expansion-loop termination claim is not true for every schema-valid positive float.

### Strengths

- **The port frame matches the actual rendered station orientation.** The renderer uses `mul(stationBaseQuat, axisAngle(0,0,1,stationAngle))` (`src/render/bodies/station.ts:201-213`), exactly the quaternion proposed for the sim (`.planning/phases/04-manual-docking/04-02-PLAN.md:97`). Since local-Z roll leaves local `-Z` unchanged, the proposed outward `k` remains `stationToPlanet`; that agrees with the layout's base quaternion and `dockMouthPosition` (`src/sim/world/layout.ts:169-182`; `src/sim/flight/state.ts:118-124`).
- **Running docking after the existing motion/clock section avoids a one-tick visual/simulation frame lag.** `stepFlight` currently integrates flight first and advances `stationAngle` afterward (`src/sim/flight/step.ts:92-128`), while rendering reads that same angle (`src/app/game-session.ts:416-445`). The planned post-increment `stepDocking` call is therefore the correct seam (`.planning/phases/04-manual-docking/04-02-PLAN.md:44-45`, `.planning/phases/04-manual-docking/04-02-PLAN.md:97`).
- **The lane, band and capture rules track the actual upstream branches.** Oolite uses strict lane comparisons at lines 695 and strict weighted-plane capture at lines 711 and 766, with band correction driven by `-min.z/(max.z-min.z)` (`/home/opencode/git/oolite/src/Core/Entities/DockEntity.m:691-773`). The plan preserves those rules and explicitly handles zero denominators and non-finite boxes (`.planning/phases/04-manual-docking/04-02-PLAN.md:81-88`, `.planning/phases/04-manual-docking/04-02-PLAN.md:124-125`).
- **The proportional positional correction is contractive before capture in the ideal one-axis case.** For offset `e = (min+max)/2`, the planned update gives `e' = e(1-f)`. Along an inward approach before the 90% capture boundary, `0 <= f < 0.9`, so the correction itself does not overshoot or oscillate; the upstream formula and application are at `/home/opencode/git/oolite/src/Core/Entities/DockEntity.m:737-762`, and the fixed-tick port is at `.planning/phases/04-manual-docking/04-02-PLAN.md:117-125`. Keeping the fixed 1/120 s caller contract is important because the current public step accepts a caller-provided `dt` (`src/sim/flight/step.ts:37-49`).

### Concerns

- **MEDIUM — The required “35° fits” test is numerically false with the committed asymmetric Cobra bounds.** The plan mandates that a ship 35° from the matched roll remains in lane (`.planning/phases/04-manual-docking/04-02-PLAN.md:114-122`). Using the actual local corners `x = ±65`, `y ∈ [-13.9688,20.9961]` (`tests/golden/content/ship-bounds.json:4-12`) at 90°+35°, the port-frame X range is approximately `[-54.48147,48.72504]`. The strict half-aperture is only `103.4123/2 = 51.70615`, and the dock bounds confirm that width (`tests/golden/content/ship-bounds.json:71-80`). Thus `min.x > -ww` fails even though the total span alone is just under the aperture. For a centred ship, the positive roll-deviation limit is about **31.296°**, not 35°. This is exactly the sort of error the planned “computed exactly” test was intended to catch.
- **MEDIUM — `dockArmed` is specified as both a precondition for doing work and something that must be evaluated while false.** Task 1 says `stepDocking` runs only when `dockArmed`, but also says it arms when `box.min.z >= 0`; the assumptions say it does nothing while false (`.planning/phases/04-manual-docking/04-02-PLAN.md:85-87`, `.planning/phases/04-manual-docking/04-02-PLAN.md:97`). `beginLaunch` is supposed to clear the flag, so a literal early return would leave every launched ship disarmed forever and make the browser docking test impossible. The existing launch path always starts at the mouth and moves outward (`src/sim/flight/launch.ts:38-56`, `src/sim/flight/launch.ts:72-95`), so this gate is on the normal path, not merely a test edge case.
- **MEDIUM — Finite, positive geometry does not guarantee termination of the ×1.25 loops.** The plan relies on those checks to prove progress (`.planning/phases/04-manual-docking/04-02-PLAN.md:97`, `.planning/phases/04-manual-docking/04-02-PLAN.md:170`). With `port.width = Number.MIN_VALUE`, IEEE-754 rounding makes `port.width * 1.25 === port.width`; if ship width is 130, the loop condition remains true forever. Extreme finite min/max values can also overflow a derived span even though every input passed `Number.isFinite`. The current schema permits these values because it specifies only finite and `> 0` (`.planning/phases/04-manual-docking/04-01-PLAN.md:85`).
- **LOW — O(8) bounds the asymptotic work but does not substantiate the hot-path allocation claim.** The plan labels the per-tick resource risk mitigated because there are eight corners and no allocation loops (`.planning/phases/04-manual-docking/04-02-PLAN.md:175`). However, the proposed frame/box API creates several vectors/quaternions and outcome/event objects per tick, and every existing math helper returns a fresh object (`src/sim/math.ts:31-36`, `src/sim/math.ts:44-50`, `src/sim/math.ts:60-68`, `src/sim/math.ts:92-101`). This is still bounded and probably modest; the gap is the absence of reuse or measurement, not an established performance failure.
- **LOW — A cadence test can pass without exercising docking.** The existing replay helper calls `stepFlight` without any docking geometry and its scripted flight need not enter the band (`tests/sim/flight-cadence.test.ts:34-49`, `tests/sim/flight-cadence.test.ts:71-95`). Because the new geometry argument is optional, a close copy can accidentally remain a free-flight determinism test (`.planning/phases/04-manual-docking/04-02-PLAN.md:97`, `.planning/phases/04-manual-docking/04-02-PLAN.md:122-135`).

### Suggestions

- Replace the roll fixture with a clear passing/failing pair such as 30°/35°, or derive the exact boundary in the test from the emitted corners instead of hard-coding 31.296°. Assert all four strict port inequalities, not just span (`.planning/phases/04-manual-docking/04-02-PLAN.md:114-122`; `tests/golden/content/ship-bounds.json:4-12`).
- Specify the disarmed algorithm explicitly: for every `inFlight` tick compute the relative box; if disarmed and `min.z < 0`, return without classification/response; if `min.z >= 0`, set `dockArmed = true`; only then classify/capture. Add both natural-launch and skip-launch re-arm tests (`.planning/phases/04-manual-docking/04-02-PLAN.md:86-87`, `.planning/phases/04-manual-docking/04-02-PLAN.md:97`).
- Bound geometry to realistic ranges and make loop progress explicit (`next > current`), with a small iteration cap and a named geometry error. A closed-form required expansion count is another option, but a checked loop is simpler and safer here.
- In the cadence replay, assert `dockCount === 1` and a nonzero band/scrape count in addition to equal hashes so the test cannot be vacuous. Reuse one frame and one corner array per tick where practical, but profile before introducing a more complicated scratch-buffer API (`src/app/game-session.ts:555-577`).

### Risk Assessment

**MEDIUM.** The reference algorithm and timestep placement are correct, but the roll acceptance fixture is wrong and the arming/termination specifications need clarification before autonomous implementation. These are deterministic, unit-testable corrections rather than architectural rework.

## 04-03

### Summary

The constant-cost broad phase, explicit vector impulse, deterministic decay and sim-clock feedback are good choices for the existing scalar-speed flight model. The failure path is not yet safe enough to satisfy DOCK-06: straddles can receive two responses in one tick, the property test does not assert separation or recoverability, and the hull-only box does not represent all visible contact geometry. The plan needs contact prioritisation and a much stronger postcondition before its “no trap” claim is credible.

### Strengths

- **The impulse is the right data-structure addition for the current flight model.** `FlightState.speed` is scalar forward speed (`src/sim/flight/state.ts:39-43`) and `stepSpeed` integrates only `forward * speed` (`src/sim/flight/speed.ts:69-70`). Decomposing the reflected vector into a nonnegative scalar forward component plus a residual world impulse preserves that model without inventing a second orientation state (`.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`).
- **The proposed damping is stable and fixed-step friendly.** `1/(1+dt/0.6)` is positive and at most one for valid positive `dt`, so implicit-Euler impulse decay cannot amplify energy or oscillate due to a large explicit decay coefficient (`.planning/phases/04-manual-docking/04-03-PLAN.md:79-82`, `.planning/phases/04-manual-docking/04-03-PLAN.md:92`). The normal reflection is applied to the combined forward-plus-impulse velocity, which is the correct vector to reflect.
- **The collision broad phase has bounded time complexity.** Eight corners against six box faces is constant work, and the corridor already needs those corners (`.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`, `.planning/phases/04-manual-docking/04-02-PLAN.md:97`). Reusing them can keep this inexpensive without a mesh octree.
- **Feedback uses the correct clock and throttling boundary.** The existing message queue expires on simulation `flightTime`, not wall time (`src/render/hud/messages.ts:4-11`, `src/render/hud/messages.ts:36-60`), and its cap is four (`src/render/hud/messages.ts:32-34`, `src/render/hud/messages.ts:52-55`). Throttling scrape text while retaining per-tick sim events is therefore necessary and well placed app-side (`.planning/phases/04-manual-docking/04-03-PLAN.md:105-124`).

### Concerns

- **HIGH — A straddle can execute both hull and straddle bounces in the same tick.** The task first says to run `hullContact` for outcomes `outside` **or** `straddle`, apply the hull push/reflection and increment `bounceCount`; it then separately says that for `straddle` the code pushes along `k`, reflects again and emits `cause:"straddle"` (`.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`). A wing-across ship with its nose inside the mouth can satisfy both conditions, yielding two positional corrections, two velocity rewrites and two events/counts in one fixed step. That breaks the single-contact invariant and can make the resulting impulse depend on branch ordering.
- **HIGH — The property test's postcondition does not test the no-trap invariant.** It checks only that mode is `inFlight`/`docked` and position is finite (`.planning/phases/04-manual-docking/04-03-PLAN.md:108-120`). A ship that remains embedded in the hull, bounces every tick forever, or cannot translate/rotate under input still passes. The one explicit centre-inside case is useful but does not establish the fuzzed claim, and the current flight core has no limbo mode anyway (`src/sim/flight/state.ts:18-20`), so the mode assertion alone excludes little.
- **MEDIUM — The hull-only box is not a faithful visible-contact proxy.** The renderer's Coriolis includes four meshes, including the faceplate (`tools/oolite-ingest/convert/glb.ts:87-95`), but the emitted collision box uses only `oolite_coriolis.dat` (`.planning/phases/04-manual-docking/04-01-PLAN.md:101-103`). The committed bounds put the hull's converted minimum Z at `-495.918`, while visible faceplate geometry reaches `-534.298` (`tests/golden/content/ship-bounds.json:34-56`; actual vertices at `third_party/oolite/Models/oolite_coriolis_faceplate.dat:369-370`). A contact in that protruding region is outside `hullContact`'s box. Conversely, a bounding box contains substantial empty volume around the diamond-like hull, whose authored vertices include axis/edge extrema rather than cube corners (`third_party/oolite/Models/oolite_coriolis.dat:13-20`), so off-axis contacts can also fire before visible contact.
- **MEDIUM — Corner-inside testing is not complete OBB-versus-box contact detection.** The algorithm returns null unless a Cobra corner is strictly inside the box (`.planning/phases/04-manual-docking/04-03-PLAN.md:92`). Edge/face intersections with no contained Cobra corner are not detected, and a sufficiently large injected step can jump entirely across the box; the “cannot tunnel” argument covers the normal 350 u/s cap but not the unrestricted existing `setSpeed` hook (`.planning/phases/04-manual-docking/04-03-PLAN.md:79-82`; `src/app/probe.ts:156-166`). A separating-axis test on the 15 box/OBB axes remains constant-cost and handles the degenerate crossings without moving to a full mesh.
- **LOW — `scrapeTicks` is added to hashed state and exposed as `scrapeCount`, but no task says where it increments.** Task 1 introduces the field and probe count, while Task 2 specifies scrape events and message throttling only (`.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`, `.planning/phases/04-manual-docking/04-03-PLAN.md:108-124`). Plan 04-02 creates the events but does not own this field (`.planning/phases/04-manual-docking/04-02-PLAN.md:124-125`). As written, the counter can remain zero despite active scraping.
- **LOW — Face-selection tie order needs to be explicit for deterministic replay.** Deep-centre and symmetric face contacts routinely produce equal least penetrations; the plan says to choose the “deepest” corner/face and then the centre's least-penetration face without naming a tie-break (`.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`, `.planning/phases/04-manual-docking/04-03-PLAN.md:115-116`). Fixed iteration order can provide determinism, but it must be part of the contract and tested at exact symmetry.

### Suggestions

- Make response selection mutually exclusive: handle `straddle` first with the port-normal response, otherwise run hull contact for `outside`; emit at most one bounce per contact entry. Add a test where both predicates are true and assert one event, one count and one velocity rewrite (`.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`).
- Strengthen the property to assert finite pose **and** post-resolution nonpenetration outside the corridor, no persistent repeated-contact state, decreasing/separating normal motion, and a subsequent control input changing pose. Keep a deterministic regression seed for adjacent-face, deep-centre, zero-speed and straddle-plus-hull cases (`.planning/phases/04-manual-docking/04-03-PLAN.md:108-120`).
- Either include a faceplate-aware proxy or explicitly construct a simple docking-region collision mesh from the visible hull/faceplate. Keep the box as a broad phase if useful, but do not present its bounds as the entire visible collision surface (`tests/golden/content/ship-bounds.json:34-56`).
- Use SAT for box/OBB overlap and choose the minimum translation vector with a documented axis order. Reuse the corridor's eight world corners and station quaternion rather than recomputing them in `hullContact` (`.planning/phases/04-manual-docking/04-02-PLAN.md:97`; `.planning/phases/04-manual-docking/04-03-PLAN.md:92`).
- Increment `scrapeTicks` exactly once per emitted scrape event and add a cadence/hash assertion covering it. Publish feedback envelope strength, rather than a sinusoidal offset that can be zero at the trigger instant, for reliable probes (`.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`, `.planning/phases/04-manual-docking/04-03-PLAN.md:130-137`).

### Risk Assessment

**HIGH.** This plan owns the phase's central safety invariant, but its specified branch logic can double-resolve a contact and its fuzz oracle cannot detect a trap. The collision proxy also needs a conscious visible-geometry decision before tuning restitution or feedback.

## 04-04

### Summary

Integer decicredits, catalogue-driven pricing and the existing squared-distance aegis check are appropriate and deterministic. The instant-dock command is placed at the right broad stage—before motion—but the current `modeAtStart` clock gate means the implementation as described adds one simulation tick in addition to the required 1200 seconds. The new mutable `installed` command payload also introduces a shared-singleton hazard in the existing keyboard command table.

### Strengths

- **Money remains exact integer arithmetic.** The equipment schema explicitly carries integer decicredits and a `priceUnit` guard (`src/content/schemas/equipment.ts:12-26`), and the plan's exact 14,999/15,000/already-owned boundaries avoid floating-point currency errors (`.planning/phases/04-manual-docking/04-04-PLAN.md:106-118`).
- **The aegis calculation reuses the correct deterministic predicate.** `aegisStatus` checks station range first using squared distance and inclusive `<=`, avoiding an unnecessary square root (`src/sim/world/aegis.ts:28-52`). The planned boundary tests match that implementation (`.planning/phases/04-manual-docking/04-04-PLAN.md:79-83`, `.planning/phases/04-manual-docking/04-04-PLAN.md:93`).
- **Keyboard edge commands are already non-repeat and consumed only on the first fixed step of a frame.** The input state ignores repeat keydowns (`src/input/keyboard.ts:80-93`), and the accumulator drains pending commands only once (`src/app/game-loop.ts:39-50`). This is a solid basis for an exactly-once instant dock (`.planning/phases/04-manual-docking/04-04-PLAN.md:89-103`).

### Concerns

- **HIGH — Same-tick computer docking advances the clock by `1200 + dt`, not exactly 1200, unless step 5 is explicitly skipped.** `stepFlight` captures `modeAtStart` before draining commands and advances `stationAngle`, `flightTime` and `clockSeconds` whenever that original mode was not docked (`src/sim/flight/step.ts:51-58`, `src/sim/flight/step.ts:112-128`). The plan changes `state.mode` to docked in the command switch and merely says motion is skipped (`.planning/phases/04-manual-docking/04-04-PLAN.md:89-97`). For an `inFlight` command, `modeAtStart` remains `inFlight`, so the existing block still adds `DT` after `dockWithComputer` adds 1200. This directly contradicts the plan's exact-clock test and DOCK-05.
- **MEDIUM — Mutating `installed` on drained commands can mutate the shared `EDGE_COMMANDS` object.** Existing edge commands are singleton objects in a module-level table (`src/input/keyboard.ts:29-34`) and `keyDown` pushes those object references directly into `pending` (`src/input/keyboard.ts:85-92`). The plan proposes a `{kind:"dockingComputer", installed:false}` table entry followed by the session “overwriting” `installed` (`.planning/phases/04-manual-docking/04-04-PLAN.md:91-93`). If that means mutation, one activation changes every future command from that input state and leaks state across consumers/tests. A shallow `Readonly` record does not make the nested command object immutable.
- **MEDIUM — The plan explicitly displays but does not enforce TL 9, which is a requirement deviation rather than an algorithmic purchase rule.** The original phase requirement calls for a TL 9 docking computer, while `canPurchase` is specified to check only ownership and credits (`.planning/phases/04-manual-docking/04-04-PLAN.md:79-83`, `.planning/phases/04-manual-docking/04-04-PLAN.md:109-118`). The deviation is at least documented, but a disabled/enabled button labelled “TL 9” at Lave cannot be interpreted as TL enforcement. This needs explicit product acceptance, not merely a unit-test adjustment.
- **LOW — The proposed paused-session browser clock assertion conflicts with pause input handling.** While paused, the session drains and discards commands instead of stepping (`src/app/game-session.ts:578-584`). Thus Shift+C cannot be executed “on a paused session” as the e2e action suggests (`.planning/phases/04-manual-docking/04-04-PLAN.md:130-138`). The unit test should own the exact +1200 assertion; browser reads need either a test-only synchronous command seam or a bounded tick allowance.
- **LOW — Instant docking leaves torus state untouched.** The computer path clears speed, rates and impulse but not `torus.engaged`, `factor`, `massLocked` or `lastFactor` (`.planning/phases/04-manual-docking/04-04-PLAN.md:91-93`). Shift+C is allowed throughout the 51,200 m aegis, whereas station mass lock begins at 25,600 m (`src/sim/world/aegis.ts:34-41`; `src/sim/flight/torus.ts:98-104`), so a torus-engaged ship can enter docked mode with a transient flight drive still marked active. Existing torus handling will eventually disengage it in flight (`src/sim/flight/torus.ts:226-231`), but the docked-state invariant is untidy.

### Suggestions

- After a successful computer dock, skip the entire remaining tick, including station/time advancement, or replace the `modeAtStart` gate with an explicit `clockAdvancedByCommand`/terminal-transition guard. Assert `after.clockSeconds - before.clockSeconds === 1200` and define whether `tick` increments (`src/sim/flight/step.ts:112-130`; `.planning/phases/04-manual-docking/04-04-PLAN.md:93`).
- Map commands to fresh objects in the session, e.g. `{...command, installed: hasEquipment}`, or remove `installed` from `Command` and inject a profile view into `stepFlight`. Never mutate `EDGE_COMMANDS` entries (`src/input/keyboard.ts:29-34`, `src/input/keyboard.ts:85-92`).
- Reset torus/transient drive state on both manual and computer docking, and test the 25,600–51,200 m torus-active case (`src/sim/flight/torus.ts:98-104`; `.planning/phases/04-manual-docking/04-04-PLAN.md:93`).
- Either obtain explicit acceptance of the TL deviation in the phase contract or retain the TL check and use a synthetic TL≥9 system/test seam for purchase coverage; do not silently treat the label as enforcement (`.planning/phases/04-manual-docking/04-04-PLAN.md:79-80`).

### Risk Assessment

**HIGH.** The exact +20-minute success criterion fails under the current step ordering unless an additional guard is planned. The command mutation and torus cleanup are smaller but share the same mode-transition boundary and should be fixed in the same tests.

## 04-05

### Summary

The schema direction is good: bounded equipment data, no float pose, derived docked layout, strict validation and real-browser IndexedDB coverage. The asynchronous storage design is not yet sufficient to support its own claims. Fire-and-forget operations lack ordering and durable-completion semantics, New Game has a clear/reload race, and future-version preservation is specified inconsistently. Numeric and input-size bounds also need tightening before the “hostile saves are inert” conclusion.

### Strengths

- **Deriving the restore pose avoids persistence precision drift.** `initFlightState` already constructs a canonical docked state (`src/sim/flight/state.ts:62-83`) and `dockMouthPosition` derives position from the layout (`src/sim/flight/state.ts:118-124`). Restoring only clock/profile/system fields is therefore simpler and more stable than serialising world-space float poses (`.planning/phases/04-manual-docking/04-05-PLAN.md:88-102`).
- **Launch's post-+600 snapshot has a real deterministic seam.** `beginLaunch` applies exactly 600 seconds (`src/sim/flight/launch.ts:43-55`), and the launch-start tick does not add normal elapsed time because `modeAtStart` is docked (`src/sim/flight/step.ts:112-128`). Handling the resulting `launched` event therefore captures the intended post-launch clock (`.planning/phases/04-manual-docking/04-05-PLAN.md:105-109`).
- **Keeping IndexedDB work off the fixed-step callback is correct.** Events are handled synchronously immediately after `stepFlight` in the accumulator callback (`src/app/game-session.ts:555-577`), so awaiting storage there would stall simulation/rendering. A caught asynchronous adapter with real Playwright reload coverage is the right high-level split (`.planning/phases/04-manual-docking/04-05-PLAN.md:105-136`).
- **The existing settings code supplies a sound future-version preservation precedent.** It explicitly leaves newer blobs untouched rather than downgrading them (`src/settings/store.ts:58-65`), and the save plan correctly identifies strict parsing and allow-lists as necessary additions for equipment/system data (`.planning/phases/04-manual-docking/04-05-PLAN.md:88-100`).

### Concerns

- **HIGH — “Last write wins” is asserted without an ordering mechanism, and request success is not transaction durability.** The plan assumes two rapid launches resolve newest-last but makes each write fire-and-forget through a lazily opened adapter (`.planning/phases/04-manual-docking/04-05-PLAN.md:79-83`, `.planning/phases/04-manual-docking/04-05-PLAN.md:91-92`, `.planning/phases/04-manual-docking/04-05-PLAN.md:108-109`). Concurrent calls can share/race the open and issue transactions whose completion order is not sequenced by application state. Moreover, wrapping an `IDBRequest` and resolving on its `onsuccess` does not wait for the enclosing transaction's `oncomplete`; a later abort can still mean no durable save. The probe/e2e must not count invocation as a committed write.
- **HIGH — Future-version behavior is internally contradictory and can destroy a newer save.** The must-haves/prohibitions say future saves are never overwritten (`.planning/phases/04-manual-docking/04-05-PLAN.md:29-50`). Task 1 mixes never-replace with New Game clearing (`.planning/phases/04-manual-docking/04-05-PLAN.md:91-92`), while Task 2 says New Game leaves the blob until the next successful launch autosave overwrites it (`.planning/phases/04-manual-docking/04-05-PLAN.md:108-109`). The e2e checks only that boot leaves version 2 unchanged, not New Game plus launch (`.planning/phases/04-manual-docking/04-05-PLAN.md:122-130`). These policies cannot all be implemented and tested as stated.
- **HIGH — New Game's best-effort clear races the specified immediate reload scenario.** Task 2 starts the session without awaiting `clear`, while Task 3 clicks New Game and reloads before any launch, expecting no Continue (`.planning/phases/04-manual-docking/04-05-PLAN.md:108-109`, `.planning/phases/04-manual-docking/04-05-PLAN.md:126`). The current start callback is already fire-and-forget (`src/main.ts:195-197`), and the title handler does not expose completion (`src/ui/title.ts:12-16`, `src/ui/title.ts:38-45`). Reload can therefore occur before deletion/transaction completion and resurrect the old save on the next boot.
- **MEDIUM — The clock validator accepts values at which time no longer advances.** `clockSeconds` has only finite and `>= CLOCK_START` constraints (`.planning/phases/04-manual-docking/04-05-PLAN.md:91-92`). A forged `1e308` passes, but adding 600 or `DT` has no representable effect at that magnitude. The actual clock starts at 180,057,945,600 (`src/sim/flight/state.ts:59-67`), far below `Number.MAX_SAFE_INTEGER`, so an upper safe-range check is practical and does not require integer-only clock values.
- **MEDIUM — Schema field limits do not bound the expensive `JSON.parse` input.** Arrays and strings are capped only after parsing, and `read(): Promise<string|null>` supplies an unbounded string (`.planning/phases/04-manual-docking/04-05-PLAN.md:91-92`). A very large same-origin IndexedDB value is parsed and allocated before zod can reject it, contradicting the oversized-save DoS mitigation claimed at `.planning/phases/04-manual-docking/04-05-PLAN.md:153-157`. Check raw byte/character length before `JSON.parse` and reject/copy it without parsing.
- **MEDIUM — “Every failure path” and resource cleanup are underspecified for a lazily opened database.** The adapter has only `read/write/clear`, with no shared-open/close/abort lifecycle (`.planning/phases/04-manual-docking/04-05-PLAN.md:91-92`, `.planning/phases/04-manual-docking/04-05-PLAN.md:105-119`). A blocked open can remain pending unless `blocked` actively settles the operation, and a late `onsuccess` after that settlement needs to close the connection to avoid a leak. Since boot reads before showing Continue, an unsettled read also prevents the title flow the plan promises (`src/main.ts:191-197`; `.planning/phases/04-manual-docking/04-05-PLAN.md:108-109`).
- **LOW — The promised corrupt backup has no clear adapter operation.** The assumptions/threat model promise `autosave.corrupt`, but the exposed store only writes the fixed autosave JSON and Task 2 does not wire backup-on-parse-failure (`.planning/phases/04-manual-docking/04-05-PLAN.md:79-84`, `.planning/phases/04-manual-docking/04-05-PLAN.md:91-92`, `.planning/phases/04-manual-docking/04-05-PLAN.md:108-109`, `.planning/phases/04-manual-docking/04-05-PLAN.md:156`). Either add an explicit backup operation or remove the unverified claim.

### Suggestions

- Give the adapter one shared open promise and a serialized operation queue. Resolve writes only from transaction `oncomplete`, reject/settle from `onabort`/`onerror`, and expose committed completion to the probe. A monotonically increasing launch revision can reject stale completions even if transactions are later parallelised.
- Choose one future-save policy: either preserve until an explicit destructive confirmation, or define New Game as that confirmation and test the exact New Game → launch → reload sequence. Remove the absolute “never overwrite” wording if the latter is intended, and make Task 1, Task 2 and the e2e agree (`.planning/phases/04-manual-docking/04-05-PLAN.md:29-50`, `.planning/phases/04-manual-docking/04-05-PLAN.md:108-130`).
- Sequence New Game's clear before reporting fresh-start readiness; have the e2e wait for that committed clear before reloading. Likewise, wait for `save.lastClock` to be updated by a committed transaction before testing restore, rather than accepting `writes >= 1` as proof (`.planning/phases/04-manual-docking/04-05-PLAN.md:126`).
- Reject raw saves above a small explicit size before parsing; bound `clockSeconds` above by a safe domain value; require known station identity and unique equipment keys as part of semantic validation. Add `Number.MAX_VALUE`, oversized-raw and duplicate-equipment cases to the table.
- Define adapter cancellation/cleanup: shared open, handling for late success after `blocked`, connection close on app lifecycle teardown, and deterministic behaviour for operations queued after disposal. Keep failure nonfatal, but do not confuse nonfatal with unordered or durable (`.planning/phases/04-manual-docking/04-05-PLAN.md:105-119`).

### Risk Assessment

**HIGH.** The pure schema is straightforward, but asynchronous write ordering, clear/reload behaviour and future-version policy currently risk stale restores or loss of a newer save. The real IndexedDB tests need to observe transaction completion and operation ordering, not just UI visibility.

## Cross-plan review

### Severity-ordered findings

1. **HIGH — The phase needs an integrated terminal-transition contract, not separate local edits to `stepFlight`.** Manual docking is called after time advancement in 04-02, while computer docking occurs in the command phase in 04-04 (`.planning/phases/04-manual-docking/04-02-PLAN.md:97`; `.planning/phases/04-manual-docking/04-04-PLAN.md:93`). Existing time advancement is based on `modeAtStart` (`src/sim/flight/step.ts:51-52`, `src/sim/flight/step.ts:112-128`). Add one shared test matrix for launch, manual dock, computer dock and denied dock covering mode, tick, flightTime, stationAngle and clock deltas.
2. **HIGH — DOCK-06 needs a physics postcondition shared by corridor and hull code.** Plan 04-02 deliberately leaves straddle without response and 04-03 later adds two possible responses (`.planning/phases/04-manual-docking/04-02-PLAN.md:117-125`; `.planning/phases/04-manual-docking/04-03-PLAN.md:91-92`). Define a single per-tick outcome pipeline (`disarmed → capture → straddle → band/lane → hull/outside`) and assert at most one terminal/contact response and a finite, nonpenetrating result.
3. **MEDIUM — Geometry ownership must include the visible collision surfaces, not stop at aperture measurement.** 04-01 emits only the main hull box, whereas the rendered station includes faceplate/tris/dock (`tools/oolite-ingest/convert/glb.ts:87-95`; `.planning/phases/04-manual-docking/04-01-PLAN.md:101-103`). Resolve the 04-03 collision-proxy issue in 04-01's generated contract now; changing the generated schema later would otherwise repeat Wave 1 and golden work.
4. **MEDIUM — Reuse one station frame and one corner set across corridor and hull classification.** The two plans independently describe port-frame projection and station-local corner transformation (`.planning/phases/04-manual-docking/04-02-PLAN.md:97`; `.planning/phases/04-manual-docking/04-03-PLAN.md:92`). Existing vector/quaternion helpers allocate on every operation (`src/sim/math.ts:44-68`, `src/sim/math.ts:151-158`). Sharing these values reduces duplicate arithmetic, avoids subtle frame disagreement, and provides a clean place for scalar/preallocated computation if profiling shows GC pressure. The work is O(1), so avoid a complex optimisation without a benchmark.
5. **MEDIUM — Browser proofs need deterministic completion signals.** Dock clock tests cannot rely on paused keyboard input, and save tests cannot rely on fire-and-forget invocation (`src/app/game-session.ts:578-584`; `.planning/phases/04-manual-docking/04-04-PLAN.md:134`; `.planning/phases/04-manual-docking/04-05-PLAN.md:126`). Keep exact numerical assertions in Vitest and expose committed/event-completion probe values for Playwright.
6. **LOW — Append-only flight hashing is useful only if every new authoritative field is included and exercised.** Position, orientation, speed and station angle are currently canonicalised (`src/sim/flight/state.ts:95-115`); the plans correctly append `dockArmed`, counters and impulse, but omit any specified `scrapeTicks` update and leave profile outside the hash (`.planning/phases/04-manual-docking/04-02-PLAN.md:97`; `.planning/phases/04-manual-docking/04-03-PLAN.md:92`; `.planning/phases/04-manual-docking/04-04-PLAN.md:47-51`). Assert nonzero docking activity in replay tests and document that `hashFlight` is not a whole-game/profile hash.

### Overall assessment

**Overall risk: HIGH.** The aperture/port-frame foundation is strong, and none of the main problems requires abandoning the architecture. However, the current plan set has one guaranteed generator-path failure, a false roll fixture, ambiguous launch arming, a possible double-bounce path, an inadequate no-trap oracle, an exact-clock regression for computer docking, and unresolved IndexedDB ordering/preservation races. Correct these contracts before autonomous execution, then make the integrated transition/contact/save tests the phase gate rather than relying on isolated per-wave successes.
