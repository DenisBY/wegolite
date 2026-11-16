# Phase 8 Cross-Plan Consistency Triage (Round 5)

Reviewer: reviewer-triage-haiku (fast cross-plan consistency lens)
Commit reviewed: afc4fe0
Scope: 08-01 .. 08-16 plans, cross-checked against 08-REVIEWS.md Consensus Summary (Round 4, items 1-14), ROADMAP.md Phase 8, REQUIREMENTS.md FOUND-10..14, 08-CONTEXT.md D-01..D-14, and source at HEAD.

Method and limits: I read the frontmatter of all 16 plans, the Round 4 consensus, and the ROADMAP and REQUIREMENTS entries. I then grepped every named contract (constants, factory signatures, ShipControl and WorldView members, event kinds, Key Decisions row letters, requirement ids, file ownership, wave and depends_on edges, and file:line anchors) across all 16 plans. I verified anchors and identifiers against src/ and eslint.config.js at HEAD. I did not read every plan line end to end (the plans total roughly 800 KB), so an absence of a finding is not proof of absence. Items I could not fully trace are marked as open questions.

Tests and builds: none were run. This is a text-consistency review, and no Docker gate applies to it.

---

## Round 4 consensus status (items 1-14)

| # | Item | Status | Evidence (current plan text and source) |
|---|------|--------|------------------------------------------|
| 1 | NaN in ai.params cannot be rejected after JSON | Resolved | 08-13-PLAN.md:151 (snapshotWorld throws SnapshotError "non-finite" before output), 08-13-PLAN.md:155 (converse limited to decidable slots), 08-05-PLAN.md:148 (ParamValue doc: null and boolean scalars legal), 08-13-PLAN.md:290 (R4-01 row: generator to cover null/boolean params). |
| 2 | `rg "world/store\|\.store\b" src/app` gate can never pass | Resolved | 08-16-PLAN.md:146 narrows the gate to `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. Checked: src/app/game-session.ts:1341, :1490, :3345 use only `saveBoot.store.read/clear/dispose`, which the narrowed pattern does not match. |
| 3 | `test.advanceTicks` undefined outside manual clock | Resolved | 08-01-PLAN.md:27 keeps the "every probe.test member reads function" contract. 08-16-PLAN.md:30 makes advanceTicks always a function that refuses outside `clock=manual`. 08-14-PLAN.md:32 adds no hook member. |
| 4 | Shared limits defined three times | Partial | Single definition site now 08-05-PLAN.md:31 and :146 (src/sim/world/limits.ts). Consumers import it at 08-07-PLAN.md:90, 08-11-PLAN.md:111, 08-13-PLAN.md:92. Residual problems: literal `1e12` still used at 08-11-PLAN.md:177 and :180 and 08-07-PLAN.md:200 (see L-2); the meaning of MAX_SNAPSHOT_PARAM_LENGTH is described inconsistently (see M-2). |
| 5 | Enum fields unchecked and registry prototype dispatch | Resolved | 08-05-PLAN.md:211 (spawn refuses kind, scanClass, ai.aiKey outside closed vocabularies), 08-11-PLAN.md:35 (Object.hasOwn dispatch), 08-11-PLAN.md:185 (sanitize rule 9), 08-11-PLAN.md:152 (grep gate forbids `registry[...].think`). |
| 6 | Quaternion normalisation and tolerance | Resolved | 08-05-PLAN.md:157 (spawn requires unit quaternion, does not normalise), 08-11-PLAN.md:178 (below MIN_QUAT_NORM_SQ treated as degenerate), 08-13-PLAN.md:143 (rejects {w:1e-160} and {w:3e-161}). |
| 7 | worldSeed not a uint32 | Resolved | 08-05-PLAN.md:212 (createWorld throws RangeError for 1.5, -1, 2**32, NaN), 08-13-PLAN.md:26 and :143 (parser rejects the same). |
| 8 | createEventRouter signature contradicts itself | Resolved | 08-10-PLAN.md:158 and :40 (`createEventRouter(ctx, subscribers)`), 08-15-PLAN.md:108 and :133 (same). No `createEventRouter(subscribers)` remains (grep over all 16 plans). |
| 9 | Lint guard gaps in src/sim and AI zone | Resolved | 08-09-PLAN.md:30, :192, :211 (`importNames: ["createSeededRandom"]` in both depth zones), 08-09-PLAN.md:193 (module-level mutable state ban), 08-03-PLAN.md:27 and :150 (no-eval, no-new-func, Intl, localeCompare, computed sort forms). |
| 10 | Restore check compared rounded hashes | Resolved | 08-13-PLAN.md:22 (checkpoint every 50th tick plus 1,000 ticks), 08-13-PLAN.md:128 (`JSON.stringify(snapshotWorld(` compared with toStrictEqual at each checkpoint). |
| 11 | AI event drain bounded by passes only | Resolved | 08-11-PLAN.md:191 (MAX_AI_EVENT_PASSES = 8 and MAX_AI_EVENTS_PER_DRAIN = 4096, remaining events dropped and counted), 08-11-PLAN.md:172 (aiDropped accounting). |
| 12 | ShipControl accepts out-of-domain values | Resolved | 08-07-PLAN.md:30 and :117 (arguments checked against limits.ts and ignored), 08-07-PLAN.md:154 (1e13 ignored, 1e12 accepted, 2**32 ignored). |
| 13 | No Firefox run | Resolved | 08-12-PLAN.md:123 and :137 (non-blocking e2e-cross at step 9), 08-15-PLAN.md:216 and :232 (non-blocking e2e-cross after verify-full). |
| 14 | LOW items (deviations recorded, flaky benchmark, stale anchors) | Partial | Deviations recorded: 08-12-PLAN.md:137. Best-of-N benchmark: 08-15-PLAN.md:334 (R4-03 row). Stale anchors: 26 `game-session.ts:NNNN` anchors remain across 08-02, 04, 06, 08, 10, 11, 12, 16. I spot-checked 19 of them against HEAD and all match today (e.g. 08-12-PLAN.md:28 onLaunchKeyDown 2279-2292, 08-10-PLAN.md:158 2814-2836, 08-08-PLAN.md:1490). They will go stale as the split proceeds. |

Round 4 verdict from this lens: 13 of 14 items resolved in plan text, one partial (item 4, residual literal and naming, carried below) and one partial (item 14, anchors). No Round 4 item is Open.

---

## Summary of new findings (this round)

| ID | Severity | Plans | Finding |
|----|----------|-------|---------|
| M-1 | MEDIUM | 08-05, 08-11, 08-03, 08-15 | Key Decisions row letter (d) is claimed for two different rows. |
| M-2 | MEDIUM | 08-05, 08-11, 08-13, FOUND-10 (REQUIREMENTS.md) | REQUIREMENTS.md:22 (FOUND-10) says the probe shape is unchanged, but 08-16 (which carries FOUND-10) deliberately adds probe fields. 08-16 does not list REQUIREMENTS.md in files_modified. |
| M-3 | MEDIUM | 08-16, 08-14, ROADMAP SC5 | ROADMAP Phase 8 success criterion 5 (browser hash equals Vitest hash for N ticks, with traffic off) is narrowed by 08-16 to an empty-world parity claim. The plan flags this itself as unresolved. |
| L-1 | LOW | 08-05, 08-13 | MAX_SNAPSHOT_PARAM_LENGTH is documented as a per-element limit in one place and as an array-length limit in others (naming and doc drift). |
| L-2 | LOW | 08-11, 08-07 | Literal 1e12 used where the shared limit is required. |
| L-3 | LOW | 08-13, 08-05, 08-11 | MIN_QUAT_NORM_SQ is in the import list of 08-05 and 08-11 but not in 08-13's list. The parser test still holds because QUAT_UNIT_TOLERANCE rejects the subnormal cases. |
| L-4 | LOW | 08-15 | A superseded `snapshotForSave(inputs)` call is quoted in a Round 2 row (08-15-PLAN.md:308). Line 341 supersedes it, but a reader could copy the stale form. |
| L-5 | LOW | 08-15, CONTEXT D-14 | The single integration plan conditionally edits a core-track file (08-15-PLAN.md:18, src/sim/world/step.ts). D-14 allows one integration plan, so this is probably intended, but it should be stated. |
| L-6 | LOW | 08-02, 04, 06, 08, 10, 11, 12, 16 | Pre-split game-session.ts line anchors (26 occurrences) will go stale as extraction proceeds (Round 4 item 14, still open in part). |

---

## 08-01

**Summary.** Split safety nets: verify-full baseline, probe-shape snapshot, session-source scans. Wave 1, no dependencies.

**Strengths.**
- Its probe.test contract (08-01-PLAN.md:27, "six states", every probe.test member a function) is the anchor that 08-16 now honours (08-16-PLAN.md:30, :143). Round 4 item 3 is closed by keeping this plan's text unchanged.
- The frontmatter requirement id (FOUND-10) matches ROADMAP Phase 8.

**Concerns.**
- MEDIUM: REQUIREMENTS.md:22 (FOUND-10) still reads "the probe shape is unchanged". This plan carries FOUND-10 in its frontmatter. Once 08-16 adds probe fields (M-2), the requirement text and the plan that claims it disagree. This plan is the earliest place to note the planned reconciliation, but it does not need to change.
- LOW: 08-01-PLAN.md:184 names the verify-full run after 08-02 and 08-03. Consistent with wave 1 ordering. No issue.

**Suggestions.** Leave as is. M-2 is fixed in 08-16 by also editing REQUIREMENTS.md.

**Risk.** LOW.

---

## 08-02

**Summary.** Pinned v1 flight hashes, RNG vectors, serialisable seeded stream, mix32 world and fork seeds. Wave 1, autonomous false.

**Strengths.**
- Identifiers are consistent with later plans: `worldSeedFor(marketSeed, epoch)`, `forkSeed(worldSeed, entityId, purpose)`, `RngPurpose = "world" | "ai" | "combat"` (08-02-PLAN.md:192-193) match the uses in 08-05-PLAN.md:118 and 08-13-PLAN.md:93 and the NO_ENTITY "world" call in 08-05-PLAN.md:38.
- File anchors I checked hold at HEAD: stepFlight at src/sim/flight/step.ts:83 (08-02-PLAN.md:116), hashFlight at src/sim/flight/state.ts:181, createSeededRandom at src/sim/math.ts:227 (08-02-PLAN.md:31), game-session.ts:2084-2133 and 2814-2836 (08-02-PLAN.md:120, :131).

**Concerns.**
- LOW: 08-02 modifies `.planning/PROJECT.md` in wave 1, and 08-05 modifies it in wave 2 (08-05-PLAN.md:17), both adding Key Decisions rows. The lettering collision (M-1) starts with rows written by these plans; 08-02 uses unlettered rows, so no collision here, but the row-letter convention should be fixed in one place.
- LOW: 08-02-PLAN.md:31 forbids any createSeededRandom( call outside math.ts and arrival.ts. This matches 08-09's zone rule (08-09-PLAN.md:192). No contradiction.

**Suggestions.** Keep unlettered Key Decisions rows here and cite them by title in later plans (see M-1).

**Risk.** LOW.

---

## 08-03

**Summary.** Determinism lint bans in src/sim and entity-id scope guard. Wave 1, autonomous true.

**Strengths.**
- Round 4 item 9 is closed: the src/sim zone gains no-eval, no-new-func, Intl and localeCompare bans (08-03-PLAN.md:27, :150, :170), mirroring eslint.config.js:208-241 (the generator zone; line anchor verified).
- The entity-id guard (08-03-PLAN.md:32, tests/guards/entity-id-scope.test.ts) is consistent with 08-15-PLAN.md:148, which forbids EntityId in world-lifecycle.ts.
- tests/guards/eslint-gate.ts exists at HEAD (checked), so the reuse claim at 08-03-PLAN.md:99 is valid.

**Concerns.**
- MEDIUM (M-1): 08-03-PLAN.md:60 says "plan 08-05's Key Decisions row (d) cites it". Row (d) is also claimed by 08-11 for a different decision (see M-1 under 08-05 and 08-11). Cross-reference is ambiguous until the letters are fixed.
- LOW: the guard prohibits `src/sim/world/ids` imports outside src/sim. 08-15 and 08-16 do not import it (checked), so no conflict.

**Suggestions.** Cite Key Decisions rows by title, not by letter.

**Risk.** LOW.

---

## 08-04

**Summary.** Split steps 1-2: typed session context and first controller extraction (probe publisher). Wave 2, depends on 08-01.

**Strengths.**
- Declared depends_on (08-01) matches the text. File ownership is disjoint from wave 2 peer 08-05 (08-05 owns src/sim/world/**).
- `createProbePublisher(ctx: SessionState, deps: ProbePublisherDeps)` (08-04-PLAN.md:154) is the same name and shape that 08-14 and 08-16 extend.

**Concerns.**
- LOW (L-6): game-session.ts:356-490 (08-04-PLAN.md) is a pre-split anchor. Anchors are checked at HEAD and match, but they will go stale after this plan commits.

**Suggestions.** Keep "locate by name" wording alongside line anchors (as 08-08 already does).

**Risk.** LOW.

---

## 08-05

**Summary.** World foundation: ids, entities, five static entities, store, world hash, and the shared limits module src/sim/world/limits.ts. Wave 2, depends on 08-02 and 08-03.

**Strengths.**
- Round 4 items 4, 6, 7 are closed here: limits.ts has one definition site with no imports (08-05-PLAN.md:31, :146); spawnEntity refuses non-unit quaternions (08-05-PLAN.md:157); createWorld refuses invalid worldSeed (08-05-PLAN.md:212).
- Id table is consistent with CONTEXT D-06: NO_ENTITY 0, statics 1-5, ids 6-99 reserved, PLAYER_ID 100, FIRST_DYNAMIC_ID 101 (08-05-PLAN.md:28, :147; CONTEXT D-06 at 08-CONTEXT.md:35).
- nextId bounds are consistent with 08-13. The store refuses allocate at nextId > MAX_UINT32 (08-05-PLAN.md:150) but may be constructed with nextId = 2**32 (08-05-PLAN.md:209), and the parser accepts 2**32 (08-13-PLAN.md:143, :299). These agree because the parser accepts a state the store can hold without allocating.

**Concerns.**
- MEDIUM (M-1): Key Decisions row (d) collision. 08-05-PLAN.md:34 and :224 record per-world entity id uniqueness as "row (d)". 08-11-PLAN.md:234 writes a different "(d)" row ("Phase 8 moves dynamic entities at their desired speed along their facing"). Plans 08-03-PLAN.md:60 and 08-15-PLAN.md (the row (d) citations) rely on the 08-05 meaning.
- LOW (L-1): 08-05-PLAN.md:146 defines `MAX_SNAPSHOT_PARAM_LENGTH = 64` as "(param array elements)". The same plan at 08-05-PLAN.md:158 and :210 uses it as an array-length cap ("a 65-element param array"), and 08-11-PLAN.md:111 and :191 call it "param array lengths", and 08-13-PLAN.md:115 calls it "param array exceeding MAX_SNAPSHOT_PARAM_LENGTH". The doc comment should say maximum array length.
- LOW (L-3): 08-05-PLAN.md:31 and :146 list MIN_QUAT_NORM_SQ as a shared limit, and 08-11-PLAN.md:111 imports it. 08-13-PLAN.md:92 and :115 do not list it.

**Suggestions.** Rename the 08-05 row to "(d) per-world entity ids" and have 08-11 use a distinct letter or title. Replace "(param array elements)" with "maximum array length (elements)" at 08-05-PLAN.md:146.

**Risk.** LOW (text-only).

---

## 08-06

**Summary.** Split steps 3-4: render driver, chart and settings controllers. Wave 3, depends on 08-04.

**Strengths.**
- Factory signatures match the 08-04 pattern: `createRenderDriver(ctx, deps)`, `createChartController(ctx, deps)`, `createSettingsController(ctx, deps)` (08-06-PLAN.md:35-39, :110, :149-150).
- The window keydown anchor at game-session.ts:2268 matches HEAD (`window.addEventListener("keydown", onSubpanelKeyDown, ...`).
- Firefox run is placed at 08-12 per the consensus (08-06-PLAN.md:265).

**Concerns.**
- LOW: 08-06-PLAN.md:90 says pre-split anchors "before plan 08-04". Consistent. No new issue.

**Suggestions.** None beyond L-6.

**Risk.** LOW.

---

## 08-07

**Summary.** AI seam: read-only WorldView and write-only ShipControl. Wave 3, depends on 08-05.

**Strengths.**
- ShipControl method set is consistent across 08-07 and its consumers: `setTarget, setDestination, setDesiredRange, setDesiredSpeed, perform(id, behaviour), scheduleWake(id, ticks)` (08-07-PLAN.md:115, :29); 08-09-PLAN.md:96 and :150-156 use the same names. Round 4 item 12 closed (08-07-PLAN.md:30, :117, :154).
- Imports from ./limits.js (08-07-PLAN.md:90) match 08-05's single definition site.
- Per-world id scope is stated consistently (08-07-PLAN.md:32, :152).

**Concerns.**
- LOW (L-2): 08-07-PLAN.md:200 (T-08-51) says "magnitudes at most 1e12" as a literal rather than MAX_ENTITY_MAGNITUDE. Same value, but the plan's own rule (08-07-PLAN.md:90) says import, never redefine.

**Suggestions.** Replace the literal with `MAX_ENTITY_MAGNITUDE` in the threat row.

**Risk.** LOW.

---

## 08-08

**Summary.** Split steps 5-6: station controller and save controller. Wave 4, depends on 08-06.

**Strengths.**
- Named export set matches HEAD and later plans: saveBoot.store read/clear at game-session.ts:1341 and :1490, `buildSnapshotInputs` (game-session.ts:1131), `snapshotForSave` imported from src/persistence/autosave.ts (game-session.ts:63-65 and autosave.ts:66) and `parseSave` from save.ts (game-session.ts:69). The 08-08 references to these modules are correct.
- Anchors 825, 862, 1344, 1906 match HEAD (outfittingModel at 825, data-field query at 862, saveScreenOpen check at 1344, station-screen lookup at 1906).

**Concerns.**
- LOW (L-6): five game-session.ts line anchors remain in 08-08-PLAN.md. They match HEAD today, but they go stale once 08-08 itself moves the code. The plan already says "pre-split anchors; locate by name" (08-08-PLAN.md:87), so this is handled.

**Suggestions.** None.

**Risk.** LOW.

---

## 08-09

**Summary.** AI types, integer tick timers, registry, scripted test pilot, AI lint zone. Wave 4, depends on 08-07 and 08-03.

**Strengths.**
- Round 4 item 9 is closed for the AI zone: depth-1 and depth-2 import rules forbid createSeededRandom under alias (08-09-PLAN.md:192, :211), and module-level mutable state is banned (08-09-PLAN.md:193).
- The transitive edge claim is correct: 08-09 depends on 08-07, which depends on 08-05, so 08-05's limits are available (08-09-PLAN.md:314).
- Oolite comment for the scanner range (src/Core/Entities/ShipEntity.m:12161, "25600 km") supports the default scanRange 25600 in 08-09-PLAN.md:122.

**Concerns.**
- MEDIUM (M-1): 08-03-PLAN.md:60 cites "row (d)" of 08-05 (see M-1 under 08-05), and this plan does not state its own row letter.
- LOW: the AI module type is `AiModule { think, onEvent? }` (08-09-PLAN.md:120), and 08-11-PLAN.md:114 uses the same. Consistent. No issue.

**Suggestions.** Give the AI zone rule a title in PROJECT.md rather than a letter.

**Risk.** LOW.

---

## 08-10

**Summary.** Split steps 7-8: hyperspace controller, event router, sim driver, step options. Wave 5, depends on 08-08. Declared no edge to 08-11 (same wave).

**Strengths.**
- Round 4 item 8 closed: `createEventRouter(ctx, subscribers)` at 08-10-PLAN.md:40 and :158; 08-15 uses the same at 08-15-PLAN.md:108 and :133. No `(subscribers)`-only form remains.
- "14 routed kinds" matches HEAD: src/sim/events.ts has 14 `kind:` members in the SimEvent union (checked, lines 27-59).
- Order independence with 08-11 is stated and justified (08-10-PLAN.md:34, :159; 08-11-PLAN.md:366). The RoutedKind table is literal over 14 kinds, so 08-11's 15 reserved kinds do not change it.

**Concerns.**
- LOW: game-session.ts:2161 (`document.getElementById("status")`, cited in 08-10-PLAN.md) is a pre-split anchor and will move (L-6).

**Suggestions.** None beyond L-6.

**Risk.** LOW.

---

## 08-11

**Summary.** World step: id-order pass, queued AI events with bounds, sanitize, reserved SimEvents, sim.ts stepSim. Wave 5, depends on 08-09.

**Strengths.**
- Round 4 items 1 (sanitizer side), 5, 6, 11 are closed here: own-key dispatch and enum repair (08-11-PLAN.md:35, :185), degenerate quaternion rule (08-11-PLAN.md:178), event budgets MAX_AI_EVENT_PASSES = 8 and MAX_AI_EVENTS_PER_DRAIN = 4096 (08-11-PLAN.md:191).
- Limits are imported from limits.ts and not redeclared (08-11-PLAN.md:111, :191), matching 08-05.
- The reserved SimEvent set is consistent with 08-10 (see above) and with ARCHITECTURE.md:450 section 7.6.

**Concerns.**
- MEDIUM (M-1): 08-11-PLAN.md:234 writes Key Decisions rows (a)-(h) into PROJECT.md. Its row (d) ("Phase 8 moves dynamic entities at their desired speed along their facing") collides with 08-05's row (d) (per-world entity ids, 08-05-PLAN.md:34, :224). Two rows with the same letter in one PROJECT.md is a direct contradiction in the identifiers the plans rely on.
- LOW (L-2): 08-11-PLAN.md:177 uses `Math.abs(c) > 1e12` and 08-11-PLAN.md:180 uses `entity.radius > 1e12` as literals, while 08-11-PLAN.md:111 says the limits are imported. Same value as MAX_ENTITY_MAGNITUDE, so no behaviour gap, but it breaks the single-source rule.
- LOW: 08-11-PLAN.md:230 says "these 15 kinds" for RESERVED_EVENT_KINDS. I did not count the ARCHITECTURE section 7.6 list to the end, so I cannot confirm 15 from the source (open question, not a contradiction).

**Suggestions.** Rename 08-11's row to a title-based reference, or re-letter it (for example (i)). Replace the literal 1e12 with MAX_ENTITY_MAGNITUDE at :177 and :180.

**Risk.** LOW (text-only), but M-1 must be fixed before PROJECT.md rows are written.

---

## 08-12

**Summary.** Split step 9: frame loop and start-up wiring, thin facade. Wave 6, depends on 08-10.

**Strengths.**
- Anchors hold at HEAD: onLaunchKeyDown at game-session.ts:2279-2292 (08-12-PLAN.md:28), swapSystem at :3284-3294 (08-12-PLAN.md:27), pending.length at :2738.
- Non-blocking Firefox run is recorded at step 9 (08-12-PLAN.md:123, :137), per Round 4 item 13.
- Deliberate deviations (disposed guards, swapSystem rAF tracking) are recorded in the SUMMARY (08-12-PLAN.md:137), per Round 4 item 14.

**Concerns.**
- LOW (L-6): 08-12 holds four game-session.ts anchors, all accurate today, to be used before step 9 commits.
- LOW: 08-12-PLAN.md:123 uses `git worktree add --detach /tmp/wegolite-gate-08-12-step9`. It creates a worktree outside the repository, which is acceptable under the scratch rule, but it writes metadata into .git. Not a plan contradiction.

**Suggestions.** None beyond the above.

**Risk.** LOW.

---

## 08-13

**Summary.** Snapshot codec, 1,000-tick live-versus-restored equality, cadence test. Wave 6, depends on 08-11.

**Strengths.**
- Round 4 items 1, 7, 10 are closed here: non-finite refusal (08-13-PLAN.md:151), worldSeed bound (08-13-PLAN.md:26, :143), exact JSON equality at checkpoints (08-13-PLAN.md:128).
- nextId handling agrees with 08-05: parser accepts up to 2**32 (08-13-PLAN.md:143, :299), and the store refuses allocate beyond MAX_UINT32 (08-05-PLAN.md:150).
- Imports from ./limits.js and no constant re-export (08-13-PLAN.md:115, :92).

**Concerns.**
- LOW (L-3): 08-13-PLAN.md:92 and :115 list the imported limits without MIN_QUAT_NORM_SQ, which 08-05-PLAN.md:31 and 08-11-PLAN.md:111 include. The subnormal-norm rows at 08-13-PLAN.md:143 still hold because the tolerance check rejects them, so this is a list omission, not a behaviour gap.
- LOW (M-2 partial): the 08-13 snapshot `rng` field is pinned as "a plain uint32 number equal to world.rng.s" (08-13-PLAN.md:23). Consistent with 08-05. No issue.

**Suggestions.** Add MIN_QUAT_NORM_SQ to the list at 08-13-PLAN.md:92 and :115 so that the import list matches 08-05.

**Risk.** LOW.

---

## 08-14

**Summary.** Test flags and manual-clock sim driver with advanceTicks. Wave 7, depends on 08-12.

**Strengths.**
- advanceTicks contract is consistent with 08-16: refuses outside the manual clock, refuses while disposed, taints first (08-14-PLAN.md:29, :153-160). 08-16 delegates to it (08-16-PLAN.md:30, :58).
- MAX_ADVANCE_TICKS = 200_000 is stated at 08-14-PLAN.md:135 and is the bound used by the refusal rows at 08-14-PLAN.md:153. 08-16 inherits it through the driver and adds no value of its own.
- "No change in this plan" for the hook (08-14-PLAN.md:274, R4-05) is consistent with 08-16 owning the one probe commit (D-13).

**Concerns.**
- LOW: 08-14-PLAN.md:98 states a "D-10 refinement" (`traffic: hook && traffic === "1"` vs "true without the hook"). CONTEXT D-10 (08-CONTEXT.md:42) says production always has traffic once a populator exists. The refinement is consistent with D-10 but it changes what `testFlags.traffic` means for production; 08-15-PLAN.md:177 relies on the production meaning. Stated, but worth one sentence in the header comment.

**Suggestions.** Make the production meaning of `testFlags.traffic` explicit in the 08-14 doc comment.

**Risk.** LOW.

---

## 08-15

**Summary.** Single integration plan (D-14): world lifecycle, epoch bump points, anchored-save check, step-cost benchmark, Firefox run. Wave 8, depends on 08-14, 08-11, 08-13.

**Strengths.**
- Declared depends_on now includes 08-13 (08-15-PLAN.md:6), matching the R2-04 request.
- snapshotForSave signature at 08-15-PLAN.md:109 (`snapshotForSave(state, profile, system, station, market, commodities, targetSystemId?)`) matches source (game-session.ts:1144-1152 and autosave.ts:66). createEventRouter(ctx, subscribers) and createSimDriver(ctx, deps) match 08-10.
- EntityId is kept out of world-lifecycle.ts (08-15-PLAN.md:148), consistent with the 08-03 guard.

**Concerns.**
- LOW (L-4): 08-15-PLAN.md:308 quotes the superseded `snapshotForSave(inputs)` call in an R2-04 row. Line 341 (R4-10) supersedes it and says so, so it is not a live contradiction, but the stale form is still in the plan.
- LOW (L-5): 08-15-PLAN.md:18 lists src/sim/world/step.ts as a conditional edit. This is a core-track file under CONTEXT D-14 (08-CONTEXT.md:50). 08-15 is the integration plan, so this is probably permitted, but D-14 does not say so and the wording should.
- MEDIUM (M-1): 08-15-PLAN.md:213 (and the row-(d) references at 08-15-PLAN.md:35 and :308) cite "Key Decisions row (d)" for the per-world id rule. That is the 08-05 meaning, which 08-11 contradicts (see M-1).
- LOW: 08-15-PLAN.md:208-213 and 08-16-PLAN.md:28 both rely on the claim that plans 08-04 to 08-15 leave probe.ts untouched. Verified: none of 08-04 to 08-15 lists src/app/probe.ts in files_modified.

**Suggestions.** Remove the stale snapshotForSave(inputs) quote from the R2-04 row. State in D-14 or in 08-15 that the integration plan may edit core files only for the conditional step-cost fast path.

**Risk.** LOW.

---

## 08-16

**Summary.** One deliberate probe commit (D-13): probe.sim, worldHash, advanceTicks, browser and Vitest hash parity. Wave 9, depends on 08-15.

**Strengths.**
- Round 4 items 2 and 3 are closed here: narrowed gate (08-16-PLAN.md:146, verified against src/app), always-present advanceTicks (08-16-PLAN.md:30, :143).
- Fixture state count is consistent with 08-01: six states before, seven after adding testHookManualDocked (08-01-PLAN.md:27; 08-16-PLAN.md:143).
- createTestHook gains a fifth parameter (08-16-PLAN.md:40, :227). Current source is `createTestHook(state, scenes, onMutate, profile?)` (src/app/probe.ts:390). The new call site at game-session.ts:1035 matches the consensus anchor.
- Transitive dependency on 08-14 is valid (08-16 depends on 08-15, which depends on 08-14).

**Concerns.**
- MEDIUM (M-2): REQUIREMENTS.md:22 (FOUND-10) says "the probe shape is unchanged". The 08-16 frontmatter (08-16-PLAN.md:19) lists FOUND-10 for this plan, and 08-16-PLAN.md:183 records the SC1/D-13 reconciliation only in PROJECT.md. REQUIREMENTS.md is not in files_modified. The requirement text and the plan's own deliverable contradict each other until someone edits REQUIREMENTS.md. ROADMAP SC1 (08-16-PLAN.md:28 quotes it) already states the reconciliation, so the fix is a one-line REQUIREMENTS.md edit.
- MEDIUM (M-3): ROADMAP Phase 8 success criterion 5 says a browser spec "reads the same hash as a Vitest run of the same N ticks". 08-16-PLAN.md:32 claims parity "at its honest Phase 8 scope" (empty world, entities 0). 08-16-PLAN.md:195 states this as "FOUND-14 (unclassified, unresolved)" and asks for confirmation at verification. The plan is open about it, but the roadmap wording is not amended and the requirement is not formally narrowed.
- LOW: 08-16-PLAN.md:146 and :211 quote the gate regex. Checked: `\.store\??\.(live|get|allocate|kill|commit|nextId)\b` does not match the IndexedDB calls at game-session.ts:1341, :1490, :3345 today. Correct, but the pattern will need re-checking after 08-08 moves those calls.

**Suggestions.** Add REQUIREMENTS.md to files_modified and change FOUND-10 text to "the probe shape changes only by the one additive commit of D-13". Either amend ROADMAP SC5 or record the narrowing in REQUIREMENTS.md with a classification (this is the unresolved FOUND-14 question).

**Risk.** MEDIUM (requirement text and roadmap wording, not code).

---

## Overall Risk Assessment

**MEDIUM.**

- No HIGH cross-plan contradiction was found. The wave graph, depends_on edges, file ownership within each wave, requirement coverage (FOUND-10..14 each claimed by at least one plan, and every plan's requirements match its text), and the central contracts (createEventRouter, createTestHook, advanceTicks, shared limits, ShipControl and WorldView members, createSeededRandom ban) are consistent at the text level.
- Three MEDIUM items need text edits before execution:
  1. M-1: Key Decisions row letter (d) is claimed for two different rows (08-05-PLAN.md:34, :224 vs 08-11-PLAN.md:234). Fix by titles or re-lettering.
  2. M-2: REQUIREMENTS.md:22 (FOUND-10) contradicts 08-16's probe change. 08-16 must also edit REQUIREMENTS.md.
  3. M-3: ROADMAP SC5 is narrowed by 08-16 without an amendment or classification (08-16-PLAN.md:32, :195).
- The LOW items are naming and doc-comment drift (MAX_SNAPSHOT_PARAM_LENGTH, MIN_QUAT_NORM_SQ import list, literal 1e12), one stale superseded quote (08-15-PLAN.md:308), and advisory stale anchors.
- Round 4: 13 of 14 consensus items resolved in plan text; items 4 and 14 partial. None open.

## Verdict

**NEEDS REVISION** (text-only; no wave, dependency or file-ownership change is required). The three MEDIUM items are small edits: rename or re-letter one Key Decisions row, add REQUIREMENTS.md to 08-16 and amend FOUND-10, and either amend ROADMAP SC5 or classify the FOUND-14 narrowing.

## Open questions (not verified)

- Whether ARCHITECTURE.md section 7.6 lists exactly the 15 reserved kinds named at 08-11-PLAN.md:230 (I did not count to the end of the list).
- Whether 08-15's conditional src/sim/world/step.ts edit (L-5) is intended under D-14. Probably yes, as the single integration plan; the plans do not say so.
- Whether the 26 game-session.ts anchors (L-6) survive each wave; I checked only HEAD.
