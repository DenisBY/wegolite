# Performance

This document records the frame budget Wegolite is held to, what the container measures against it, and the manual reference-desktop run that is the only evidence for a frame rate. It answers QUAL-01 and follows decisions D-10 to D-14 in `.planning/phases/07-hardening-community-release/07-CONTEXT.md`.

## Budget

Each rendered frame must stay inside these limits. Each row names the gate that enforces it.

| Quantity                      | Budget          | Source                                   | Enforced by                                                                                                                                                                                               |
| ----------------------------- | --------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draw calls per rendered frame | at most 50      | STACK.md lines 442-443 (research target) | `DRAW_CALL_BUDGET` in `tests/e2e/helpers/budgets.ts`, asserted by `budget.spec.ts`, `traffic.spec.ts` (traffic on), `npc-flight.spec.ts`, `combat.spec.ts` and `anarchy.spec.ts` (the full anarchy, D-05) |
| Triangles per rendered frame  | at most 250 000 | STACK.md lines 442-443 (research target) | `TRIANGLE_BUDGET` in `tests/e2e/helpers/budgets.ts`, asserted by `budget.spec.ts` and `anarchy.spec.ts`                                                                                                   |
| Planet noise evaluations      | at most 9       | `BUDGET_CEILING` (D-12, unchanged)       | `tests/render/planet-budget.test.ts` (`BUDGET_CEILING = 9`)                                                                                                                                               |

The budget applies to the default Standard quality, which is what every test renders. The opt-in High quality (the "High-quality graphics" setting) spends up to 17 planet noise evaluations (`HIGH_NOISE_EVAL_BUDGET`) and adds up to five draw calls: one for the atmosphere shell and one per nebula texture. It has no frame-rate evidence yet; measure it with the reference-desktop protocol below before changing the default.

The Settings "Show FPS counter" option shows the animation-frame rate over 500 ms windows, the same interval the sampler below measures, as a quick on-screen reading. It is not QUAL-01 evidence and does not replace the reference-desktop protocol. It is a DOM text element in the document footer, so it adds no draw call and no triangles. Docked, it reports the loop rate, while the redraw gate skips unchanged GPU draws.

Both draw-call and triangle comparisons are inclusive: 50 calls and 250 000 triangles pass, while 51 calls and 250 001 triangles fail. A scene that reports zero calls or zero triangles also fails, so a blank frame cannot pass the budget.

The draw-call budget stayed at 50 through Phase 21's full-anarchy spike (D-05, plan 21-19, 2026-11-26): after fix (1), the per-hull primitive merge of plan 21-17, the 29-hull anarchy draws 39 calls and 42 after a kill with its debris and explosion live, and the bound with all seven debris models present is 49. Fix (2), variant instancing (plan 21-18), is deferred, and no raise is allowed while it is. The numbers are in "Full-anarchy draw-call spike (Phase 21, D-05)" below. The browser budgets and `withinBudget`, the inclusive comparison with the zero rule, have one source, `tests/e2e/helpers/budgets.ts`, proven at the boundary by `tests/app/e2e-budgets.test.ts`.

## Container measurements

These are the per-scene counts from the `budget.spec.ts` annotations, recorded in the containerised build on the dates shown. The two buoys add four draw calls and about 2 700 triangles to every scene that draws them. They are SwiftShader counts of draw calls and triangles per rendered frame. They are not frame rates, and they say nothing about how fast a player's GPU renders these scenes.

| Scene                                                                | Draw calls | Triangles | Recorded   |
| -------------------------------------------------------------------- | ---------- | --------- | ---------- |
| Lave docked                                                          | 13         | 41418     | 2026-11-11 |
| Lave launching                                                       | 8          | 3302      | 2026-11-11 |
| Lave in flight                                                       | 10         | 41012     | 2026-11-11 |
| Diso docked                                                          | 13         | 41418     | 2026-11-11 |
| Diso in flight                                                       | 10         | 41012     | 2026-11-11 |
| Lave in flight, traffic on (opt-in)                                  | 17         | 49095     | 2026-11-14 |
| Lave in flight, traffic on, after a kill (debris and explosion live) | 21         | 51423     | 2026-11-17 |

The traffic-on row is the scene after a launch and 600 manual ticks with the 12 inert ships present and their models loaded; with the models still held it is 9 calls and 39192 triangles, so the NPC layer added 8 calls and 9903 triangles there. The layer adds one call per (model, primitive) present; since plan 21-17 (D-05 fix 1) every NPC hull is one primitive (the 22 hulls that had two or three were merged through a per-hull texture atlas, and no validity condition refused any of them), so it adds one call per model present, at most 29 for the 29 hulls. It is measured only by the opt-in `tests/e2e/traffic.spec.ts`, because the browser-test bundle defaults traffic off and `budget.spec.ts` therefore stays an empty-world measurement. The spec asserts the loaded scene is above the held one and at most 50 calls; the figures are counts in the container build, not frame rates.

