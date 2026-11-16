# Phase 14 Spike (AI-11): the original shuttle AI in Node against a stub host

Plan 14-04. Status: **positive**. The original `oolite-priorityai.js` and
`oolite-shuttleAI.js` run unmodified in `node:vm`, construct a
`PriorityAIController` through `aiStarted`, and produce deterministic ordered
traces over three scripted fixtures. The differential harness is feasible as the
default oracle of the later priority-AI port (AI-07), with the risks listed
under Feasibility.

## Box and time used

- Box: one plan, at most one working session of executor time (ROADMAP Phase 14
  criterion 4; RESEARCH Open Question 4).
- Used: about 15 minutes of wall clock for all three tasks, 2026-11-15
  18:28Z to about 18:42Z. The box did not run out; nothing planned was left
  undone. The feasibility estimate for the rest is in the last section.

## Input and how it was mounted

- Pinned input: the local Oolite checkout at commit `7437f22`
  (`/home/opencode/git/oolite`), exported with `git archive`, never fetched and
  never copied into the repository:

  ```bash
  rm -rf /tmp/oolite-7437f22 && mkdir -p /tmp/oolite-7437f22
  git -C /home/opencode/git/oolite archive 7437f22 src Resources | tar -x -C /tmp/oolite-7437f22
  docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test \
    npx vitest run tools/ai-harness tests/guards/harness-isolation.test.ts
  ```

- The loader reads exactly two files below `OOLITE_SRC`, by fixed relative name:

  | File | Lines | SHA-256 |
  | ---- | ----- | ------- |
  | `Resources/Scripts/oolite-priorityai.js` | 6838 | `fc3fe2a7b30f2133a8e5cfd345b55f3ccb4587e3b7bc431ee7b081864a83dcfd` |
  | `Resources/AIs/oolite-shuttleAI.js` | 99 | `5879c17ef854e2ee0c68224c36b33a065461c04ae5f1da91ce656521bbb86000` |

- `Resources/Scripts/oolite-global-prefix.js` was **not needed**: the library
  and the shuttle AI load and run without it.
- Without `OOLITE_SRC` (the remote test machine and CI) the 8 cases that run
  Oolite JavaScript skip and the 3 host-only cases pass: `3 passed, 8 skipped`.
  With the tree mounted: `11 passed` (about 4.3 s, of which 4 s are the two
  deliberate timeout cases).

## How the harness is wired (what the later differential harness must repeat)

- One `vm` context per script (`createContext` plus `runInContext`):
  - the **library context** runs `oolite-priorityai.js`; its global (`this`,
    carrying `PriorityAIController` and `startUp`) is registered as
    `worldScripts["oolite-libPriorityAI"]` in the one shared `worldScripts`
    object;
  - the **role context** runs `oolite-shuttleAI.js` and is the ship script: the
    recording ship's `AIScript` is that context's global, and the context's
    global carries `ship` (as Oolite attaches an AI script to its ship). A role
    AI is not a world script.
  - A spike case asserts the two contexts and globals are distinct, that
    `worldScripts` holds only the library, that `ship.AIScript` is the role
    global, that neither script clobbers the other's `this.name`, and that
    `PriorityAIController` is not visible in the role context.
- `Math.random` is replaced in **each** context (a context has its own
  built-ins, so a sandbox property does not reach them) by one fixed one-line
  installer, `Math.random = __harnessDraw; delete globalThis.__harnessDraw;`,
  run with `runInContext`. Both contexts draw from the one scripted, counted
  sequence; a case asserts this.
- Library `startUp` (`oolite-priorityai.js:6675`) **ran**, as the engine runs it
  for a world script. It needed nothing from the host: it deletes itself and
  fills the communications table with plain literals. No descriptions or plist
  data were needed for the three fixtures.
- Startup order: load library, load role AI, `this.startUp()` in the library
  context, `this.aiStarted()` in the role context. `aiStarted` constructs the
  controller, which requires `ship.AIScript` to exist already (the constructor
  writes `this.ship.AIScript.oolite_intership` and `.oolite_priorityai`) and
  draws once from `Math.random` (`playerRoleAssessment`).
