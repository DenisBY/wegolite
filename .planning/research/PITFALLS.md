# Pitfalls Research

**Domain:** Browser-based faithful reimplementation of Oolite (Elite-style space trading), TypeScript + Three.js, static hosting
**Researched:** 2026-11-02
**Confidence:** HIGH for engine/data facts grounded in Oolite source and `LICENSE.md`; MEDIUM for legal interpretation, browser quirks, and community judgement

> Scope note: this file assumes the v1 scope in `.planning/PROJECT.md`: one Cobra Mk III, one Coriolis station per system, manual docking, core commodities, hyperspace, station screens, save/resume, no combat/NPCs/OXPs. Legal statements below are engineering-risk findings, not legal advice; a lawyer should review the final distribution.

## Critical Pitfalls

### Pitfall 1: Treating Oolite's code licence and asset licence as one licence

**What goes wrong:**
The repository ends up with a single `LICENSE` file, copied models/textures/plists, and no asset-specific notice. The project then either (a) claims everything is GPL-2.0-or-later when some assets are only CC BY-NC-SA 3.0, (b) claims everything is CC BY-NC-SA and accidentally imposes non-commercial terms on GPL code, or (c) ships a built site with no corresponding-source offer. Any of these makes distribution indefensible, and a community project is especially exposed because the first DMCA/takedown request kills momentum.

**Why it happens:**
Oolite's `LICENSE.md` is unusual. It says the work is GPL-2.0-or-later, and then says artwork (models, images, sounds) *and configuration files* are **also** licensed under CC BY-NC-SA 3.0, and that those files may be distributed under either licence at the distributor's discretion. Developers read the first paragraph, see "GPL", and stop. They also assume "assets are CC BY-NC-SA only", which is the opposite mistake: the dual licence is what lets a GPL project reuse the art at all, because CC BY-NC-SA 3.0 is not GPL-compatible.

There are additional wrinkles: the same file carves out some sounds under CC0 and CC BY 3.0 (military/mining/beam laser sounds), and bundled libraries under BSD/zlib-style licences. The blanket dual licence does not automatically relicense third-party contributions that were never Oolite's to dual-license.

**How to avoid:**
- Make an explicit licensing decision and write it down: **take Oolite code, data, models, textures and sounds under GPL-2.0-or-later**, and record the CC BY-NC-SA 3.0 option only as provenance. This avoids the non-commercial restriction and the GPL/CC incompatibility for the combined work.
- Put the following in the repo root: `LICENSE` (GPL-2.0 text), `LICENSE-ASSETS` (CC BY-NC-SA 3.0 text or canonical URI plus a plain-language summary), `NOTICE` (Oolite copyright and dual-licence statement), `AUTHORS`, `THIRD_PARTY_NOTICES` (sound exceptions and libraries), `TRADEMARKS.md` (see Pitfall 2), and `assets-manifest.json` with one row per imported file: Oolite source path, licence, modifications, and the preferred form for modification (`.dat`, `.plist`, original PNG).
- Keep raw source formats in the repo. If `.dat` is converted to glTF and PNGs to KTX2, the converted files are not the preferred form for modification; ship the `.dat`/PNG sources too, or provide a documented conversion script and the originals in a source archive.
- Publish the corresponding source for the deployed bundle: public repo link in the footer and `README`, plus build scripts. If the repo is private, a written offer is not enough for a frictionless fan project; make the source public.
- For the CC BY-NC-SA option, attribution needs the creator, title, source URI, licence URI and an indication of modifications; ShareAlike applies to modified assets. Put the same information in `NOTICE` and in each row of `assets-manifest.json`, and mark modified files as modified. If you choose the GPL option for assets, keep the CC notice as provenance but make the GPL election explicit.
- Audit dependencies for licence compatibility. GPL-2.0-**only** is incompatible with Apache-2.0; because Oolite is "or later", licensing Wegolite as `GPL-3.0-or-later` is a legitimate escape hatch if an Apache-2.0 runtime dependency appears. Three.js (MIT), Vite (MIT) and Vitest (MIT) are fine.
- Do not advertise, sell, or gate access behind payment/donations if any asset is taken under the CC BY-NC-SA option. The clean GPL route avoids this, but donation perks and "early access" can still look commercial; keep the project free.

**Warning signs:**
- GitHub's licence detector says "Unknown" or shows only one licence while `Resources/Models` and `Resources/Config` are committed.
- No `NOTICE`, no `assets-manifest.json`, or a manifest that lists only file names and no source/licence.
- A contributor asks "can I use this texture?" and the answer is a Slack guess.
- The built site has no source link, or the source link points at a repo that does not contain the plist/DAT sources.
- Anyone describes the project as "CC BY-NC-SA" in one place and "GPL" in another.

**Phase to address:**
Phase 1 (Foundation & Compliance), before the first asset is committed. Re-audit in Phase 8 before public release.

---

### Pitfall 2: Using "Elite", "Cobra" or "Oolite" as branding and implying endorsement

**What goes wrong:**
The project is published as "Wegolite — Elite in your browser", uses the Elite logo or a Cobra badge, and puts "Oolite" in the page title. Frontier Developments' published legal notices list **Elite, the Elite logo, Cobra and the Cobra logo** as trademarks. Oolite's GPL/CC licences grant copyright permissions, not trademark permissions, and they do not grant rights to Frontier's marks. A fan project can still be asked to rename or take down a site even if its copyright position is perfect.

**Why it happens:**
"Elite" is the fastest way to explain the genre, and search-engine optimisation rewards it. Fan projects also assume that because Oolite has existed for decades, the name is safe. Oolite's own community says there are no trademarks associated with Oolite, but that is a statement about Oolite, not about Frontier's marks or about a new project's name.

**How to avoid:**
- Keep the product name **Wegolite**; do not put "Elite" or "Oolite" in the domain, page title, logo, app icon, store listing, or social handle. Use descriptive text only: "a fan-made browser tribute to the 1984 space trading game", "inspired by Oolite".
- Add a prominent `TRADEMARKS.md` and a footer line: "Wegolite is an unofficial fan project. It is not affiliated with, endorsed by, or connected to the Oolite project, Frontier Developments plc, David Braben or Ian Bell. Elite and Cobra are trademarks of Frontier Developments plc. Oolite is a separate open-source project."
- Do not use the Oolite logo, the Elite logo, the Cobra logo, or Frontier/Oolite screenshots as marketing art. Screenshots of your own build are fine; screenshots of Oolite are not automatically fine.
- Treat ship names such as "Cobra Mk III" as franchise-derived names. They are probably low-risk in a non-commercial fan project with a disclaimer, but they are not licensed by Oolite's copyright licence; get a legal read before using them in a commercial-adjacent context (ads, merch, app-store listing).
- Do not imply that Oolite's developers endorse the port. A "thanks to the Oolite contributors" credit is attribution, not endorsement.

**Warning signs:**
- The browser tab reads "Elite" or "Oolite".
- The first Google result for the project is a page titled "Play Elite online".
- The repo uses an Oolite/Frontier logo in `public/` or `og-image.png`.
- A community post says "Is this official?" or "Did Frontier approve this?"
- The disclaimer is buried in `README` instead of visible on the landing page.

**Phase to address:**
Phase 1 (Foundation & Compliance), and again in Phase 8 before any public launch or store listing.

---

### Pitfall 3: Trusting `PROJECT.md`'s data file names and units instead of the current Oolite data

**What goes wrong:**
The implementation looks for `Resources/Config/commodities.plist`, which does not exist in current Oolite; the real file is `trade-goods.plist`. Or it treats every credit value as credits and displays food at 50.0 Cr instead of 5.0 Cr, equipment at 300 Cr instead of 30 Cr, and a Cobra at 150,000 Cr when the shipyard value is already credits. Or it treats `max_flight_speed = 350` as 350 m/s and prints "350 LS" instead of 0.350 LS. These are not cosmetic bugs; they break the economy and the fan credibility simultaneously.