The after-a-kill row (Phase 16, plan 16-09) is the scene of `tests/e2e/combat.spec.ts` step 5: the hook-spawned Viper with 20 cargo capsules destroyed by the player's laser, read 60 ticks after the kill with the explosion cloud, 3 pods, 1 alloy plate and the remaining wrecks drawn and their models loaded. On the tick before the kill the same scene drew 19 calls and 51614 triangles. The debris layer adds at most one call per (model, primitive) present, at most 7 for the seven stock debris models, however many pieces exist; the explosion layer adds at most 2 (the cloud and the flash, each one instanced draw object for a pool of 8 explosions). The spec asserts the count is above 0 and at most 50, and that the world hash 60 ticks after the kill equals the Node twin's, which has no render layer.

Since quick task 261110-a3k a docked or paused scene is drawn when it is entered and then left alone until something changes (`src/app/redraw-gate.ts`). The docked rows above are the counts of that last draw; they are no longer a per-frame cost. `budget.spec.ts` therefore settles on loop frames (`probe.frames`), not on rendered frames.

The Diso scenes are reached through an IndexedDB save fixture (`tests/e2e/helpers/save-fixtures.ts`) and the spec asserts the live `systemId` is Diso's before reading the counts. Their counts match Lave's because the docked and in-flight scenes have the same structure.

### Full-anarchy draw-call spike (Phase 21, D-05)

`tests/e2e/anarchy.spec.ts` (plan 21-16) spawns one inert ship of every one of the 29 catalogue keys on a ring ahead of the player (`?test=1&traffic=1&clock=manual`), waits until every key's model and textures have arrived and the counters hold still, reads the frame, then kills the `?test=1` cargo shooter with the player's laser and reads again 60 ticks after the kill, with its debris and explosion live. The spec asserts both triangle counts within `TRIANGLE_BUDGET` and both call counts within `DRAW_CALL_BUDGET` through `withinBudget` (`tests/e2e/helpers/budgets.ts`, plan 21-19). SwiftShader counts in the browser-test bundle on the remote test machine.

| D-05 step                                                          | Worst case calls | Worst case triangles | After kill calls | After kill triangles | Run                          |
| ------------------------------------------------------------------ | ---------------- | -------------------- | ---------------- | -------------------- | ---------------------------- |
| 21-16 baseline, before any fix                                     | 65               | 77 934               | 68               | 78 598               | plan 21-16                   |
| After fix (1), every NPC hull merged to one primitive (plan 21-17) | 39               | 77 934               | 42               | 78 598               | `90c5f209`, again `985b9049` |
| After fix (2a) and (2b), variant families instanced (plan 21-18)   | deferred         | deferred             | deferred         | deferred             | see `21-18-SUMMARY.md`       |
| Plan 21-19, fix (1) only, with the budget assertions               | 39               | 77 934               | 42               | 78 598               | `f8ea61cb`, 2026-11-26       |

Fix (1) merged all 22 multi-primitive hulls; no hull was refused by a validity condition and the 7 single-primitive hulls were already one primitive, so every NPC key costs exactly one call: 39 = 29 hull calls and the 10 calls of the scene without ships (the `Lave in flight` row above). Fix (2) was deferred by the orchestrator on 2026-11-26 (owner offline, independent reviewer consulted): with the anarchy at 39 and 42 calls no raise is needed, so D-05's precondition for a raise never triggers, and the variant instancing would save about 10 calls with a low-confidence shader patch and no texture-memory benefit. No variant family is split and no hull is refused, because fix (2) did not run. The deferral is recorded under D-05 in `21-CONTEXT.md` and in the Key Decisions row "Draw-call budget and NPC model loading for the v2.4 roster", flagged for owner review; its tripwire is the calls assertion of the anarchy spec, and its work is todo `2026-11-26-npc-variant-family-instancing`.

**Seven-debris upper bound.** The kill shows only the debris models its own pieces use (5 debris entities in this run), and the probe does not name them, so the bound counts all seven stock debris models (`barrel`, `alloy`, `wreck1` to `wreck5`, one primitive each in their GLBs) as not shown: 42 + 7 = **49 calls**. The bound by layer maxima agrees: the 39-call anarchy, plus the laser-shot layer (1 call while any shot is live), the explosion layer (2: cloud and flash) and the debris layer (at most 7) is 49 calls. Both are within the 50-call budget with one call to spare, at the Standard quality the budget applies to (the opt-in High quality adds up to 5 calls). A populator that ever needs a second instanced mesh set per hull key, or an eighth debris model, passes 50 and brings the deferred work back first.

**Triangles.** 77 934 before the kill and 78 598 after it, 31 % of the 250 000-triangle budget. No authorisation covers a triangle raise and none was needed.

**Budget decision.** `DRAW_CALL_BUDGET` stays **50**: the worst measured count after fix (1) is 42 and the seven-debris bound is 49, both within 50, and no raise is allowed while plan 21-18 is deferred. The browser budgets have one source, `tests/e2e/helpers/budgets.ts`, which all five specs import.

