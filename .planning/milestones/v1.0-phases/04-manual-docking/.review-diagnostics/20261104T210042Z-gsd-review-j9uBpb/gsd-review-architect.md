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