**Why it happens:**
Oolite's data is a palimpsest. Names changed across versions (`commodities.plist` → `trade-goods.plist`), and units are mixed by subsystem:
- `trade-goods.plist`: `price_average`, `price_economic`, `price_random` are **decicredits** (tenths of a credit). Food's `price_average = 50` is 5.0 Cr.
- `equipment.plist`: prices are **decicredits**. A missile at 300 is 30.0 Cr; a large cargo bay at 4000 is 400.0 Cr.
- `shipyard.plist`: `price` is **credits**. A Cobra Mk III at 150000 is 150,000 Cr.
- `planetinfo.plist`: `radius` is **kilometres**, but `OOPlanetEntity` multiplies by 10 to get game units (`collision_radius = radius_km * 10.0`), a deliberate 1:100 scale-down.
- Fuel is stored in **tenths of a light year** (`fuel / 10.0` is displayed); hyperspace checks use `distance * 10.0 <= fuel`.
- Flight speeds are game units/second; Oolite 1.9x displays `0.001 * top_speed` as **LS** (so a Cobra's 350 is 0.350 LS). Older Elite/Oolite guides use **LM** for the same 1000-units/s convention. Pick one label, define it in the UI doc, and do not mix LS and LM in the same build.
- Pitch/roll rates are **radians/second**, not degrees/second.
`PROJECT.md` was written before the data audit and names `commodities.plist`; the current repo (1.93.1-241, commit 7437f22) has `trade-goods.plist`. The stale name is a warning that other assumptions are stale too.

**How to avoid:**
- Update `PROJECT.md`'s data inventory from `commodities.plist` to `trade-goods.plist` in Phase 1, and record the Oolite commit hash used for the snapshot.
- Build a **units and provenance table** in `docs/DATA-FIDELITY.md` before writing the economy code: file, key, unit, conversion, display format, source line. Treat it as a contract.
- Use integer decicredits internally for money, and format at the UI edge (`(decicredits / 10).toFixed(1)`). Never use floating-point credits for transactions.
- Normalise all imported values at the loader boundary into a single internal unit system: metres for lengths, radians/second for angular rates, units/second for speed, decicredits for money, tenths of LY for fuel. Name the fields with the unit (`priceDecicredits`, `speedUnitsPerSecond`, `radiusKm`).
- Add golden tests for known values: food price 5.0 Cr at a neutral economy; Cobra max speed 0.350 LS; Coriolis station radius 500 units; planet radius = `planetinfo.radius * 10`; fuel display `fuel/10`.
- Do not "fix" Oolite's compressed astronomical scale. Planet radii, planet distances and sun distances are internally consistent; converting to real kilometres destroys the look and the travel times.

**Warning signs:**
- Food sells for 50 Cr or equipment for 10× the expected price.
- The Cobra's speed readout is 350 LS, or its turn rate is 1 degree/s.
- The planet is either a tiny ball or engulfing the station.
- A grep for `commodities.plist` succeeds in the code but the file is absent from the vendored Oolite snapshot.
- New data keys get added with no unit suffix and no test.

**Phase to address:**
Phase 2 (Data Pipeline & Fidelity), with the unit contract written in Phase 1.

---

### Pitfall 4: Parsing Oolite's legacy plists as JSON/XML and ignoring inheritance

**What goes wrong:**
The loader calls `JSON.parse` or an XML plist parser on `shipdata.plist` and fails immediately, or a hand-rolled regex parser "works" on one file and silently drops comments, trailing commas, or unquoted keys. Even after parsing, the player Cobra is wrong because the entry is a template (`is_template = 1`) with a `like_ship` chain; the Coriolis market is empty because `market_definition = ()` was ignored; equipment appears that should be unavailable because `condition_script = "oolite-conditions.js"` was ignored.

**Why it happens:**
Oolite uses the OpenStep/NeXTSTEP ASCII property-list dialect, not JSON and not XML:
- `{ key = value; }`, `( a, b, c )`, `//` and `/* */` comments, unquoted keys, trailing commas, and `yes`/`no`/`true`/`1` booleans.
- Vectors are inconsistent: `position = "0 0 500.2561"` is a **string**, while `orientation = (1, 0, 0, 0)` is an **array**. A generic parser cannot know which is which without schema.
- `equipment.plist` is an array of positional arrays: `(tech_level, price, name, key, description, conditions)`. It is not a dictionary keyed by equipment ID.
- `shipdata.plist` uses `like_ship` inheritance, `is_template`, `shipdata-overrides.plist`, and `shiplibrary.plist`. The player Cobra is `oolite_template_cobra3-player`, which inherits `oolite_template_cobra3` (350 speed, 32 thrust), while the pirate/trader variants override speed to 300. Picking the first "cobra3" entry gives the wrong ship.
- The Coriolis station has `market_definition = ( )`, whose comment says an empty array matches system prices and leaving the key out means a blank market. Ignoring that distinction gives either an empty market or the wrong one.
- Equipment availability is partly scripted (`requires_non_full_fuel`, `requires_empty_pylon`, `available_to_all`, `condition_script`). A data-only port shows fuel when the tank is full and missiles when pylons are occupied.

**How to avoid:**
- Write or vendor a real OpenStep plist parser, and fuzz it against every file in `Resources/Config/`. Add fixtures for comments, trailing commas, quoted keys with spaces, negative numbers, nested arrays/dicts, and `yes`/`no`.
- Parse once at build time into a typed JSON intermediate, not at runtime on every load. Keep the raw plists in the repo for provenance and regeneration.
- Validate the intermediate with a schema (zod/valibot/manual) and fail the build on unknown/missing required keys. Do not use `any`.
- Implement `like_ship` resolution with cycle detection and overlay order: base → template → variant → `shipdata-overrides.plist`. Resolve the player Cobra explicitly and assert speed 350, thrust 32, pitch 1.0, roll 2.0, cargo 20.
- Model `market_definition` as a tri-state: absent (blank market), empty array (system prices), explicit definitions. Do the same for `equipment.plist` conditions: implement the small set actually used by core equipment, or hide items whose conditions you cannot evaluate.
- Parse the `planetinfo.plist` keys as two-integer `galaxy system` IDs (for example, `"0 7"` is galaxy 0, system 7, which is Lave), with `coordinates` as a separate chart position. Do not assume the key is the chart coordinate; system `"0 0"` is at chart coordinates `"2 90"`. Skip `"universal"` and `"interstellar space"` when iterating systems.
- Keep a `data/oolite-snapshot.json` with the upstream commit hash, so a future Oolite update can be diffed deliberately.

**Warning signs:**
- `JSON.parse` appears anywhere near `.plist`.
- The parser has a regex for `key = value` and no tests for comments/arrays.
- The Coriolis market is empty, or every station has identical stock.
- The player Cobra has 300 speed instead of 350, or no model.
- Equipment list shows fuel at full tank, or missiles with full pylons.
- System names and chart positions are shifted by one or scrambled.

**Phase to address:**
Phase 2 (Data Pipeline & Fidelity). The parser and schema are prerequisites for Phase 6 (Economy) and Phase 7 (Hyperspace).

---

### Pitfall 5: Importing `.dat` models and Oolite materials as if they were glTF

**What goes wrong:**
The Cobra is invisible (wrong winding/backface culling), flies backwards (wrong forward axis), has a one-colour hull (UVs interpreted as normalised when they are texel units), looks smooth/plastic instead of faceted (recomputed vertex normals), or the Coriolis station glows all over (alpha emission map treated as transparency). The station's docking tunnel is a black void because the dock/faceplate/tris subentities were skipped. The model may also be the wrong Cobra variant.

**Why it happens:**
Oolite's legacy `.dat` format is not a standard mesh format, and the engine does non-obvious things with it:
- **UVs are in texel units divided by the declared texture size.** Each `TEXTURES` line is `filename max_x max_y u1 v1 u2 v2 u3 v3`. The Cobra declares `1.0 1.0` (already normalised), while the Coriolis declares `256 256` and uses values 0–256. Dividing by `max_x/max_y` is mandatory. If you treat the values as normalised, the Coriolis samples a tiny corner of its atlas.
- **The first three integers on a `FACES` line are colours, not a texture index.** Oolite stores the first as `smoothGroup`; `127,127,127` is the common untextured value. Treating them as a material index produces nonsense.
- **Faces with more than three vertices are truncated to the first three** (`OOMesh.m` logs a warning and drops the rest). If you support quads, you diverge from Oolite's silhouette.
- **Normals are per-face, not per-vertex.** `smooth` defaults to `NO`; the Cobra's faceted look depends on that. Recomputing vertex normals with `computeVertexNormals()` smooths the hull and destroys the style. If `smooth = yes`, Oolite averages within the `smoothGroup`; implement that separately.
- **Oolite is +Z-forward, Y-up, and its models assume that convention.** Three.js cameras look down **−Z**; `Object3D.lookAt` points a mesh's +Z at the target but a camera's −Z. Attaching a `PerspectiveCamera` as a child of the ship without a 180° yaw makes it look out of the tail. Importing vertices without a defined axis conversion can also mirror the model and invert winding.
- **Oolite's material system can use a texture's alpha channel as an emission mask.** In `shipdata.plist`, `emission_map = { name = "oolite_coriolis_diffuse.png"; extract_channel = "a"; }`; for the Coriolis, the alpha channel is not transparency. Three.js `emissiveMap` uses RGB and ignores alpha, so assigning the diffuse map as `emissiveMap` makes the whole hull glow.
- **The station is a composite.** `oolite_coriolis.dat` is the hull; `oolite_coriolis_faceplate`, `oolite_coriolis_tris` and `oolite_coriolis_dock` are subentities at the same origin (dock at `z = 500.2561`). Skipping subentities removes the letterbox and tunnel.
- **The base template uses `oolite_cobra3.dat`, not `cobra3_redux.dat`.** Both exist. The `cobra3_redux` file is a legacy/alternate model; using it changes the silhouette and texture layout.

**How to avoid:**
- Write a dedicated DAT importer with an explicit conversion contract: source axes → Three.js axes, winding flip, UV divide by declared size, V flip (test with an asymmetric texture), per-face normals, material grouping, and a `flipY` decision documented in code.
- Keep faces as triangles (or explicitly document quad support as a divergence) and preserve the `smoothGroup` value. Provide two normal modes: per-face (default) and Oolite-style smooth-group averaging.
- Build a test model with a known orientation: the Coriolis letterbox and the Cobra's asymmetric nose/gun. If the letterbox is on the wrong face or the ship flies tail-first, the transform is wrong. Do not validate with a symmetric asteroid.
- Implement Oolite material conversion explicitly: diffuse (`map`), normal (`normalMap`, linear colour space), specular/gloss (`MeshPhongMaterial` or a calibrated PBR conversion), and alpha-emission via `onBeforeCompile` or a preprocessed emissive texture. Do not use `transparent: true` for the alpha emission. Oolite's `gloss`, `shininess` and `specular_color` are fixed-function Phong parameters; mapping them directly to PBR `roughness`/`metalness` usually produces plastic or dull hulls. Start with `MeshPhongMaterial` if fidelity matters more than modern PBR, or calibrate the conversion against reference screenshots.
- Load subentities from `shipdata.plist` and attach them in local space. For the station, render hull + faceplate + tris + dock, and keep the dock's local `z` offset.
- Pick the model by resolving `like_ship` and the player template, then assert the expected bounding box (`~130 × 35 × 81` for `oolite_cobra3.dat`; the legacy `cobra3_redux.dat` is `130 × 30 × 65`, and the Coriolis hull is `1000 × 1000 × ~996`). A bbox assertion catches the wrong variant immediately.
- Set `side: THREE.FrontSide` only after verifying winding; use `DoubleSide` selectively for the dock tunnel if its interior faces are single-sided.

**Warning signs:**
- The ship is invisible from outside but visible from inside, or vice versa.
- The Cobra flies tail-first, or the station's letterbox is on the back.
- The Coriolis texture looks like a solid colour or a 1-pixel sample.
- The hull looks smooth and rounded instead of faceted.
- The station glows uniformly, or the letterbox is a black hole.
- The model's bounding box is not within a few percent of the expected Oolite dimensions.
- `smooth` is absent from the loader's data model.

**Phase to address:**
Phase 2 (Data Pipeline & Fidelity) for the importer, Phase 4 (World Rendering & Scale) for axis/material validation. Do not defer the orientation test to Phase 5; docking depends on the dock being on +Z.

---

### Pitfall 6: Rendering an Oolite-sized system with one float32 camera and one depth range

**What goes wrong:**
The station jitters or z-fights when the camera moves, the planet flickers through the station, the docking slot shimmers, and distant objects pop. On a 4K/Retina display the problem is worse. The team "fixes" it with `logarithmicDepthBuffer`, which helps depth but not vertex jitter, or with a larger near plane, which clips the cockpit. The result is a port that looks unstable at exactly the moment the player is trying to line up a docking slot.

**Why it happens:**
Oolite's system is large in game units: planet `collision_radius` is `radius_km * 10` (e.g. 46,100 units), planet distance is ~500,000 units, sun distance can exceed 1,300,000 units, and the scanner range is 25,600 units. Oolite uses `HPVector` (double precision) for positions precisely because of this. WebGL/Three.js vertex data and matrices reach the GPU as float32, which has ~7 significant decimal digits: at 1,000,000 units the spacing is ~0.06 units; at 10,000,000 it is ~1 unit. A single camera with `near = 1`, `far = 2,000,000` gives a depth ratio of 2,000,000:1, far beyond a 24-bit depth buffer's ability to separate the station hull, faceplate, and dock subentities at ~500 units.

Three.js does multiply `modelViewMatrix` on the CPU in JS float64, so rigid objects can survive better than raw WebGL; but the GPU still sees float32 matrix entries, and any custom shader that computes absolute world positions, any `InstancedMesh` with large translations, and any world-space effect will lose precision. Depth precision is independent and will still z-fight.

**How to avoid:**
- Keep simulation positions in JS `number` (float64) and define a **camera-relative rendering** boundary: subtract the camera origin in double precision before building render transforms; keep the camera at the origin for rendering. This is the floating-origin pattern.
- Do not put absolute system coordinates into `InstancedMesh` instance matrices or custom shader uniforms. If you need instancing, store camera-relative offsets.
- Use a **two-pass depth strategy**: a local pass for the ship/station (near ~0.5, far ~20,000) and a distant pass for planet/sun/skybox (far ~2,000,000), with depth cleared between passes or a logarithmic/reversed depth buffer. If using `logarithmicDepthBuffer`, test it with all materials; it can disable early-Z and interact badly with some shaders.
- Prefer `reversedDepthBuffer` where `EXT_clip_control` is available; Three.js exposes it, but it is not universal. Always have a fallback.
- Give coplanar station layers (`hull`, `faceplate`, `tris`, `dock`) explicit `polygonOffset` or render order; the dock sits only 0.2561 units outside the hull, which is below comfortable depth precision at 500 units.
- Test at the real scale: put the camera at the station, the planet at 500,000, and the sun at 1,300,000, then move and rotate. Add a debug overlay for camera position, depth range, and float32 ULP. Test at 1080p and 4K/Retina.
- Do not "fix" the scale by making the planet real-sized. Oolite's 1:100 planet compression is intentional; changing it breaks the visual and travel-time design.
- Do not give the planet a generic Earth texture or a flat colour. Oolite generates its surface from `planetinfo.plist` parameters (`land_color`, `sea_color`, `cloud_color`, `polar_color`, `land_fraction`, etc.) plus noise. Either port that generator or bake per-system textures from those parameters; a generic blue marble is an obvious "not Oolite" signal even when the flight model is right.

**Warning signs:**
- The station edge crawls or sparkles when the camera moves even slightly.
- The planet appears in front of the station at some angles.
- The docking slot has a moiré/zipper pattern.
- Objects snap in a grid pattern as you fly away from the origin.
- The problem disappears when you move the world so the station is at (0,0,0), which confirms an origin-precision issue.
- A custom shader uses `modelMatrix`/`worldPosition` and looks fine near the origin but breaks at 500,000 units.

**Phase to address:**
Phase 4 (World Rendering & Scale), with the coordinate contract established in Phase 1 and exercised in Phase 5 (Docking) and Phase 7 (Hyperspace).

---

### Pitfall 7: Implementing "realistic" Newtonian flight instead of Oolite's kinematic flight-assist model

**What goes wrong:**
The ship drifts sideways when the player turns, keeps translating after the nose has rotated, and feels like an asteroid with a thruster. Or the opposite: the ship snaps to maximum turn rate instantly, stops instantly when the key is released, and feels like a first-person shooter. Either way, Oolite players say "this doesn't fly like Oolite" within ten seconds, which is the single fastest way to lose the audience.

**Why it happens:**
Oolite is explicitly non-Newtonian: the wiki describes it as an "aeroplane in space" with a flight computer masking the underlying physics; real Newtonian behaviour appears mainly in collisions and debris. The implementation is a kinematic model, not a force model:
- `flightSpeed` is a scalar. Thrust changes it at `SHIP_THRUST_FACTOR (5.0) * thrust` units/s². The Cobra's `thrust = 32` therefore gives 160 units/s² and takes ~2.2 s to reach 350 units/s.
- Position advances along the ship's **+Z** forward vector by `flightSpeed * dt` (`moveForward:`). There is no persistent lateral velocity from turning; residual `velocity` exists mainly for collisions and special cases.
- Pitch/roll are **angular rates** in radians/second. Keyboard input ramps the rate at `2 * max_flight_*` per second, so full roll takes ~0.5 s; when the key is released, the rate damps at 1.0 rad/s². `Ctrl` multiplies the input by 0.5 for precision.
- Orientation is composed as roll about local Z, then pitch about local X (and yaw about local Y in modern Oolite). The order matters; applying pitch then roll feels different at extreme attitudes.
- Oolite clamps a game tick to 0.25 s to survive pauses. A browser tab can be throttled for minutes; without a clamp, the ship tunnels through the station on return.

A developer who "knows physics" writes `velocity += forward * thrust * dt; position += velocity * dt`, which is the intuitive model and the wrong one. A developer who "knows arcade games" writes `angularVelocity = input * maxRate`, which is also wrong because Oolite has a ramp and damping.

**How to avoid:**
- Implement the Oolite model explicitly and name it: `flightSpeed` scalar, `thrustAcceleration = 5.0 * thrust`, `position += forward * flightSpeed * dt`, `angularRate` with `2 * maxRate` ramp and `1.0 rad/s²` damping.
- Keep a separate `collisionVelocity` vector for collision impulses and special effects; do not let it contaminate normal flight.
- Use a fixed simulation timestep (e.g. 60 Hz) with an accumulator, and interpolate render transforms. Clamp the frame delta to 0.1–0.25 s. Never integrate with raw `requestAnimationFrame` deltas.
- Apply roll and pitch in the same order as Oolite; use local-axis quaternion rotations, not world-axis Euler angles. Normalise the quaternion each step.
- Expose the constants from data, not code: `max_flight_speed`, `max_flight_pitch`, `max_flight_roll`, `thrust` come from `shipdata.plist`. Add a debug HUD showing `flightSpeed` (units/s and LS), pitch/roll rate (rad/s and deg/s), and acceleration.
- Measure input-to-photon latency. Keep the render loop lean, avoid DOM layout/text updates in the same frame as input, and prefer pointer-lock relative movement with a self-centring virtual stick. A 2-frame delay is fine for a trade game; a 150 ms delay makes docking feel unresponsive even with the right physics.
- Add a "flight feel" test harness: scripted key sequences (full roll 1 s, release; full pitch 0.5 s; accelerate 5 s) with expected rate/time curves. Compare side-by-side with Oolite recordings.
- Treat the "no yaw" decision as a deliberate divergence from **modern Oolite** (yaw was added in v1.66), not as "faithful to Oolite". Either add an optional yaw binding later or state the choice explicitly in the README and options screen.

**Warning signs:**
- Turning the ship changes the direction of travel only gradually (drift), or not at all.
- The ship reaches max turn rate in one frame, or keeps spinning after key release.
- At 144 Hz the ship moves ~2.4× faster than at 60 Hz; at 30 Hz it turns slower.
- `Ctrl`/precision does nothing, or the mouse snaps the nose to the cursor.
- The Cobra's top speed reads 350 LS or takes 10+ seconds to reach.
- A player says "it feels like Asteroids, not Elite".

**Phase to address:**
Phase 3 (Flight & Input), with the constants and units contract from Phase 2. Do not tune feel in Phase 5; docking depends on predictable low-speed control.

---

### Pitfall 8: Making docking either a trigger sphere or a strict mesh collision

**What goes wrong:**
Two opposite failures:
- **Too easy:** a sphere/box trigger in front of the station docks the ship from any angle, at any speed, without matching the station's roll. The player never learns the skill, and the docking computer is pointless.
- **Too hard:** the port is treated as a solid mesh with exact collision. The Cobra is 130 m wide and ~35 m high; the Coriolis slot is 192 × 64 m (long axis 192 m), and the station is rotating at 0.08 rad/s. Tiny float/geometry errors, a 1 m/s misalignment, or a frame-rate spike cause a scrape or death. Players bounce off endlessly and refund the game.

Oolite is neither. It uses an invisible docking corridor with deliberate forgiveness: collision is relaxed inside the corridor, the ship is auto-centred when its nose is inside, contact scrapes and damages, crossing opposite edges is fatal, and docking triggers only when ~90% of the ship's bounding box is past the port plane. This is why manual docking is famously hard but learnable.

**Why it happens:**
Developers see the visible letterbox model and assume docking is mesh collision. Or they see "docking trigger" in a wiki article and implement a simple distance check. The actual logic is in `DockEntity.m`: port dimensions come from the dock subentity's **bounding box**, not the visible slit. For `oolite_coriolis_dock.dat` the bbox is roughly 103 × 242 × 250, while the visible opening is about 192 × 64; the invisible corridor is therefore larger than the hole you see. Oolite then applies a 50% safety envelope (`safety = 1.5`), x/y auto-centring proportional to penetration, scrape damage at `5 * dt * flightSpeed`, and a `0.90 * max.z + 0.10 * min.z < 0` threshold to pull the ship in. The station's dock is a subentity at `z = 500.2561`, not at the station centre, and the station spins about its local **Z** axis (`station_roll = 0.08` rad/s for the Coriolis; default 0.4). If you rotate the station about Y instead, the slot sweeps around and docking becomes impossible.

**How to avoid:**
- Model the dock as a **corridor**, not a point: a local +Z axis, a cross-section derived from the dock subentity's bounding box (not the visible slit), a depth of 250 m, and a capture plane at the back. Put the trigger at the dock subentity's local position (`z ≈ 500.2561`), not the station origin. If you want the visible slit to be the collision box, you are making docking harder than Oolite.
- Implement Oolite's forgiveness: 1.5× safety envelope, auto-centre x/y when the nose is inside, scrape damage scaled by speed, fatal only when the ship crosses opposite edges. Capture when ~90% of the ship is past the plane.
- Spin the station about local **Z** so the slot rotates in place. Match the player's roll to the station's roll; show an alignment/roll indicator, not just a crosshair.
- Tune approach speed: Oolite's docking tutorial flags "too fast", and scrape damage scales with speed; a practical target is <0.1 LS (100 units/s), roughly one-third throttle. Add a "too fast" warning and a scrape/damage cue.
- Make the docking computer fly the same corridor with the same constraints, not teleport. Oolite's standard docking computer engages an autopilot; fast docking (Shift-C) is an explicit convenience that costs 20 minutes of ship clock and can incur a fine. Do not make fast docking free.
- Docking clearance is **off by default** in Oolite (`stations_require_docking_clearance = no` in `planetinfo.plist`). If you implement it, make it optional and faithful: target station, request, timeout, fine; do not make v1 players request clearance before they can dock.
- Add a docking test harness with scripted approaches: perfect, 10° off, 1 m/s too fast, rolled 90° out of alignment with the slot's long axis, station at 0.08 rad/s. Assert dock/scrape/death outcomes. Validate the required roll against the actual dock model's local axes, not a guess from a screenshot; `DockEntity` has a `portUpVectorForShipsBoundingBox:` twist rule for ports whose long axis differs from the ship's.

**Warning signs:**
- The player can dock from behind, upside down, or at full speed.
- The player cannot dock even when visually centred; the slot looks like a wall.
- The station rotates but the slot does not, or the slot moves around the station.
- The docking computer docks instantly from 20 km away.
- No scrape/damage feedback; docking is binary.
- The station's dock trigger is at (0,0,0) while the visible slot is at z=500.

**Phase to address:**
Phase 5 (Docking & Launch), with the station geometry and +Z axis validated in Phase 4. The docking computer is also the first `AIController` test for the v2 combat architecture.

---

### Pitfall 9: Building a player-only game and calling the combat-shaped hole "v2"

**What goes wrong:**
v1 ships with a `Player` class that owns the camera, input, physics, collision, market and UI. Adding combat in v2 requires an `Enemy` that can move, shoot, take damage, target, and be targeted; none of that exists. The team either rewrites the core (months) or bolts on a parallel enemy system that duplicates physics and collision (permanent divergence). The same hole appears earlier for the docking computer, the navigation buoy, and the station: anything that is not the player is a special case.

**Why it happens:**
"Just the core loop" feels like it needs only one ship. The shortest path is a monolithic `Player` with `if (isPlayer)` branches. Combat is declared out of scope, so entity/AI/weapon interfaces are deferred. But the *architecture* still has to be shaped for them, because combat is not a separate screen; it is the same entity/physics/collision loop with more actors. Oolite itself is built around `Entity`/`ShipEntity`/`StationEntity`/`PlayerEntity`, and its docking computer is an AI flying the same ship. A player-only port cannot reuse any of that.

**How to avoid:**
- Define a thin entity model in Phase 1/2 even if it has one instance: `Entity` (position float64, orientation quaternion, velocity, collision radius, mass, energy, status, subentities), `Ship` (flightSpeed, max rates, thrust, weapons/mounts, target, controller), `Station` (docks, market, rotation), `PlayerShip` (input + save state). Keep it small; do not build a full ECS.
- Separate **simulation** from **rendering** from **input**. The simulation must be runnable headlessly in Vitest: spawn a ship, step 10 seconds, assert position/orientation. If it needs a DOM/WebGL to run, the boundary is wrong.
- Make the controller an interface: `ShipController` with `PlayerController`, `AIController`, `DockingController`. Implement the docking computer as a `DockingController` flying the same `Ship`; this proves the interface before combat exists.
- Parse the combat-shaped data now even if unused: `weapon_position_forward`, `weapon_facings`, `max_missiles`, `missiles`, `max_energy`, `energy_recharge_rate`, `has_ecm`, `has_scoop`. It costs nothing and avoids a data-model migration.
- Implement sphere-sphere broadphase and a narrowphase hook from day one. v1 only needs station collision and docking scrape, but the same `collide(a, b)` path must accept two ships later.
- Define failure states now: station collision damage, hull/energy depletion, fuel exhaustion/stranding, save corruption. A v1 with no combat still needs a death/insurance/restart path, or ramming the station is a no-op and the world feels fake.
- Keep a `v2-backlog.md` and a hard v1 scope lock. Every "just one more" feature (shipyard, missions, legal status, passengers, mining, fuel scoops, escape pod, galactic hyperdrive, sound, key remapping, gamepad, mobile) goes there with a reason.

**Warning signs:**
- One `Game`/`Player` file exceeds ~1,000 lines and contains rendering, input, physics, economy and UI.
- `if (isPlayer)` appears in collision, market or AI code.
- Adding a navigation buoy or asteroid requires touching five files.
- The docking computer is a `teleportToStation()` special case.
- Save/load serialises Three.js objects or the whole `Player` instance.
- The v1 backlog grows every week with "small" features.

**Phase to address:**
Phase 1 (Foundation & Compliance) for the module boundaries, Phase 3 (Flight & Input) for the controller interface, Phase 5 (Docking) for the first non-player controller, Phase 7 for the failure states.

---

### Pitfall 10: Saving only credits and cargo, then regenerating the market on load

**What goes wrong:**
The player buys low, saves, reloads, and the market has re-rolled to a better price. Or the player sells, saves, reloads, and the stock is restored. Or the save stores prices but not the RNG seed, so every reload changes quantities and the "same" system feels different. Worse, the save is a JSON blob of the live `Player` object with circular references; a schema change breaks every existing save.

**Why it happens:**
The visible state is credits, cargo, fuel and location. Market state looks derivable from the system seed, so it is tempting to regenerate on load. But Oolite saves `localMarket` and `station_markets` explicitly, and its prices use a seeded RNG (`randf()` from the Ranrot generator), not `Math.random()`. If you regenerate with the browser's RNG, prices are not reproducible; if you regenerate with a different call order, even a seeded RNG gives different values. Regenerating also enables the save/reload arbitrage exploit.

**How to avoid:**
- Save a versioned, plain DTO, never live objects: `{ schemaVersion, commander, creditsDecicredits, fuelTenths, galaxy, systemId, dockedStationId, shipKey, equipment, cargo, market: { prices, quantities }, rngState, gameTime }`.
- Persist the market prices and quantities for stations the player has visited/docked at. Persist the RNG state (or a deterministic seed plus call-order discipline) for future generation.
- Use a seedable PRNG ported from Oolite's Ranrot if exact reproducibility matters; otherwise use a documented seeded PRNG and accept divergence. Do not mix `Math.random()` into economy generation.
- Store saves in IndexedDB (quota-managed, structured clone, larger than 5 MiB), with a schema version and migration function. Offer JSON export/import as a file so a browser cache clear does not destroy a commander.
- Handle `QuotaExceededError`, private-mode storage failures, and eviction. Show a clear "your progress is stored in this browser; export a backup" message.
- Write load/save round-trip tests: save at a station, reload, assert credits/cargo/fuel/market/prices/quantities/location are identical; save mid-flight, reload, assert position/orientation/velocity.

**Warning signs:**
- Reloading changes prices or stock.
- Buying and selling at the same station can be exploited by save/reload.
- The save file contains Three.js objects, `Vector3`, `Quaternion`, or circular references.
- Changing a field name breaks old saves with no migration.
- `localStorage.setItem` is the only persistence call; no quota/error handling.
- Safari private mode silently fails to save.

**Phase to address:**
Phase 6 (Economy, Screens & Save), with the DTO/schema defined in Phase 1 and the RNG decision in Phase 2.

---

### Pitfall 11: Assuming the browser behaves like a desktop game runtime

**What goes wrong:**
Sound is silent because the `AudioContext` was created before a user gesture. The ship keeps turning after the player alt-tabs because `keyup` was lost. The player returns to a dead ship because the simulation ran for five minutes in a throttled tab. The canvas goes black after a GPU switch because `webglcontextlost` was unhandled. Safari renders at half the frame rate or fails on a texture format. The game works on the developer's M1 Chrome and is broken for a meaningful share of the audience.

**Why it happens:**
Browser platform rules are not game-engine rules:
- **Audio autoplay:** Web Audio and audible media are blocked until a user gesture/transient activation; an `AudioContext` created at load starts suspended. Creating it is not enough.
- **Pointer lock/fullscreen:** both require a user gesture; pointer lock exits on Esc; the browser may not deliver `keyup` after focus loss. If you don't clear input state on `blur`/`visibilitychange`/`pointerlockchange`, the ship spins forever.
- **Tab throttling:** `requestAnimationFrame` stops or is heavily throttled in background tabs; timers are clamped; `performance.now()` jumps. A raw delta can be minutes.
- **Context loss:** WebGL contexts can be lost on GPU reset, driver update, tab discard, or macOS GPU switching. Without `webglcontextlost`/`webglcontextrestored` handlers, the game is a black canvas.
- **Safari/WebKit:** WebGL2 is supported in Safari 15+ (2021); older Safari is WebGL1 only. Compression extensions, float texture support, canvas size/DPR limits, fullscreen behaviour and performance differ from Chrome/Firefox. Safari private mode can make storage throw. Lockdown Mode can disable WebGL.
- **Static hosting:** `.dat`, `.plist`, `.ktx2` and `.wasm` need correct MIME types; a mis-served `.wasm` breaks streaming; a mis-served `.plist` may download instead of fetch.

**How to avoid:**
- Create/resume the `AudioContext` from the "Start" / "Launch" button; resume it after visibility/fullscreen/pointer-lock transitions; show a mute/volume control. Test with the tab backgrounded and restored.
- On `blur`, `visibilitychange`, `pointerlockchange`, and `fullscreenchange`, clear all held keys/buttons and pause the simulation. On resume, require a click/keypress and show "click to resume".
- Clamp `dt` and/or pause on `document.hidden`; use a fixed timestep with a max catch-up. Never simulate a multi-minute gap in one step.
- Handle `webglcontextlost` (preventDefault, stop the loop, show a message) and `webglcontextrestored` (recreate renderer resources, reload textures/geometry). Test with `WEBGL_lose_context.loseContext()`.
- Cap `devicePixelRatio` at 2 (or expose a quality setting); test at 1080p, 1440p and Retina. Do not assume `powerPreference: "high-performance"` is honoured.
- Use cross-browser texture compression (KTX2/Basis transcoding) rather than a single GPU family's format. Test Safari, Chrome and Firefox early, not at the end.
- Serve `.wasm` as `application/wasm`, `.ktx2` as `image/ktx2`, `.json` as `application/json`; prefer JSON intermediates over runtime plist parsing so MIME mistakes cannot break the game.
- Add a WebGL2 capability check with a human-readable error page; don't leave a blank canvas.

**Warning signs:**
- No sound until the second click, or sound stops after a tab switch.
- The ship is spinning when the player returns to the tab.
- The player dies while the tab is in the background.
- A black canvas after a GPU/driver event, with no error in the console.
- Works in Chrome, broken in Safari; works on a desktop GPU, broken on integrated.
- 404/MIME errors for `.dat`/`.wasm` in the network panel.
- Input test: press a key, alt-tab, release, return; the key is still "down".

**Phase to address:**
Phase 1 for the platform checklist, Phase 6 for save/audio, Phase 8 (Hardening & Community Release) for the cross-browser matrix. Do not leave Safari to the last week.

---

### Pitfall 12: Shipping a technically correct port that Oolite fans dismiss on first contact

**What goes wrong:**
The flight model is close, the data is right, but the first feedback is "where's the sound?", "why can't I yaw?", "food costs 50 credits", "the station is empty", "this is a tech demo, not Oolite". The project is judged in the first 60 seconds by people who have played Oolite for years, and the things they notice are not the things the team spent time on.

**Why it happens:**
Oolite fans have strong, specific expectations:
- **Flight feel** is the first test: pitch/roll rates, speed, inertia, and the absence of yaw (modern Oolite has yaw since v1.66, so "no yaw" is a divergence from Oolite, not a faithful copy).
- **The Cobra and Coriolis** are iconic; a wrong silhouette, texture, or station letterbox is immediately visible.
- **Docking** is a shared skill and a shared joke; if it is trivial or impossible, the community notices.
- **Sound** is part of the identity: the docking music, laser sounds, station ambience. v1 defers sound, but silence reads as "unfinished".
- **The market numbers** are memorised by traders; a wrong decicredit conversion is an instant credibility loss.
- **OXPs** are the reason many fans still play Oolite. The project explicitly excludes them, so it must be positioned as a vanilla core-loop tribute, not an Oolite replacement.
- **"Elite" branding** attracts the wrong legal attention and the wrong expectations.

**How to avoid:**
- Put a short, visible "What this is / what this isn't" panel on the landing page: vanilla core loop, no combat/NPCs/OXPs yet, assets/data from Oolite with attribution, unofficial fan project.
- Default to **classic Elite/Oolite keys** (arrow keys pitch/roll, A/Z speed, J jump, C docking computer, F1 view, 1–4 screens) and offer a modern WASD/mouse layout as an option. Do not make WASD-only the default.
- Add a "flight feel" and "docking" feedback pass with actual Oolite players before polishing graphics. Record side-by-side comparisons.
- Do not ship silence as "done". If sound is out of scope for v1, say so explicitly and plan a sound spike early (at minimum UI clicks, launch/dock, docking music) rather than "asset pipeline later".
- Publish `docs/FIDELITY.md`: source file/line for every ported number, known divergences (yaw, sound, no NPCs, no OXPs, RNG not bit-identical), and a "last verified against Oolite commit" line. This turns "you got it wrong" into "we know, here is the evidence".
- Add ambient life that costs little: station flashers, navigation buoy, planet, sun, starfield, dust, engine glow. An empty but visually rich system reads better than an empty black box.
- Do not promise OXP support, multiplayer, mobile, or "full Oolite" in marketing. Under-promise and let the core loop speak.
- Get a trademark/licence review before the first public post; a takedown or rename request in week one is unrecoverable momentum loss.

**Warning signs:**
- The first community reply is about sound, yaw, or a price number, not the thing you demoed.
- Players ask "is this Oolite?" or "can I install OXPs?"
- The landing page has no disclaimer and no "what this isn't".
- The default controls are WASD + mouse only.
- The station/system is visibly empty; no buoy, no flashers, no planet detail.
- A fan quotes a different Cobra speed or commodity price than the build shows.
- The project is described as "Oolite in the browser" rather than "a tribute to the 1984 game".

**Phase to address:**
Phase 8 (Hardening & Community Release), with the controls/defaults and fidelity matrix starting in Phase 3 and Phase 6. The disclaimer and licence notices are Phase 1.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code the Cobra's speed/thrust/cargo in TS "just for now" | First flight in a day | The data pipeline never becomes authoritative; every ship is a special case; fidelity claims are unverifiable | Only in a throwaway spike; never on the main branch after Phase 2 |
| Parse plists with regex/`JSON.parse` | No parser dependency | Silent data loss, wrong inheritance, untraceable fidelity bugs | Never for Oolite config; acceptable only for a one-file prototype with a TODO |
| One `Game`/`Player` class owning input, physics, render, market and UI | Fast vertical slice | Blocks NPCs, combat, docking computer, headless tests; every feature touches one 2,000-line file | Only before Phase 3; split by the end of Phase 3 |
| Use `Math.random()` for prices/stock | Zero setup | Non-reproducible markets, save/reload exploits, cannot reproduce bug reports | Never for economy; use a seeded PRNG |
| Store absolute world positions in `InstancedMesh`/shader uniforms | Simple instancing | Float32 jitter at 500k+ units; visible snapping | Never at system scale; use camera-relative offsets |
| One `Mesh` per DAT face | Trivial importer | Hundreds of draw calls/state changes; collapses when asteroids/NPCs arrive | Only for a single-model viewer; merge by material before Phase 4 |
| `localStorage` for saves | One-line persistence | 5 MiB cap, synchronous jank, quota errors, Safari private-mode failures | Only for a settings blob; saves go to IndexedDB |
| Regenerate the market from the system seed on load | Smaller save | Save/reload arbitrage; non-reproducible prices; no visited-market state | Never; persist market state or a deterministic RNG state |
| Copy Oolite source line-by-line without port notes | Fast porting | Licence/provenance ambiguity; impossible to review or update | Never; keep a `PORT_NOTES.md` mapping file/function to the TS module |
| Defer Safari/cross-browser testing to the end | More feature time now | Late renderer/texture/audio/storage rewrites; launch slips | Never; run a Safari smoke test from Phase 1 |
| Defer all sound to "asset pipeline later" | Focus on the loop | Community reads silence as unfinished; audio architecture is retrofitted | Acceptable only if clearly labelled, with a scheduled sound spike |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Oolite `Resources/Config/*.plist` | `JSON.parse`, XML plist parser, or a regex parser | OpenStep ASCII parser with fixtures; build-time conversion to typed JSON; schema validation |
| Oolite `shipdata.plist` | Read one entry and ignore `like_ship`/`is_template`/overrides | Resolve inheritance chains with cycle detection and overlay order; assert the player Cobra values |
| Oolite `trade-goods.plist` | Treat `price_average` as credits; ignore `market_definition` | Integer decicredits internally; tri-state market definition (absent/empty/explicit) |
| Oolite `equipment.plist` | Read it as a dict; ignore `condition_script` | Positional array parsing; implement the core conditions (`requires_non_full_fuel`, `requires_empty_pylon`, `available_to_all`) |
| Oolite `.dat` → Three.js | Assume normalised UVs, vertex normals, −Z forward | Divide UVs by declared texture size, preserve per-face normals, define an axis/winding conversion, test with an asymmetric model |
| Oolite textures → Three.js materials | Use the diffuse map as `emissiveMap`; mark it `transparent` | Extract the alpha channel into a separate emissive texture or custom shader; keep diffuse opaque |
| Oolite `planetinfo.plist` | Treat the key as a chart coordinate or iterate special keys | Key is `galaxy system` ID; `coordinates` is the chart position; skip `universal`/`interstellar space` |
| Browser save → IndexedDB | Store live objects or unversioned JSON | Plain versioned DTO; migrations; quota/error handling; export/import |
| Audio → Web Audio | Create `AudioContext` at load and expect sound | Create/resume on a user gesture; resume after visibility/fullscreen changes; mute control |
| Pointer lock → input | Assume `keyup` always arrives | Clear input state on `blur`, `visibilitychange`, `pointerlockchange`, `fullscreenchange` |
| Static host → assets | Wrong MIME types for `.wasm`, `.ktx2`, `.dat` | Prefer `.json` intermediates; configure MIME types; test the production host, not just Vite dev |
| Oolite JS scripting engine | Evaluate OXP/world scripts to reuse logic | Do not execute Oolite JS in v1; port the needed logic to TS; if ever added, sandbox and never run untrusted OXPs |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading every Oolite texture at startup | Multi-second blank screen, hundreds of MB to multiple GB of VRAM, laptop crashes | Ship only Cobra/Coriolis/planet/skybox for v1; lazy-load; KTX2/Basis; texture budget | Breaks on 2 GB integrated GPUs and most laptops with 256 uncompressed 2048² textures |
| One draw call per DAT face/material | 100+ draw calls for a station; frame time spikes when subentities/flashers are added | Group faces by material into `BufferGeometry` groups; merge static subentities; instanced flashers | Breaks when asteroids/NPCs arrive, or on low-end GPUs at 1440p |
| Per-frame allocations (`new Vector3`, `new Quaternion`, arrays) | GC sawtooth, stutter every few seconds | Reuse scratch objects; pool projectiles/particles later; profile with the Chrome performance panel | Breaks at 60 fps on mid-range laptops, especially with HUD/DOM updates |
| `setPixelRatio(devicePixelRatio)` uncapped | 4K/Retina renders 3–4× the pixels; 20–30 fps | Cap at 2; expose quality settings; render HUD at CSS resolution | Breaks on MacBook Retina and 4K monitors |
| Full-resolution bloom/SSAO/shadows in space | 30 fps on integrated GPUs; fan noise | Skip shadows; selective/quarter-res bloom for station lights; bake emissive | Breaks on Intel Iris/AMD integrated and Safari |
| DOM HUD updated every frame | Layout thrash, input latency | Canvas/SVG HUD or throttled DOM updates; batch text changes | Breaks at 60 fps with multiple text nodes and CSS transitions |
| Parsing 1 MB plists/JSON every load or frame | Long startup, jank | Build-time conversion; parse once; cache in IndexedDB/Cache API | Breaks on low-end CPUs and repeat visits |
| Loading all 2,048 systems and planet textures eagerly | Slow first paint; memory spike | Load galaxy metadata once (small); lazy planet textures; stream on approach | Breaks on 4 GB machines and slow networks |
| Variable `dt` with no clamp | Ship tunnels through station after tab return; physics explodes | Fixed timestep + accumulator; clamp to 0.1–0.25 s; pause on hidden | Breaks the first time a laptop sleeps or a tab is backgrounded |
| `preserveDrawingBuffer: true` or `antialias: true` everywhere | Slower compositing, memory cost | Only enable when needed (screenshots); MSAA only if budget allows | Breaks on integrated GPUs at high DPR |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `eval`/`new Function` to parse plists or execute Oolite scripts | Arbitrary code execution from tampered data or a malicious save/OXP | Use a data-only parser; never execute Oolite JS in v1; if scripting returns, sandbox it and never load untrusted OXPs |
| `innerHTML` for commodity descriptions, system descriptions or save names | DOM XSS from data files or imported saves | Use `textContent`/typed rendering; sanitise/escape at the UI boundary |
| Importing a save JSON without validation | Prototype pollution (`__proto__`), huge payload DoS, crashes | Schema validation, size limit, reject unknown keys, `Object.create(null)` for maps |
| Trusting client-side credits/cargo for anything competitive | Cheating; meaningless leaderboards | Keep v1 single-player and offline; do not add online leaderboards without server validation (out of scope) |
| Loading Three.js/plugins from a CDN without pinning | Supply-chain compromise; unreproducible builds | Self-host dependencies, lockfile, SRI if a CDN is unavoidable, vendor licences |
| Serving source maps/source with secrets | No secrets exist, but stray API keys in build env | Keep `.env` out of the repo; GPL source is public by design, but audit for secrets |
| `postMessage`/iframe integrations without origin checks | Cross-origin control of the game | Validate `event.origin`; avoid iframes; no backend means no auth surface |
| Running Oolite's JS engine on imported OXP data | RCE and data exfiltration in the browser | Explicitly out of scope; if ever added, use a Worker + SES/realms-style isolation and no network |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No clear "click to start" gate | Audio and pointer lock are blocked; the game looks broken | Start screen with a single "Launch" button that unlocks audio and requests fullscreen/pointer lock |
| WASD + mouse only as the default | Oolite fans bounce immediately; muscle memory fails | Classic keys default (arrows pitch/roll, A/Z speed, J, C, F1, 1–4), modern layout optional and remembered |
| Mouse flight with no sensitivity/self-centring/deadzone | Nose snaps or drifts; docking is impossible | Relative virtual stick with sensitivity, deadzone, invert-Y, self-centre; pointer lock optional |
| No pause/blur handling | Player returns to a dead ship or an spinning ship | Auto-pause on `blur`/`visibilitychange`; "click to resume"; clear held keys |
| No docking feedback | Player cannot tell if aligned, too fast, or about to scrape | Port alignment indicator, roll-match cue, speed warning, scrape/damage audio-visual cue |
| HUD fixed at one resolution | Tiny at 4K, huge at 1080p | Scale by CSS/DPR; test at 1280×720, 1920×1080, 2560×1440, Retina |
| No save/export visibility | Browser cache clear loses hours; user blames the game | Show "saved locally" status; export/import save file; warn on private mode |
| No loading progress for large assets | Blank screen; user assumes a crash | Loading screen with progress, asset count and a retry/error path |
| No WebGL2/unsupported-browser message | Blank canvas | Capability check + human-readable error + browser requirements |
| No "what this is" / disclaimer | Users think it is official Oolite/Elite; community/legal friction | Visible fan-project disclaimer and scope statement on the landing page |
| Unskippable launch/dock sequences | Repeated play becomes tedious | Allow skip after first view; keep the option to replay |
| Colour-only scanner/target cues | Accessibility gap; colour-blind players miss threats | Shape/label cues in addition to colour; reduced-motion option |

## "Looks Done But Isn't" Checklist

- [ ] **Flight:** The ship moves and turns — verify fixed timestep, input ramp/damping, `5.0 * thrust`, local-axis roll/pitch order, and that alt-tab does not leave a key stuck.
- [ ] **Docking:** The ship can dock — verify the slot is on the station's +Z, the station spins about Z, the 1.5× safety corridor auto-centres, 90% capture triggers, and scraping at speed damages.
- [ ] **Docking computer:** It docks the ship — verify it flies the corridor (not teleports), respects hostile/fugitive/range rules, and fast-dock costs ship clock.
- [ ] **Market:** Prices and stock display — verify decicredits, `market_definition` tri-state, buy/sell quantity/cargo limits, and persistence across save/reload.
- [ ] **Hyperspace:** The jump works — verify distance in LY, fuel in tenths, tank limit 7 LY, target selection, arrival orientation, and a second system with its own market.
- [ ] **Save/load:** Progress survives a refresh — verify market prices/quantities, RNG state, equipment, ship damage, location, schema version and migration.
- [ ] **Data fidelity:** The Cobra looks right — verify model variant (`oolite_cobra3.dat`, bbox ~`130×35×81`, not the legacy `cobra3_redux.dat` at `130×30×65`), speed 350/pitch 1.0/roll 2.0/thrust 32, cargo 20, and correct texture set.
- [ ] **Station:** The Coriolis looks right — verify hull + faceplate + tris + dock subentities, letterbox size 192×64, dock at z≈500.2561, and no black void inside the slot.
- [ ] **Materials:** Textures are visible — verify UV divide by declared size, V orientation, sRGB vs linear, per-face normals, alpha emission, and no uniform glow.
- [ ] **Rendering scale:** The planet/station are stable — verify camera-relative transforms, near/far split or log/reversed depth, no z-fighting on the station faceplate, and 4K/Retina.
- [ ] **Licensing:** `LICENSE` exists — verify `NOTICE`, `LICENSE-ASSETS`, `THIRD_PARTY_NOTICES`, `TRADEMARKS.md`, asset manifest, raw source formats, and a source link on the deployed site.
- [ ] **Trademark:** The name is Wegolite — verify no "Elite"/"Oolite" in title/domain/logo/store listing, and a visible non-affiliation disclaimer.
- [ ] **Browser:** It runs in Chrome — verify Firefox and Safari, audio unlock, context-loss recovery, IndexedDB, fullscreen/pointer lock, and background-tab pause.
- [ ] **Performance:** 60 fps on the dev machine — verify 1080p/1440p on integrated graphics, capped DPR, texture memory, and no per-frame allocations.
- [ ] **Community:** A fan can play it — verify classic keys, a visible scope statement, a fidelity/divergence doc, and at least one Oolite player has completed a trade run.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Licence collapse | HIGH | Stop distribution; audit every asset; add `NOTICE`/`LICENSE-ASSETS`/manifest; remove or replace assets that cannot be relicensed; publish corresponding source; re-release with a clear changelog |
| Trademark/naming | MEDIUM | Rename the product/domain/handles; remove logos; add a visible disclaimer; update store listings; get a legal read before re-launch |
| Wrong data units/file names | MEDIUM | Freeze economy code; build the unit table; add golden tests; regenerate the data snapshot; diff old/new prices and ship stats |
| Plist parser/inheritance bug | MEDIUM | Replace the parser with a tested OpenStep implementation; add fixtures; add schema validation; re-run fidelity tests for every ship/station/commodity |
| DAT/orientation/material bug | MEDIUM | Add an axis/winding contract; test with the Coriolis letterbox and Cobra nose; re-import; add bbox/UV assertions; compare screenshots side-by-side |
| Float32/depth instability | HIGH | Introduce camera-relative rendering/floating origin; split near/far passes; add log/reversed depth; retest at 500k/1.3M units; profile |
| Flight feel wrong | MEDIUM | Replace force-based integration with the kinematic model; restore constants; add ramp/damping; clamp dt; playtest against Oolite; expose tuning only as a last resort |
| Docking too easy/hard | MEDIUM | Replace the trigger with the corridor model; fix station spin axis; add alignment/roll/speed feedback; tune safety/capture thresholds; add a docking computer |
| Scope/architecture hole | HIGH | Stop feature work; split simulation/render/input; introduce `Entity`/`Ship`/`Station`/controller interfaces; move player-only special cases; port the docking computer first |
| Save regeneration exploit | MEDIUM | Add market/RNG persistence; version the DTO; write round-trip tests; migrate existing saves or invalidate with a warning |
| Browser breakage | MEDIUM | Add visibility/blur pause; audio unlock; context-loss handlers; Safari test matrix; cap DPR; fix MIME types; ship a capability error page |
| Community rejection | MEDIUM | Publish fidelity/divergence docs; change defaults to classic keys; add sound/ambience spike; add visible disclaimer; solicit Oolite playtesters before the next demo |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Licence collapse | Phase 1 (Foundation & Compliance) | `LICENSE`, `NOTICE`, `LICENSE-ASSETS`, `THIRD_PARTY_NOTICES`, `TRADEMARKS.md`, asset manifest and source link exist; a licence audit passes |
| Trademark/naming | Phase 1 | Title/domain/logo/store listing contain no "Elite"/"Oolite"; visible non-affiliation disclaimer |
| Data units/file names | Phase 2 (Data Pipeline & Fidelity) | Golden tests: food 5.0 Cr, missile 30.0 Cr, Cobra speed 0.350 LS, planet radius `km*10`, fuel `tenths` |
| Plist parsing/inheritance | Phase 2 | Parser fixtures pass; player Cobra resolves to 350/32/1.0/2.0/20; Coriolis market is non-empty |
| DAT/model/material import | Phase 2 and Phase 4 | Coriolis letterbox on +Z; Cobra bbox ~`130×35×81` for `oolite_cobra3.dat`; UV/texture orientation correct; per-face normals; alpha emission works |
| Float32/depth instability | Phase 4 (World Rendering & Scale) | No jitter/z-fighting at 500k/1.3M units; 4K/Retina smoke test; depth strategy documented |
| Flight feel | Phase 3 (Flight & Input) | Scripted rate/acceleration curves match Oolite; 60/144 Hz parity; alt-tab key-stuck test; Oolite player feedback |
| Docking too easy/hard | Phase 5 (Docking & Launch) | Scripted approaches: perfect docks, 10° off scrapes, wrong roll fails, too-fast crashes; computer flies corridor |
| Scope/combat-shaped hole | Phase 1/3/5, reviewed Phase 7 | Headless simulation test; `ShipController` interface; docking computer is an AI; entity model supports two ships |
| Save/reload exploit | Phase 6 (Economy, Screens & Save) | Save/reload round-trip preserves prices/quantities/RNG; no arbitrage; migration test; IndexedDB quota handling |
| Browser platform breakage | Phase 1 checklist, Phase 6, Phase 8 (Hardening & Community Release) | Chrome/Firefox/Safari pass; audio unlock; visibility pause; context-loss recovery; MIME types; WebGL2 error page |
| Community rejection | Phase 8 | Classic-key defaults; visible scope/disclaimer; fidelity doc; one Oolite player completes a trade run; sound plan published |

## Sources

### Primary Oolite sources (HIGH confidence)
- Oolite `LICENSE.md`, master, commit `7437f22` (2026-11-01): GPL-2.0-or-later; artwork and configuration files dual-licensed CC BY-NC-SA 3.0; separate sound/library notices. `https://raw.githubusercontent.com/OoliteProject/oolite/master/LICENSE.md`
- `Resources/Config/trade-goods.plist` (commodity keys, `price_average` decicredits, `peak_export`/`peak_import`, `market_definition` context).
- `Resources/Config/equipment.plist` (positional array format; prices in decicredits; `requires_non_full_fuel`, `requires_empty_pylon`, `condition_script`).
- `Resources/Config/shipdata.plist` (player Cobra template at ~line 1226: speed 350, pitch 1.0, roll 2.0, thrust 32, cargo 20; Coriolis template at ~line 1690: `station_roll = 0.08`, `market_definition = ()`, subentities at `z=500.2561`; `smooth = 0` for dock; `emission_map` alpha extraction).
- `Resources/Config/shipyard.plist` (ship prices in credits; Cobra Mk III 150000).
- `Resources/Config/planetinfo.plist` (system keys as `galaxy system`, `coordinates` separate; `radius` in km; `stations_require_docking_clearance = no`; planet/sun distances).
- `src/Core/OOMesh.m` (DAT parser: `NVERTS`/`NFACES`/`VERTEX`/`FACES`/`TEXTURES`; first three ints are colours and first is `smoothGroup`; faces >3 vertices truncated; UVs divided by `max_x`/`max_y`; per-face normals; `smooth` mode).
- `src/Core/Entities/ShipEntity.m` (max flight values at ~264–271; `SHIP_THRUST_FACTOR` at `ShipEntity.h:46`; `flightSpeed`/`flightRoll`/`flightPitch` setters at ~7405–7483; `moveForward` at ~5810).
- `src/Core/Entities/PlayerEntity.m` (`applyRoll:andClimb:` at ~3814–3854; `enterDock:` at ~6258; `flightRoll = launchRoll` at ~3522; fuel display `fuel/10.0` at ~7064).
- `src/Core/Entities/PlayerEntityControls.m` (thrust `SHIP_THRUST_FACTOR` at ~1054; input ramp/damping at ~3726–3835; docking computer/fast dock at ~4655–4755).
- `src/Core/Entities/DockEntity.m` (port dimensions, `canAcceptShipForDocking`, 1.5× safety, auto-centring, 90% capture, scrape damage at ~685–790).
- `src/Core/Entities/OOPlanetEntity.m` (`collision_radius = radius_km * 10.0` at ~119–120).
- `src/Core/GameController.h:36` (`MINIMUM_GAME_TICK 0.25`); `src/Core/GameController.m` ~340–345 (tick clamp).
- `src/Core/OOCommodities.m` (~383–411 price/quantity generation with `randf() - randf()`; ~431–452 economic bias).
- `src/Core/OOQuaternion.m` (~50–80 forward = +Z).
- `src/Core/Entities/PlayerEntityLoadSave.m` (~614–621 `localMarket` and `station_markets` persistence).
- `Resources/Models/oolite_cobra3.dat` (player model, bbox `130 × 34.965 × 81.373`), `Resources/Models/cobra3_redux.dat` (legacy Cobra model, bbox `130 × 30 × 65`), `Resources/Models/oolite_coriolis.dat` (hull bbox 1000×1000×~996), `Resources/Models/oolite_coriolis_dock.dat` (slot/tunnel geometry), `Resources/Models/new_coriolis.dat` (legacy model with a 64×192 opening at z=500; local axes may be rotated).
- `src/Core/Universe.m` (~5039–5045 `station_roll` override; `STANDARD_STATION_ROLL 0.4`; ~1440–1464 planet/sun distances).

### Secondary/community sources (MEDIUM confidence)
- Elite Wiki, "Docking": manual docking method, slot rotation, speed guidance, docking clearance. `https://wiki.alioth.net/index.php/Docking`
- Elite Wiki, "How to Dock": navigation beacon alignment, roll matching, low-speed approach guidance (the wiki uses the older LM label; current Oolite displays LS). `https://wiki.alioth.net/index.php/How_to_Dock`
- Elite Wiki, "OXP howto dockable stations": invisible docking sphere/corridor, slit dimensions, +Z requirement. `https://wiki.alioth.net/index.php/OXP_howto_dockable_stations`
- Elite Wiki, "Oolite": non-Newtonian flight model, "aeroplane in space". `https://wiki.alioth.net/index.php/Oolite`
- Elite Wiki, "Roll vs Yaw crusades": yaw added to Oolite in v1.66 (2007); Oolite favours roll/pitch. `https://wiki.alioth.net/index.php/Roll_vs_Yaw_crusades`
- Oolite Bulletin Board, "JavaScript/Emscripten" (2015) and "WebGPU Reboot" (2023): community interest in browser ports; OXP support is a top expectation. `https://bb.oolite.space/viewtopic.php?t=17433`, `https://bb.oolite.space/viewtopic.php?t=21483`
- Frontier Developments, "Legal Notices": Elite, Elite logo, Cobra, Cobra logo are trademarks. `https://www.frontier.co.uk/legal/legal-notices`
- Wikipedia, "Oolite (video game)": source GPL-2.0-or-later, resources dual-licensed GPL/CC BY-NC-SA-3.0. `https://en.wikipedia.org/wiki/Oolite_(video_game)`

### Browser/platform sources (MEDIUM confidence; cross-checked)
- MDN, "Autoplay guide for media and Web Audio APIs": audio blocked until user gesture; `AudioContext` subject to autoplay rules. `https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay`
- MDN, "Pointer Lock API": user-gesture requirement, Esc exit. `https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API`
- MDN, "Page Visibility API": hidden tabs, throttling. `https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API`
- MDN, "Storage quotas and eviction criteria": 5 MiB localStorage/sessionStorage, 10 MiB total Web Storage, `QuotaExceededError`, IndexedDB quotas/eviction. `https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria`
- MDN, "WebGL best practices": precision, context loss, `WEBGL_lose_context`. `https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices`
- MDN, "webglcontextlost event": `preventDefault`, restore flow. `https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event`
- Three.js `WebGLRenderer` source: `logarithmicDepthBuffer` for huge scale differences, `reversedDepthBuffer` requires `EXT_clip_control`, `outputColorSpace` defaults to sRGB. `https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js`
- Float32 precision references: "The Perils of World Space" (`https://nicolbolas.github.io/oldtut/Positioning/Tut07%20The%20Perils%20of%20World%20Space.html`), "WebGL Precision Issues" (`https://webglfundamentals.org/webgl/lessons/webgl-precision-issues.html`), Godot's large-world precision article (`https://godotengine.org/article/emulating-double-precision-gpu-render-large-worlds/`), OVGrid floating-origin write-up (`https://ovgrid.com/engineering-a-planet-in-the-browser-the-decisions-behind-ovgrid`).

### Prior art (MEDIUM confidence; use as design reference, not authority)
- `atomic14/harmless`: browser Elite tribute; classic keys default, modern layout optional; docking letterbox roll-match, bounce/damage, docking computer. `https://github.com/atomic14/harmless`
- `JamesRandall/webGLite`: TypeScript/WebGL port of BBC Elite. `https://github.com/JamesRandall/webGLite`
- `KeithTheDev/elite-js`: Three.js Elite recreation with a Frontier disclaimer. `https://github.com/KeithTheDev/elite-js`
- `0bOne/obelite`: browser Elite/Oolite experiment linked from the Oolite forum. `https://github.com/0bOne/obelite`
- `fesh0r/newkind`: Elite: The New Kind port with instant/auto docking options. `https://github.com/fesh0r/newkind`

---

*Pitfalls research for: Wegolite — browser-based faithful Oolite core-loop reimplementation*
*Researched: 2026-11-02*