**GPU frame time (D-06, one-off).** Measured on 2026-11-26 on the remote test machine's NVIDIA GeForce RTX 4060, renderer string `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 4060), OpenGL 4.6)`, read from the game page itself, in Chromium 159.0.8154.6 running headed under Xvfb (the `wegolite-pw-mcp` container's GPU recipe), viewport 1920x1080 at `devicePixelRatio` 1, against the production preview (`npm run build`) of `f8ea61cb` served on the same machine. The sampler is the one of "Scenarios and sampler" below, 30 s per row. Fight: `?test=1&traffic=1` on the real clock, launch, speed 0, `spawnTestAnarchy()`, wait until the counters hold at 39 calls (29 ships drawn), then hold the fire key, spawn the 20-capsule cargo shooter and start the sampler at once (start delay 0); the shooter died inside the window and the per-second reads ran 39 to 43 calls. Baseline: `?test=1` (traffic off), Lave in flight after launch, start delay 5 s.

| Row (remote RTX 4060, Chromium 159)                     | Count  | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Share above 16.7 ms | Share above 33.3 ms |
| ------------------------------------------------------- | ------ | -------- | -------- | -------- | -------- | ------------------- | ------------------- |
| Full-anarchy fight, 60 Hz paced                         | 1 794  | 16.70    | 16.70    | 16.80    | 83.30    | 43.31 %             | 0.11 %              |
| Baseline, Lave in flight, traffic off, 60 Hz paced      | 1 800  | 16.70    | 16.70    | 16.80    | 16.80    | 41.83 %             | 0 %                 |
| Full-anarchy fight, unpaced (vsync and frame limit off) | 13 581 | 2.00     | 3.40     | 6.90     | 71.80    | 0.04 %              | 0.03 %              |
| Baseline, Lave in flight, traffic off, unpaced          | 20 933 | 1.40     | 1.70     | 2.40     | 670.40   | 0.005 %             | 0.005 %             |

The paced rows meet D-05's condition (fight p95 at most 16.7 ms), but they cannot discriminate: Chromium paces rAF at 60 Hz, so the fight and the baseline both read the frame interval (p95 16.70 ms, p99 16.80 ms, the same as the Chrome rows of "Results"). The unpaced rows (launched with `--disable-gpu-vsync --disable-frame-rate-limit`, an addition to the protocol for this reading only) show the headroom the paced rows hide: the fight's p95 is 3.4 ms against the baseline's 1.7 ms. The baseline's unpaced max is one 670 ms stall, outside p99. These readings inform D-05 only. They are **not QUAL-01 evidence** (D-06): QUAL-01's 60 fps evidence remains the reference-desktop protocol below, which is still deferred.

### Collision stage at the entity cap (informational)

One call of the collision stage (`resolveCollisions`, `src/sim/combat/collide.ts`, plan 18-18) over the scene of `tests/sim/combat/collision-cost.test.ts`: 256 live ships and pods at fixed-seed positions in a 3 km cube around the Lave nav buoy, plus the player and both buoys (259 colliders). This is a wall-time measurement for information only and not a gate. The gate is the deterministic counter test, which pins the stage's `CollisionStats` for this scene.

| Scene                                         | Swept pairs | Narrow tests | Contacts | Median per call | 90th percentile | Recorded   |
| --------------------------------------------- | ----------- | ------------ | -------- | --------------- | --------------- | ---------- |
| 259 colliders, 3 km cube (seed 1894), Node 24 | 1,373       | 5            | 0        | 2.09 to 2.17 ms | 2.29 to 2.38 ms | 2026-11-20 |

The figure is the median over 1,000 calls after 200 warm-up calls, from a scratch script run in the `test` container (two runs). The sorted sweep on x looks at 1,373 of the 33,411 pairs an all-pairs loop would test, and only the 5 pairs whose bounding spheres overlap reach the octree test. Those 5 octree tests cost about 1.34 ms of the call by themselves (about 0.27 ms each); gathering, ranking and the sweep take the rest. Nothing collides in this scene, so no response or record is in the figure. At the fixed 1/120 s step the stage would take about a quarter of a tick at this load; a populated system holds far fewer than 256 entities.

## Load size

The first-load test in `tests/e2e/budget.spec.ts` records the same-origin response body bytes of every request from a cold start (a fresh browser context, no cache) to the first in-flight frame.