- **Wake mechanism.** The priority AI never reconsiders through `Timer`.
  `_resetReconsideration` writes `ship.AIScriptWakeTime`
  (`oolite-priorityai.js:230-239`; first delay `Math.random()` at :578), and
  `applyHandlers` installs `aiAwoken` (:259). The engine does the waking:
  `ShipEntity.update` does `if (aiScriptWakeTime > 0 && clockTimeAdjusted >
  aiScriptWakeTime) { aiScriptWakeTime = 0; doScriptEvent("aiAwoken"); }`
  (`ShipEntity.m:2480-2483`). `advanceClock` in `host.ts` does the same on a
  fixed 1/16 s frame (a power of two, so clock sums are exact), clearing the
  time first and then calling `this.aiAwoken()` in the role context through
  `callInContext`. Note the comparison is strict: a clock that lands exactly on
  the wake time does not wake until the next frame (the plan text said
  "reaches"; the engine says "is past", and the harness follows the engine).
  The recording `Timer` is never used for reconsideration: the reconsider
  fixture's trace holds no `timer` entry, asserted.
- **Timeout coverage.** Every entry into Oolite code runs through
  `runInContext` with `timeout: 2000`: both file loads, the Math.random
  installer, the global probe, `this.startUp()`, `this.aiStarted()`, every
  `this.aiAwoken()` wake, and the fixed `reconsiderIn(...)` probes. Each
  context records its entries (`AiContext.entries`) and a case asserts that the
  list holds only those shapes and that the wakes equal the `aiAwoken` entries.
  A case runs `for (;;) {}` in both contexts and gets the vm timeout error.
  **Uncovered gaps** (code the harness would run without `runInContext`): none
  today. Latent gap: a host-held callback, namely a `Timer` callback. The
  library creates a `Timer` at only two sites (`oolite-priorityai.js:425`, the
  ECM timer, and :5586, a self-destruct timer; neither is reached by the three
  fixtures). The stub records the schedule and never runs the callback; to run
  one a later harness must invoke it through a `runInContext` wrapper (pass the
  function in through a context global and evaluate a fixed `__call()`), not by
  calling it from the host.
- `vm` is not a security boundary. It is fed only the two pinned files and fixed
  expressions; the stub exposes no `require`, `process` or filesystem.

## Fixtures and transcript

Scripted `Math.random` sequence for every fixture:
`[0.25, 0.5, 0.75, 0.125, 0.875, 0.375, 0.625, 0.0625]` (a draw past the end
throws, so an unexpected draw is loud). World: shuttle at the origin, scanner
range 25600, `maxSpeed` 300; one planet (60000 m ahead, radius 6000), one main
Coriolis station at (15000, 0, 45000), `galcop`, friendly. Start clock 1000 s.
The trace is one JSON object per entry: `draw`, `set` (property write on the
ship), `call` (method call on the ship), `wake`, `timer`.

Each fixture was run twice with the same draws: identical traces, identical
wake times, identical draw counts, identical host inventories (asserted for all
three).

### Calm (no hostile, no selected station) - 9 entries, 3 draws

Script: `startUp`, `aiStarted`, advance the clock 1 s.

```
{"kind":"draw","index":0,"value":0.25}                      <- playerRoleAssessment (constructor)
{"kind":"draw","index":1,"value":0.5}                       <- setPriorities: first delay
{"kind":"set","target":"ship","member":"AIScriptWakeTime","value":1000.5}
{"kind":"wake","at":1000.5625,"wakeTime":1000.5}            <- first frame strictly past 1000.5
{"kind":"call","target":"ship","member":"findNearestStation","args":[]}
{"kind":"draw","index":2,"value":0.75}                      <- configurationSelectShuttleDestination picks the station
{"kind":"set","target":"ship","member":"AIScriptWakeTime","value":1001.5625}   <- reconsider: 1
{"kind":"call","target":"ship","member":"checkCourseToDestination","args":[]}
{"kind":"call","target":"ship","member":"performFlyToRangeFromDestination","args":[]}
```