| Measure                                                                         | Value                      |
| ------------------------------------------------------------------------------- | -------------------------- |
| Cold-start transfer to the first in-flight frame                                | 8 835 212 bytes (8.43 MiB) |
| Cold-start transfer to the first in-flight frame, traffic on (production build) | 8 839 791 bytes (8.43 MiB) |
| Cold-start transfer, traffic off, browser-test bundle (2026-11-17, Phase 16)    | 8 866 124 bytes (8.46 MiB) |
| Cold-start transfer, traffic on, browser-test bundle (2026-11-17, Phase 16)     | 8 878 213 bytes (8.47 MiB) |
| Regression ceiling (`FIRST_LOAD_BYTES_CEILING`)                                 | 9 437 184 bytes (9 MiB)    |
| Entry chunk `dist/assets/index-*.js`, raw                                       | 1 615 497 bytes            |
| Entry chunk, gzip at level 9                                                    | 319 971 bytes              |
| Static hull chunk `dist/assets/ships-static-hulls-*.js`, raw (traffic on only)  | 205 628 bytes              |
| Static hull chunk, gzip at level 9                                              | 8 529 bytes                |
| STACK.md target for initial JavaScript                                          | 250 KB gzip                |

The transfer was measured on 2026-11-14 after Phase 10 added the navigation buoy entry with its mass to `ships-client.json` (15 244 to 19 518 bytes on disk); it was 8 834 862 bytes before that, measured the same day after Phase 9 added nine NPC ship models and their 43 texture files under `public/` (about 12 MB), none of which is requested on a cold start (asserted by the same test, which also logs every request path); it was 8 814 224 bytes on 2026-11-11. The entry chunk was measured on 2026-11-10. The transfer was 7 490 424 bytes on 2026-11-10; quick task 261111-g5n added the navigation buoy model and its six texture files (1 322 175 bytes on disk). It was 20 996 848 bytes (20.03 MiB) on 2026-11-08. Two quick tasks account for the difference: 261109-s8k trimmed the client ship catalogue from 706 617 to 15 196 bytes, and 261110-b7w re-encoded the sixteen ship and station textures from PNG (19 727 075 bytes) to WebP (6 251 016 bytes). The preview server does not compress responses, so these are uncompressed body sizes.

Since Phase 12 a production session has NPC traffic on and populates 12 inert ships at launch, but their models and textures (nine GLBs, 820 068 bytes; 43 textures, 11 528 725 bytes) are requested only after the first in-flight frame has been presented (plan 12-11; Key Decisions row "Defer NPC model requests until the first in-flight frame", owner decision 2026-11-14, option A), so the cold start adds only the NPC catalogue chunk and the Phase 12 code. `tests/e2e/budget.spec.ts` measures the cold start with traffic off (the browser-test bundle's default) and `tests/e2e/traffic.spec.ts` measures it with traffic on, in the browser-test bundle on every run and in the production bundle once. Both enforce the unchanged 9 437 184-byte ceiling, and raising it (option B) is revisited only on measured evidence. On 2026-11-14 the traffic-on transfer was 8 839 791 bytes in the browser-test bundle and 8 839 791 bytes in the production bundle (the two bundles differ only in the traffic default, which `?test=1&traffic=1` overrides), 4 579 bytes above the traffic-off figure; the same run requested 6 of the 9 GLBs and 26 of the 43 textures after the first in-flight frame (the models of the ship types present in that world), none before it, and every one finished within 600 loop frames.

On 2026-11-17 (Phase 16, plan 16-09, remote run at `178bdf5`) the traffic-on cold start was 8 878 213 bytes and the traffic-off one 8 866 124 bytes, both under the unchanged ceiling. With traffic on the boot now also fetches the debris catalogue chunk (`ships-debris-*.js`, 512 bytes on the wire) and the explosion catalogue chunk (`explosions-*.js`, 352 bytes); with traffic off neither is fetched. No debris model (seven GLBs), none of the six textures they reference and neither particle texture (`oolite-particle-cloud2.png`, `oolite-particle-flash.png`) is requested before the first in-flight frame, traffic off or on (`budget.spec.ts`, `traffic.spec.ts`); the combat spec shows them requested only after a kill.

On 2026-11-19 (Phase 18, plan 18-13, remote production build `npm run build` at `057be4c`) the boot with traffic on also fetches the static hull chunk (`ships-static-hulls-*.js`: the Coriolis station, buoy, barrel and alloy octrees with their subentities, DATA-15), 205 628 bytes raw and 8 529 bytes at gzip level 9; the preview server sends it uncompressed, so it adds about 205 KB to the traffic-on cold start (estimated 9 083 841 bytes against the 2026-11-17 figure, still under the ceiling; the same-day remote `traffic.spec.ts` run, which enforces the ceiling with traffic on, passed). A traffic-off session never fetches it. `budget.spec.ts` does not cover this chunk: its hull-chunk assertion names `ships-hulls-*.js` only, and Phase 18 edits no existing browser spec except the one D-06 sanctions. The traffic-off guard for the static chunk is therefore the unit boot-path scan in `tests/content/ships-static-hulls.test.ts` (one traffic-gated call from the session start-up, no importer under `src/sim`).

On 2026-11-26 (Phase 21, plan 21-08, remote run at `f88b64ce`, browser-test bundle) the 29-record roster measured a traffic-off cold start of 8 899 305 bytes (537 879 bytes below the ceiling) and a traffic-on one of 8 930 637 bytes (506 547 bytes below it), against 8 866 124 and 8 878 213 bytes on 2026-11-17. The compiled catalogue `ships-npc.json` grew from 12 701 to 52 028 bytes and the hull chunk `ships-hulls.json` from 89 673 to 162 546 bytes (19 entries for 30 keys through aliases); the traffic-on boot fetches both, which is the whole traffic-on increase. The 29 NPC GLBs total 3 030 300 bytes and the 116 NPC-owned texture files they reference 28 212 055 bytes (six more files are the player's Cobra maps, already part of the first load).

Plan 21-11 (D-07, 2026-11-26, remote run at `c83a3de5`) moves those NPC models off the first-flight path: with traffic on, the session downloads every catalogue GLB and the textures it references in the background, from the first docked frame, two requests at a time (`NPC_PREFETCH_CONCURRENCY`), so the hulls are ready before launch. The prefetch is outside the first-load ceiling. `traffic.spec.ts` asserts that no NPC asset is requested before that trigger (the first-load models and the hull chunk are all requested earlier) and measures the cold start to the first in-flight frame minus the bytes of the NPC asset set, identified by path. With traffic off the prefetch never starts: `budget.spec.ts` still sees no NPC model or texture requested, now also after the first in-flight frame.

| Measure (browser-test bundle, remote run, plan 21-11)                   | Value                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| Cold start to the first in-flight frame, traffic off                    | 8 899 758 bytes, 537 426 bytes below the ceiling    |
| Cold start to the first in-flight frame, traffic on, without prefetch   | 8 931 090 bytes, 506 094 bytes below the ceiling    |
| Prefetch, GLBs (29)                                                     | 3 030 300 bytes                                     |
| Prefetch, NPC-owned textures (116 files)                                | 28 212 055 bytes                                    |
| Prefetch, total (measured on the wire, 29 GLBs and 157 texture replies) | 31 242 355 bytes (29.8 MiB)                         |
| Prefetch duration, first NPC request to last NPC response               | 13.5 s at concurrency 2 (remote machine, localhost) |

The prefetch total is about 30 MB, as the research expected (flagged assumption, RESEARCH A11). Plan 21-08's shared-geometry list shows how much of it is duplicated variant geometry: the nine families whose GLBs share an identical geometry chunk repeat about 1.11 MB of GLB bytes (anaconda-pirate, boa-mk2-pirate, boa-pirate, two of the three Cobra Mk III variants, cobramk1-alt, mamba-escort, morayMED, python-blackdog and viper-pursuit), 3.6 % of the total; the other 96 % is texture data, which a shared GLB with texture-only variants would not reduce either, because the variants differ in their diffuse maps. The fallbacks, if the owner objects to 30 MB in the background, are a per-system prefetch (only the keys the current system's populator can spawn) and merged variant geometry (plans 21-17 and 21-18 make the geometry shared at draw time but not on the wire); neither is applied. The duration is a localhost figure from the remote test machine and says nothing about a player's connection.

Plan 21-17 (D-05 fix 1, 2026-11-26, remote run at `90c5f209`, browser-test bundle) merges the primitives of each NPC hull into one primitive with one material at build time, through a per-hull texture atlas with the authored per-material values baked in (`tools/oolite-ingest/convert/atlas.ts`). The 22 multi-primitive hulls merged and none was refused by a validity condition; the 7 single-primitive hulls are unchanged. The first-load models (the player's Cobra, the Coriolis, the buoy) are byte-identical, so the cold start moved by 2 106 bytes only (the remote run measures it again with every change since plan 21-11 in the build). The prefetch grew by 1.80 MB because the Cobra variants no longer reuse the six maps the player's Cobra already loads: their atlases are NPC-owned files of their own.

| Measure (browser-test bundle, remote run, plan 21-17)                    | Value                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Cold start to the first in-flight frame, traffic off                     | 8 901 864 bytes, 535 320 bytes below the ceiling     |
| Cold start to the first in-flight frame, traffic on, without prefetch    | 8 933 196 bytes, 503 988 bytes below the ceiling     |
| Prefetch, GLBs (29)                                                      | 3 002 444 bytes (3 030 300 before)                   |
| Prefetch, NPC-owned textures (91 files, 65 of them atlas images)         | 30 043 947 bytes (28 212 055 in 116 files before)    |
| Prefetch, total (measured on the wire, 29 GLBs and 127 texture replies)  | 33 046 391 bytes (31.5 MiB), 12.4 s at concurrency 2 |
| Texture memory, summed over the 29 records (w x h x 4 x 4/3 per texture) | 1 023.2 MiB (601.0 MiB before)                       |
| Texture memory, each texture file counted once                           | 712.2 MiB (458.2 MiB before)                         |

The texture memory grew because an atlas is square and holds the largest map of the hull next to the smaller maps of its subentities, and because every slot has the hull's layout: the roughness atlas holds two or three constants and the specular, normal and emissive atlases hold neutral fill beside the maps of the primitives that lack them. A hull of a 1 024-texel map and a 256-texel subentity map needs a 1 280-texel atlas per slot (the layout is a multiple of the smallest region, not a power of two), the Anaconda and the Pythons, whose subentity maps are 512 texels, need 1 536 (the largest atlas), and the Vipers 1 024. The file bytes barely moved because the neutral fill compresses to almost nothing. Plan 21-19 reads this figure with its GPU measurement; two reductions are open and neither is applied here, because each changes what the atlas holds: a roughness map of one texel per region read with nearest filtering, and a layout per slot.

The atlas gutter (code review TOOLS-WR-01, 2026-11-26, remote run at `8e21fef8`, browser-test bundle) supersedes the plan 21-17 layout above. Without a gutter, a fetch at mip level 1 or above read across a region's edge: into the neutral fill (white diffuse, fully rough), or, through the GLB's default REPEAT wrap, into another region. Oolite samples ship maps with CLAMP_TO_EDGE. Every region now keeps a 32-texel gutter holding its own edge mirrored, on a 32-texel grid, so the atlas samples exactly like the separate clamped maps up to mip level 5: a hull map out to about 2 to 8 km at Oolite's 57.2 degree field of view across 1 920 pixels, where the ship is about 15 to 50 pixels long. The free atlas area holds the nearest region's outermost gutter texel instead of a neutral fill. The layouts grew by two gutters per region: 1 536 to 1 664 texels per side (the Anaconda and the Pythons), 1 280 to 1 408 (Boa, Boa Mk II, Asp, Cobra Mk III, Ferdelance, Gecko, Moray), 1 152 to 1 280 (Mamba) and 1 024 to 1 152 (the Vipers). The GLB bytes are unchanged (only the UVs moved), and the draw calls and triangles are unchanged.

| Measure (browser-test bundle, remote run, TOOLS-WR-01 gutter)            | Value                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Full anarchy, worst case / after a kill                                  | 39 calls, 77 934 triangles / 42 calls, 78 598 (unchanged) |
| Cold start to the first in-flight frame, traffic off                     | 8 901 862 bytes, 535 322 bytes below the ceiling          |
| Cold start to the first in-flight frame, traffic on, without prefetch    | 8 933 194 bytes, 503 990 bytes below the ceiling          |
| Prefetch, GLBs (29)                                                      | 3 002 444 bytes (unchanged)                               |
| Prefetch, NPC-owned textures (91 files, 65 of them atlas images)         | 32 751 988 bytes (30 043 947 in plan 21-17, +9.0 %)       |
| Prefetch, total (measured on the wire, 29 GLBs and 127 texture replies)  | 35 754 432 bytes (34.1 MiB), 12.1 s at concurrency 2      |
| Texture memory, summed over the 29 records (w x h x 4 x 4/3 per texture) | 1 200.1 MiB (1 023.2 MiB in plan 21-17, +17.3 %)          |
| Texture memory, each texture file counted once                           | 828.3 MiB (712.2 MiB in plan 21-17, +16.3 %)              |

The prefetch grew by 2 708 041 bytes, the growth of the atlas files: the mirrored gutters and the edge-filled free area compress less well than the constant fill did. The first-load models are byte-identical, so the cold start is unchanged within 2 bytes and both ceilings hold. Past mip level 5, an edge that faces free space still blends only with its own content; an edge that faces another region's gutter, or the opposite atlas edge, can blend with that neighbour over less than one screen pixel of a ship a few dozen pixels long.

The ceiling is the measured transfer rounded up to the next MiB, so it is a regression ceiling and not a load budget. The entry chunk was measured inside the container with `node:zlib` `gzipSync`.

The entry chunk is over the STACK.md target of 250 KB gzip. That finding is recorded here and is not gated or fixed. It is outside QUAL-01's draw-call and triangle budget. About 700 KB of the raw chunk is the galaxy 0 data, which is imported eagerly; loading it like galaxies 1 to 7 would bring the chunk under the target but would not reduce what a player downloads before the first flight, so it was left as it is.

## Reference-desktop protocol

This protocol produces QUAL-01's only frame-rate evidence (D-10b). The container renders on SwiftShader, so a frame rate taken there is not evidence and must not be recorded as one. Run this protocol on the reference desktop, never in Docker.

### Setup

1. Start the production preview from this commit with `docker compose up preview` (Docker only; no host Node), then open http://localhost:4173.
2. Use current stable Chrome and current stable Firefox on the owner's desktop.
3. Set the window client area to 1920x1080, with OS scaling and browser zoom at 100 %.
4. Close every other tab. Open the console and confirm `window.devicePixelRatio` prints `1` before measuring.
5. Record the machine: GPU and driver version, CPU, RAM, OS and version, browser and exact version, and monitor refresh rate. Enter these in the Machine block below.

### Scenarios and sampler

Each row is sampled for 30 seconds. The row labels are exact.

| Row label          | How to reach it                    | Sampling                                                                                                                  |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Lave docked        | New game, the docked panel at Lave | Settle 5 s, then sample 30 s                                                                                              |
| Launch sequence    | Press the launch key (`Digit1`)    | Start the sampler with start delay 0 and press the launch key as it starts, so the animation falls inside the 30 s window |
| Lave in flight     | After launch, facing the planet    | Settle 5 s, then sample 30 s                                                                                              |
| Hyperspace arrival | In flight after a completed jump   | Settle 5 s, then sample 30 s                                                                                              |

The sampler measures the interval between animation frames. In the `Lave docked` row the session now draws nothing after the first frames, so that row shows the cost of the loop and the station screen, not of the scene; docked figures recorded before 2026-11-10 included a full scene draw per frame and are not comparable with later ones.

Paste this sampler into the console for each row. Set `START_DELAY_MS` to `5000` for the settled rows and to `0` for `Launch sequence`.

```javascript
(async () => {
  const START_DELAY_MS = 5000; // use 0 for the Launch sequence row
  const WINDOW_MS = 30000;
  const FLOOR_MS = 1000 / 24; // below 24 fps the fixed step runs slow (research Pitfall 2)
  await new Promise((resolve) => setTimeout(resolve, START_DELAY_MS));
  const intervals = [];
  await new Promise((resolve) => {
    let last;
    const started = performance.now();
    const tick = (now) => {
      if (last !== undefined) intervals.push(now - last);
      last = now;
      if (now - started < WINDOW_MS) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const sorted = intervals.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const pct = (p) =>
    sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))];
  const sharePercent = (limit) =>
    (100 * sorted.filter((ms) => ms > limit).length) / n;
  console.log(
    JSON.stringify({
      count: n,
      p50: pct(50),
      p95: pct(95),
      p99: pct(99),
      max: sorted[n - 1],
      shareAbove16_7Percent: sharePercent(16.7),
      shareAbove33_3Percent: sharePercent(33.3),
    }),
  );
  console.log(
    `simulation-rate note: share of frames slower than ${FLOOR_MS.toFixed(1)} ms (below 24 fps): ${sharePercent(FLOOR_MS).toFixed(2)} %`,
  );
})();
```

The percentiles are nearest-rank values from the sorted frame intervals. A mean is never recorded in place of them.

### Pass criterion

The criterion below is a proposal. The owner confirms it or replaces it at the Task 3 checkpoint, and the confirmed criterion is recorded with its date. Each scenario in each browser passes when:

- p95 is at or below 17.5 ms, and
- p99 is at or below 33.3 ms.

### Missed criterion (D-13)

If a scenario misses the criterion, measure further and record the result. Further measurement means repeating that scenario's 30 s sample twice, and recording one 10 s DevTools Performance capture with a note on whether the long frames are main-thread or GPU time. Antialiasing, the pixel ratio, the resolution and the planet shader are not changed without a new owner decision (D-12, D-13). A miss is answered by measurement, never by a change to the look.

### First load

Record the DevTools Network "Load" time of a cold start, with the cache disabled, on the reference desktop. The load-time budget is for the owner to state, and none is set here. Texture compression stays deferred unless that stated budget fails (D-14).

Cold-start Load time, cache disabled: not supplied by the owner, who skipped this measurement.

### Results

Status: manual reference-desktop run deferred by the owner on 2026-11-08 to a later phase; results recorded above are partial; QUAL-01 is not evidenced in this phase.

| Scenario           | Browser | Count | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Share above 16.7 ms | Share above 33.3 ms | Pass |
| ------------------ | ------- | ----- | -------- | -------- | -------- | -------- | ------------------- | ------------------- | ---- |
| Lave docked        | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 18.20    | 21.61 %             | 0 %                 | pass |
| Lave docked        | Firefox | 1800  | 16.66    | 16.68    | 16.68    | 16.68    | 0 %                 | 0 %                 | pass |
| Launch sequence    | Chrome  | 1795  | 16.70    | 16.80    | 16.80    | 66.50    | 40.11 %             | 0.11 %              | pass |
| Launch sequence    | Firefox | 1798  | 16.66    | 16.68    | 16.68    | 50.00    | 0.11 %              | 0.11 %              | pass |
| Lave in flight     | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 18.10    | 39.28 %             | 0 %                 | pass |
| Lave in flight     | Firefox | 1790  | 16.66    | 16.68    | 16.68    | 183.32   | 0.06 %              | 0.06 %              | pass |
| Hyperspace arrival | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 16.90    | 50.89 %             | 0 %                 | pass |
| Hyperspace arrival | Firefox | 1798  | 16.66    | 16.68    | 16.68    | 33.34    | 0.11 %              | 0.11 %              | pass |

The four Firefox rows are the owner's readings, taken in Firefox 159.0.1 at 100 % display scaling and `devicePixelRatio` 1, with the Launch sequence sampled at start delay 0. The Pass column is judged against the proposed criterion (p95 at or below 17.5 ms and p99 at or below 33.3 ms). The owner confirmed that criterion on 2026-11-08, so the Pass column is confirmed. The max column is recorded as given and is not part of the criterion.

The simulation-rate note (share of frames slower than 41.7 ms, that is below 24 fps) was 0.00 %, 0.06 %, 0.06 % and 0.00 % for Lave docked, Launch sequence, Lave in flight and Hyperspace arrival respectively.

The four Chrome rows are the owner's readings, taken in Chrome 157.0.8103.39 at 100 % display scaling and `devicePixelRatio` 1, with the Launch sequence sampled at start delay 0. The Chrome version is the one recorded in the owner's machine record in `07-CONTEXT.md`; it was not separately verified in this run. The Pass column is confirmed, as for Firefox, by the owner's criterion confirmation on 2026-11-08.

The simulation-rate shares (frames slower than 41.7 ms, below 24 fps) were 0.00 %, 0.11 %, 0.00 % and 0.00 % for Lave docked, Launch sequence, Lave in flight and Hyperspace arrival respectively.

Chrome's share of frames above 16.7 ms is 21 to 51 % while p50 is 16.70 ms and p95 is 16.80 ms. The proposed criterion does not gate on the 16.7 ms share, so those rows pass the criterion, but the owner should decide whether the 16.7 ms share is acceptable. Firefox's share above 16.7 ms is 0 to 0.11 %. The criterion has not been changed.

### Preliminary runs (not official)

Recorded 2026-11-07, 20:48 to 21:00, from the owner's session 9675446a. These readings are informational only. They were taken at display scaling 175 % (`devicePixelRatio` 1.7647058823529411), not at 100 % scaling with a 1920x1080 client area (DPR 1), so they do not fill the Results rows above and are not evidence for QUAL-01. The official 1920x1080 DPR 1 run is still pending.

Machine: the owner's reference desktop named in `.planning/phases/07-hardening-community-release/07-CONTEXT.md` (open item, line 67). CPU Intel Core i5-13400F 2.50 GHz; RAM 32 GB; GPU NVIDIA GeForce RTX 4060 8 GB, driver 32.0.16.1088; OS Windows 10 Pro 22H2; display 3840x2160 at 60 Hz; Chrome 157.0.8103.39 and Firefox 159.0.1. The owner's pastes do not record which browser each reading came from.

Labelled readings, with the owner's label as written:

| Owner label                                                                        | Count | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Over 16.7 ms | Over 33.3 ms |
| ---------------------------------------------------------------------------------- | ----- | -------- | -------- | -------- | -------- | ------------ | ------------ |
| "in the station menu, docked"                                                      | 1800  | 16.66    | 16.68    | 16.68    | 16.68    | 0.0%         | 0.0%         |
| "launch out of the station, facing the planet"                                     | 1797  | 16.66    | 16.68    | 16.68    | 33.34    | 0.2%         | 0.2%         |
| "lave in flight" (the owner notes it is not clearly different from the launch row) | 1800  | 16.66    | 16.68    | 16.68    | 16.68    | 0.0%         | 0.0%         |
| "arrival at leetsi after a jump"                                                   | 1799  | 16.66    | 16.68    | 16.68    | 33.32    | 0.1%         | 0.1%         |

Unlabelled readings, with timing uncertain. The owner wrote that it is unclear when the sampler script was started, so these readings may be inaccurate. They are not assigned to any scenario, and fields the paste did not include are marked as not recorded.

| Reading | Count | p50 (ms)     | p95 (ms) | p99 (ms)     | max (ms) | Over 16.7 ms | Over 33.3 ms |
| ------- | ----- | ------------ | -------- | ------------ | -------- | ------------ | ------------ |
| A       | 1800  | not recorded | 16.68    | not recorded | 16.68    | not recorded | not recorded |
| B       | 1774  | not recorded | 16.68    | not recorded | 450      | 0.1%         | 0.1%         |

These readings are not evaluated against the proposed pass criterion. The official run at 1920x1080 and DPR 1, per the protocol above, is still required.

### Machine

The owner's desktop, from the reference machine named in `07-CONTEXT.md` line 67. The values below are for the Firefox and Chrome runs. Display scaling was 100 % and `devicePixelRatio` 1, per the owner. The preview was served from Docker on an Intel N150 host over the LAN, as the owner confirmed for this setup. That location is not otherwise recorded.

- GPU and driver version: NVIDIA GeForce RTX 4060 8 GB, driver 32.0.16.1088
- CPU: Intel Core i5-13400F 2.50 GHz
- RAM: 32 GB
- OS and version: Windows 10 Pro 22H2, build 19045.6466
- Browser and exact version (Chrome): Chrome 157.0.8103.39 (recorded from the owner's machine record in `07-CONTEXT.md`; not separately verified in this run)
- Browser and exact version (Firefox): Firefox 159.0.1
- Monitor refresh rate: 60 Hz (display 3840x2160 at 60 Hz)