The priority list falls through to the last entry
(`configurationSelectShuttleDestination`, `behaviourApproachDestination`,
`reconsider: 1`). The configuration stores `oolite_selectedStation` as a
controller parameter (read back in the test: the station), not as a ship write.
Fidelity fact for the port: that first `performFlyToRangeFromDestination` runs
with the ship's stale `destination` and `desiredRange`, because the
configuration only selects; the real destination is set at the next wake.

### Hostile (hostile ship in range, shuttle on red alert) - 7 entries, 2 draws

```
{"kind":"draw","index":0,"value":0.25}
{"kind":"draw","index":1,"value":0.5}
{"kind":"set","target":"ship","member":"AIScriptWakeTime","value":1000.5}
{"kind":"wake","at":1000.5625,"wakeTime":1000.5}
{"kind":"call","target":"ship","member":"findNearestStation","args":[]}
{"kind":"set","target":"ship","member":"desiredRange","value":25600}    <- scannerRange
{"kind":"call","target":"ship","member":"performFlee","args":[]}
```

`conditionInCombat` (`alertCondition == 3`) wins the first priority entry and
`behaviourFleeCombat` runs. No `reconsider` is attached to that entry, so no
further wake is written. On the first run the stub could not answer
`hostile.isWormhole` (the AI reads it on the target); it was added to the stub
and the inventory is now empty of missing members.

### Reconsider timing (calm world, clock advanced 70 s, station turns hostile, 40 s more, then two `reconsiderIn` probes, 2 s more) - 50 entries, 3 draws

```
draw 0 0.25 / draw 1 0.5 / set AIScriptWakeTime 1000.5
wake at 1000.5625 (wakeTime 1000.5)   findNearestStation, draw 2 0.75, set AIScriptWakeTime 1001.5625 (delay 1), checkCourseToDestination, performFlyToRangeFromDestination
wake at 1001.625  (wakeTime 1001.5625) set destination [15000,0,45000], desiredRange 15000, desiredSpeed 300, set AIScriptWakeTime 1031.625 (delay 30), checkCourseToDestination, performFlyToRangeFromDestination
wake at 1031.6875 (wakeTime 1031.625)  same writes, set AIScriptWakeTime 1061.6875 (delay 30), checkCourseToDestination, performFlyToRangeFromDestination
wake at 1061.75   (wakeTime 1061.6875) findNearestStation (60 s long-term cache expired), same writes, set AIScriptWakeTime 1091.75 (delay 30), ...
  -- station turns hostile (host.setStationHostile(true)) at clock 1070 --
wake at 1091.8125 (wakeTime 1091.75)   set destination, desiredRange 15000, desiredSpeed 300, set AIScriptWakeTime 1111.8125 (delay 20),
                                       set desiredRange 60000, desiredSpeed 300, checkCourseToDestination, performFlyToRangeFromDestination
  -- at clock 1110: reconsiderIn(500) writes nothing; reconsiderIn(0.5) writes AIScriptWakeTime 1110.5 --
wake at 1110.5625 (wakeTime 1110.5)    set destination, desiredRange 15000, desiredSpeed 300, set AIScriptWakeTime 1130.5625 (delay 20),
                                       set desiredRange 60000, desiredSpeed 300, checkCourseToDestination, performFlyToRangeFromDestination
```

(The full 50-entry trace is printed by
`docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite -e AI_HARNESS_TRANSCRIPT=1 test npx vitest run tools/ai-harness/spike.test.ts`.)

Asserted: six wakes, each on the first frame strictly past the time the AI wrote
(never earlier, never more than one frame late); every wake time was written by
the AI; each wake is one `this.aiAwoken()` entry; the AI writes the next wake
during the `aiAwoken` call; the delays seen are 1, 30 and 20 (the `reconsider:
1`, `30` and `20` entries of the shuttle list); no `Timer` schedule from the
priority AI; the never-later rule of `_resetReconsideration`: the request for a
wake 500 s out left the pending 1111.8125 untouched (no write), the request for
0.5 s out replaced it, and the AI woke at 1110.5 rather than 1111.8125.

## Host members touched

Union over the three fixtures (a member counts once; counts per fixture are in
the test's inventory data).

| Group | Members the library read (or the host answered) |
| ----- | ------------------------------------------------ |
| ship reads | `AIScript`, `AIScriptWakeTime`, `alertCondition`, `bounty`, `energy`, `escortGroup`, `group`, `hasHyperspaceMotor`, `isInSpace`, `isPirate`, `isValid`, `maxEnergy`, `maxSpeed`, `position`, `primaryRole`, `scanClass`, `scannerRange`, `target` (18) |
| ship calls | `findNearestStation`, `checkCourseToDestination`, `performFlyToRangeFromDestination`, `performFlee` (4) |
| ship writes | `AIScriptWakeTime`, `destination`, `desiredRange`, `desiredSpeed` (4) |
| station reads | `allegiance`, `collisionRadius`, `hasHostileTarget`, `isInSpace`, `isPlanet`, `isStation`, `isValid`, `maxSpeed`, `position`, `target` (10) |
| planet reads | `collisionRadius`, `isPlanet`, `position`, `radius` (4) |
| hostile ship reads | `isWormhole`, `position` (2) |
| system reads | `info`, `isInterstellarSpace`, `mainPlanet`, `planets`, `stations` (5) |
| player reads | `roleWeights` (1) |
| globals injected and read | `clock`, `player`, `system`, `worldScripts`, `ship` (role only), the Math.random draw (5) |

Stubbed but not reached by these fixtures: `Timer` (recording only), `Vector3D`
(a 6-method stand-in: `add`, `subtract`, `multiply`, `magnitude`, `direction`,
`distanceTo` accepting a vector or an entity), `oolite`, `log`.

**Missing members** (read, but the stub had no answer): none in the final
state. During the work one member was missing and added (`hostile.isWormhole`).

**Known absent, will be needed as fixtures grow** (found by reading the library,
not reached): `expandDescription` and `_getCommunication` (any `communicate`
call: comms need the description table), `System.infoForSystem`,
`system.info.systemsInRange` returns an empty list today, `system.wormholes`,
`Vector3D.random`/`cross`, `ship.getSafeCourseToDestination`, `ship.exitSystem`,
`ship.defenseTargets` beyond a one-element list, `ship.group` with members,
`worldScripts["oolite-contracts-helpers"]`, and the whole station-side API
(`dockingInstructions`-style calls) for the docking behaviours. The shuttle
list reaches the docking, planetary-landing and witchspace templates only when
the world has a nearby selected station or planet, no station, or interstellar
space; the three fixtures do not.

## Stub size

- `tools/ai-harness/host.ts`: 533 non-blank lines (576 lines with blanks) for
  the stub host, the world data, the recording ship, `advanceClock`, the trace
  and inventory. By line range (with blanks): the `Vector3D` stand-in is lines
  80-139, the tracking and `describe` helpers 172-287, the world data, ship,
  `Timer`, wake and clock all of `createStubHost` (lines 308-548), and the
  trace and inventory helpers the last 30 lines.
- `tools/ai-harness/load.ts`: 116 non-blank lines (130 with blanks).
- `tools/ai-harness/spike.test.ts`: 339 non-blank lines (360 with blanks), 11
  cases.
- Growth: 40 distinct read members, 4 calls, 4 writes were enough for three
  short fixtures over one 99-line role AI, and the first working run needed one
  addition. The library has 6838 lines and about 60 behaviours; each new role AI
  or behaviour pulls in more of the ship, station and system API. Expect
  roughly one stub member per new branch reached, not a one-off cost.

## Mapping of recorded `perform*` calls onto the native behaviours

The native behaviour ids are the `BEHAVIOUR_IDS` of `src/sim/world/ids.ts`.

| Recorded call | Native behaviour | Note |
| ------------- | ---------------- | ---- |
| `performFlyToRangeFromDestination` | `FLY_RANGE_FROM_DESTINATION` | seen in calm and reconsider |
| `performFlee` | `FLEE_TARGET` | seen in hostile |
| `performAttack` | `ATTACK_TARGET` | not reached (the shuttle never attacks) |
| `performIdle` | `IDLE` | not reached |
| `performLandOnPlanet` | `LAND_ON_PLANET` | reachable from `approachingPlanetSurface`, not reached |

Seen only because the harness records every `perform*` and method call by
prefix: nothing has to be listed in advance. Every perform call seen so far has
a native counterpart; the property writes (`destination`, `desiredRange`,
`desiredSpeed`, `AIScriptWakeTime`) map onto the steering record the phase adds.

## Feasibility of the differential harness as the default oracle (AI-07)

**Feasible.** Evidence: the original, unmodified library and a real role AI ran,
constructed their controller, selected behaviours, set parameters and woke on
the engine's own wake protocol, all deterministically, in one afternoon, with a
host stub of 40 read members.

Risks:

- **Stub growth.** The harness is only as faithful as its stub. The oracle is
  the library *plus* the stub; every behaviour a later fixture reaches needs
  engine members stubbed with the right answers, and a wrong stub answer looks
  like a port bug. Mitigation: the `missing` inventory makes an unanswered read
  loud per fixture; keep fixtures few and named.
- **Closure-held timers.** The library holds `Timer` callbacks in closures
  (ECM timer, self-destruct timer). They are recorded, not run. To compare
  behaviour that depends on them, the harness must run each callback through a
  `runInContext` wrapper at the right clock time, or the timeout guarantee is
  lost.
- **The clock.** The wake is strict `>` on a frame; the harness uses a fixed
  1/16 s frame. The real engine's frame is variable (about 1/60 s). A port that
  reconsiders on its fixed tick will see wake times quantised differently; the
  comparison must be on the written wake *time* and the decision at the wake,
  not on the frame the wake landed on.
- **Random draws.** Draw *order and count* matter as much as values (the
  constructor draws once before `setPriorities` draws). A port that draws in a
  different order will diverge from the same scripted sequence even if it is
  statistically equivalent; the trace records every draw index for this.
- **The AI sees live objects.** `this.ship.target`, `defenseTargets`,
  `AIScript.oolite_intership` are shared mutable objects; the stub's entities
  are proxies that record reads, and the library stores them in parameters. A
  stub change can change what the library caches.
- **Licence and input availability.** The harness reads GPL-2.0-or-later Oolite
  JavaScript from outside the repository. It is dev-only, isolated from `src/`,
  `public/` and every root Vite config by `tests/guards/harness-isolation.test.ts`
  (plan 14-07 adds the post-build `dist` check for the sentinel). It runs only on
  a machine with the checkout.

Estimate for the rest (what a full differential harness over the priority-AI
port would add beyond this spike): one stub-host session per role AI added
(trader, pirate, police, hunter) at roughly the size of this spike each, plus
one session for the Timer-callback path and one for a comparison driver that
maps the recorded trace onto the native behaviour calls. Confidence: low, since
only one role AI was reached.

## Input decision for the owner (settled at the Phase 14 gate, plan 14-19)

Keep the `OOLITE_SRC` mount, or vendor the scripts?

| Option | What it means |
| ------ | ------------- |
| Keep the mount | The harness runs only on the dev machine that has the Oolite checkout; its 8 Oolite-running cases skip on the remote test machine and in CI (shown above: `3 passed, 8 skipped`). The recorded transcript in this file is the evidence there. No licence or vendoring work. |
| Vendor the scripts | A human-run `scripts/vendor-oolite.sh` bump copies `Resources/Scripts/*.js` and `Resources/AIs/*.js` at a pinned commit into `third_party/oolite/` with `CHECKSUMS.sha256`, so CI can run the harness. Needs a licence entry in `NOTICE`/`ASSETS.md` (the scripts are GPL-2.0-or-later, the project's own licence) and an agent must not fetch them, so the bump is the owner's. The two files used here total 6937 lines; the whole directories are larger. |

Recommendation: keep the mount for now. The harness is a dev-time oracle; the
port's own tests (the committed oracle fixtures of plan 14-06) are what CI runs.
Vendor only if the owner wants the differential harness itself in CI.
