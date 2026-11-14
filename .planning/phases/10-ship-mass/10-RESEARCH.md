# Phase 10: Ship Mass - Research

**Researched:** 2026-11-14
**Domain:** Build-time port of Oolite's hull octree (`OOMeshToOctreeConverter.m`, `Octree.m`, `OOMesh.m`) into the content pipeline (`tools/oolite-ingest/`), mass records in the compiled ship JSON, and the Coriolis jump-blockage mass
**Confidence:** HIGH for the hull-mass algorithm and numbers (two independent implementations agree bit for bit; nine hull masses match a community table); MEDIUM for the Coriolis and buoy totals (code-derived, no runtime oracle available here)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Compute a mass for every Phase 9 role ship, the Cobra Mk III and the Coriolis station (mandatory, from the roadmap).
- **D-02:** The navigation buoy (model vendored by quick task 261111-g5n) also gets an octree mass now. This closes the buoy data gap from plan 06-16 and avoids a duplicate later.
- **D-03:** The dodecahedron and icosahedron stations get no mass. They stay non-blocking (06-16 option (a), owner decision 2026-11-07); Phase 12 does not consume them. Revisit only if a later phase needs them.
- **D-04:** Compare the computed Coriolis octree mass with 455,223,200 (`ShipEntity.m:12504`). If the difference is inside the spike's stated tolerance, use the octree value as `CORIOLIS_STATION_MASS`. If it is outside the tolerance, stop and ask the owner with both numbers. Either way record the result as a Key Decision in `.planning/PROJECT.md`. The existing Coriolis blockage tests must pass with the chosen value.
- **D-05:** Add a `mass` field to the compiled NPC records in `ships-npc.json`, next to roles, AI name, scan class and model. For the Cobra Mk III and the Coriolis (which live in `ships-client.json`), add the same single `mass` field there. No separate mass file; no octree data in any bundle. `src/sim` reads only the compiled number. The mass golden is the existing content golden and `assets:check` drift gate, which fail when a mesh or octree rule changes a mass. **Rationale:** the owner asked that mass not grow a shared catalogue file; NPC fields already live in the lazily loaded `ships-npc.json`, so a mass is one number per ship there and `ships-client.json` gains only two numbers.

### Claude's Discretion
- Octree depth, float32 versus float64 in the volume sum, and the stated tolerance for the worked examples (the spike decides, since Oolite stores mass as a `GLfloat`).
- Module layout of the octree port under `tools/oolite-ingest/` (only the construction and volume parts of `Octree.m` and `OOMeshToOctreeConverter.m` are ported).
- Density source per ship (default 1.0 when `shipdata.plist` has none, as in Oolite).

### Deferred Ideas (OUT OF SCOPE)
- Octree mass for the dodecahedron and icosahedron stations: not needed by Phase 12; revisit if blockage is extended to those 224 systems.
- Runtime ray and hull queries (DATA-16): the combat phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-11 | Each ship carries the fields the inert world uses (roles, AI name, scan class, model) and its mass computed from a build-time octree as Oolite does (`density * 20 * octree volume`), checked by worked examples for the Cobra Mk III, the Coriolis station and the Viper; the Coriolis octree mass is compared with 455,223,200 and one value is kept by owner decision if they differ | Full algorithm, depth rule, volume rule, float32 semantics, 16 measured masses, the **subentity mass addition** that the roadmap formula omits, tolerance, record placement, test and golden changes (sections below) |
</phase_requirements>

## Summary

Oolite's ship mass is `density * 20 * octreeVolume` for the hull mesh, **plus the mass of every solid mesh subentity** (`mass += [subent mass]`, `ShipEntity.m:2040`). The roadmap and CONTEXT state only the first term. For the nine NPC role ships and the Cobra Mk III there are no mesh subentities (only exhaust plumes and flashers, which are not `ShipEntity`), so the first term is the whole mass. For the **Coriolis** (faceplate, tris, dock subentities) and the **navigation buoy** (one core subentity) the subentity masses matter and change the answer by a factor of about 2.25 for the Coriolis. This was found by reading the source, and it is the reason the Coriolis hull alone (228,650,880) is half of 455,223,200 while the full runtime mass (515,483,904) is 13.2 % above it.

The octree is cheap to port exactly. A scratch port (JavaScript with `Math.fround` after every operation, run in the project's Docker image) and an independent plain-C float32 transliteration (compiled with and without FMA contraction) produce **identical masses on all 16 vendored `.dat` meshes**. A float64 run gives the same octree structure and differs only by 2e-7 relative or less in the volume sum, so the float precision question is settled: use float32 semantics (faithful and bit-reproducible), store the exact float32 value. Nine hull masses agree with the community "VariableMasslock" table to the whole tonne (Adder 16 t, Gecko 25, Sidewinder 25, Viper 34, Mamba 36, Moray 51, Cobra Mk I 52, Krait 93, Cobra Mk III 215), which is the only external oracle available. Neither Oolite source constant in the tree (455,223,200 for the Coriolis, 185,580 for the Cobra at `PlayerEntity.m:191-192`) is reproduced by the current meshes; both predate the present models (assumed).

The Coriolis number is outside any defensible tolerance on every reading (hull only -49.8 %, full runtime mass +13.2 %), so D-04 requires **stopping and asking the owner** with both numbers. The faithful full mass would also break the two pinned distances in `tests/sim/hyperspace-blockage.test.ts` (6,700 m blocks, 6,800 m does not): its blockage radius is 7,180 m. The plan needs an explicit owner-decision checkpoint before the countdown constant changes.

**Primary recommendation:** Port the converter and `volumeOfOctree` into `tools/oolite-ingest/convert/octree.ts` with float32 semantics; compose mass as hull plus ordered float32 sum of mesh-subentity masses in a separate `ship-mass.ts`; store one `mass` number per record; put an owner decision checkpoint (both Coriolis numbers, three options below) before changing `CORIOLIS_STATION_MASS`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Octree construction and volume | Build tooling (`tools/oolite-ingest`) | — | AGENTS.md and D-05: the octree exists only at build time; no octree data ships |
| Mass composition (density, subentities) | Build tooling | — | Needs the catalogue (density, subentity keys) and parsed meshes, both build-time inputs |
| Compiled mass storage | Generated JSON (`src/content/generated`) | Schema in `src/content/schemas` | D-05: one number per record; strict schemas reject drift |
| Mass consumption (blockage) | `src/sim/hyperspace/countdown.ts` | App wiring in `src/app/session/step-options.ts` | `src/sim` must not import `src/content/ships*`; it keeps a literal constant pinned by a test against the compiled number |
| Drift detection | `assets:check` + golden tests | `tests/contract/fidelity.test.ts` | D-05: a mesh or rule change must fail the gate |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript / Node (existing) | Node 24 in `wegolite-ci` image | Octree port, plain `Math.fround` arithmetic | No dependency needed; the algorithm is ~150 lines |
| zod (existing) | 4.6.7 (`package.json`) | `mass` field in `NpcShipSchema` and `CatalogEntrySchema` | Already the schema layer for both files |
| vitest (existing) | 5.0.5 | Unit tests for the port and the records | Existing runner; `tools/**/*.test.ts` already run under `npm test` |

### Supporting
None. No new package is required (see Package Legitimacy Audit).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Float32 emulation with `Math.fround` | Plain float64 | Same octree, volume within 2.1e-7 relative, but not bit-identical to Oolite and the golden would need a tolerance; float32 is exact and no harder |
| Port `OOOctreeBuilder` node buffer | Build a nested node tree | Folding rule is equivalent (all eight children solid becomes one solid node); the buffer layout is not needed because nothing serialises the octree |

**Installation:** none.

**Version verification:** no external packages are added; versions above are read from `/home/opencode/git/wegolite/package.json` this session.

## Package Legitimacy Audit

No external packages are installed by this phase. Nothing to audit.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
third_party/oolite/Config/shipdata.plist ──► compileShips() ──► catalogue (density, model, subentities)
                                                                      │
third_party/oolite/Models/*.dat ──► readModels() ──► ParsedMesh map ──┤  (already loaded and bounds-asserted
                                                                      │   for all 16 files by generate.ts)
                                                                      ▼
                         ship-mass.ts: for a shipdata key
                           hull = 20 * density * volume(buildOctree(mesh))      (float32)
                           + Σ mass(subentity) for non-flasher subentities       (float32, in list order)
                                                                      │
                                       masses: Map<key, number>       ▼
        ┌──────────────────────────────┬──────────────────────────────┬─────────────────────┐
        ▼                              ▼                              ▼                     ▼
  emitNpcShips (9 records)    emitClientShips (2 or 3)      emitShipsFromCatalogue      (no mass: ships.json
  + mass                      + mass                         unchanged (recommended)     stays as is)
        │                              │
        ▼                              ▼
 ships-npc.json  (lazy)        ships-client.json            manifest.json hashes change
                                      │
                    pinned equal to ──┘
                                      ▼
            src/sim/hyperspace/countdown.ts  CORIOLIS_STATION_MASS (literal) ◄── owner decision D-04
```

### Recommended Project Structure
```
tools/oolite-ingest/convert/
├── octree.ts          # NEW: depth rule, split, build, volume (pure, float32); no I/O
├── octree.test.ts     # NEW: synthetic meshes with hand-derived volumes, the 16 pinned masses, f32/f64 structure check
├── ship-mass.ts       # NEW: hull + subentity composition, density, fail-loud guards
├── ship-mass.test.ts  # NEW: worked examples (Cobra, Coriolis, Viper) and the wiki tonne check
├── npc-ships.ts       # EDIT: take masses, add `mass` to the candidate record
└── ships.ts           # EDIT: emitClientShips takes masses; entryToJson writes optional mass
src/content/schemas/ship-npc.ts   # EDIT: mass: z.number().positive() (finite)
src/content/schemas/ship.ts       # EDIT: mass optional on CatalogEntrySchema
tools/oolite-ingest/generate.ts   # EDIT: compute masses once after readModels(), pass to both emitters
```

### Pattern 1: Faithful float32 octree (the whole algorithm)

**What:** Port exactly these Oolite pieces. Every arithmetic result is rounded with `Math.fround`. Verbatim quotes are from the pinned tree (`7437f22`; `git diff 7437f22 HEAD` is empty for all of the files below, so the checkout line numbers equal the pin).

1. **Vertices.** `OOMesh.m:1225`: `_vertices[j] = make_vector(x * scale, y * scale, z * scale);` where `scale` is `model_scale_factor` (`ShipEntity.m:261`, default 1.0). No ship in this phase authors a scale (verified: no `model_scale_factor` key in the resolved `ships.json` entries of any of the 12 keys, nor in the three Coriolis or one buoy subentity entries). Vertices are float32 (`scanFloat`).
2. **Triangles.** `OOMesh.m:638-647` builds one triangle per face from `_vertices[_faces[i].vertex[k]]`; `OOMeshToOctreeConverter.m:253-258` drops degenerate triangles (`OOTriangleIsDegenerate`: any two of the three vertices exactly equal, `OOTriangle.h:67-70`).
3. **Depth.** `OOMesh.m:66-70`: `kBaseOctreeDepth = 5`, `kSmallOctreeDepth = 4`, `kOctreeSizeThreshold = 900`, `kOctreeSmallSizeThreshold = 20`; `Octree.h:82` `kMaxOctreeDepth = 7`. `OOMesh.m:591-623`: sort the three bounding-box spans, `size = (xs + ys) / 2.0f` over the two **largest** spans; `size < 20` gives 4; otherwise start at 5 and, while `result < 7`, stop if `size < threshold` else `threshold *= 2.0f; result++` (so `size < 900` gives 5, `< 1800` gives 6, else 7). The bounding box is over **all vertices**, not only referenced ones (`OOMesh.m:1800-1805`).
4. **Root radius.** `OOMeshToOctreeConverter.m:263`: `OOScalar halfWidth = 0.5f + MaxDimensionFromOrigin(&_data); // pad out from geometry by a half meter`. `MaxDimensionFromOrigin` is the largest `|coordinate|` over the **non-degenerate triangles'** vertices (lines 272-287). The cube is centred on the **model origin**, not the bounding-box centre.
5. **Recursion** (`OOMeshToOctreeConverter.m:289-412`): empty set gives an empty node (checked first); `if (halfWidth <= OCTREE_MIN_HALF_WIDTH || depth <= 0)` gives a solid node (`Octree.h:31`: `#define OCTREE_MIN_HALF_WIDTH 1.0`); otherwise split the triangle set by the z plane, then y, then x, at zero, translating plus halves by `-subHalfWidth` and minus halves by `+subHalfWidth` (`subHalfWidth = 0.5f * halfWidth`), and recurse on the eight octants in the order g_000, g_001, g_010, g_011, g_100, g_101, g_110, g_111 (index = x*4 + y*2 + z, plus side = coordinate >= 0). A triangle crossing the plane is cut into pieces by the nine-case tables at lines 456-784, **including the cases where a vertex lies exactly on the plane**. Triangle pieces are not degeneracy-filtered after a split, so a triangle touching a cell boundary can make a neighbouring cell non-empty; this is why float32 rounding of the translations is worth keeping.
6. **Quirk to port as written.** `SplitGeometryY` (`OOMeshToOctreeConverter.m:577-584`) uses two separate `if` statements, so a triangle lying entirely in the y = 0 plane is added to both halves; X and Z use `else if` (lines 468-474, 688-694). The scratch run shows no model is sensitive to this (masses identical with the quirk removed), but port it as written.
7. **Fold.** `Octree.m:851-878` (`endInnerNode`): when the eight children just written are all solid, replace them by one solid node. Equivalent to "all eight children are solid leaves".
8. **Volume.** `Octree.m:634-681`:
```objc
static GLfloat volumeOfOctree(Octree_details octree_details, unsigned depthLimit)
...
    if (octBuffer[0] == -1 || depthLimit == 0) {
        return octRadius * octRadius * octRadius;
    }
...
    nextDetails.radius = 0.5f * octRadius;
...
    return volumeOfOctree([self octreeDetails], 5);
```
   A solid or limit-reached non-empty node contributes `r*r*r` where `r` is its **half-width** (not the full edge), the sum is a float accumulated in child-index order 0..7, and the depth limit is **5 regardless of the depth the octree was built to** (comment at `Octree.m:671-679`: "Raising the limit means lower calculated volumes for large ships"). For a depth-6 octree every non-empty level-5 node counts as full.
9. **Mass.** `ShipEntity.m:417-419`:
```objc
    float density = [shipDict oo_floatForKey:@"density" defaultValue:1.0f];
    if (octree)
        mass = (GLfloat)(density * 20.0f * [octree volume]);
```
   Evaluate as `fround(fround(density * 20) * volume)`.
10. **Subentities (not in the roadmap).** `ShipEntity.m:2028-2041` (`addSubentityToCollisionRadius:`, called from `addSubEntity:` at line 5791, which `setUpSubEntities` at line 790 drives after line 419):
```objc
    if ([subent isKindOfClass:[ShipEntity class]]) // Solid subentity
    {
        if (distance > collision_radius) {
            collision_radius = distance;
        }

        mass += [subent mass];
    }
```
   Exhaust plumes (`OOExhaustPlumeEntity`) and flashers (`OOFlasherEntity`) are not `ShipEntity`, so only `subentities` entries **without** `type = flasher` add mass (`ShipEntity.m:841-846`). A dock subentity is a `DockEntity` (a `ShipEntity` subclass, `Universe.m:3774`) and adds its own octree mass like any other. `DockEntity.m:1115-1127` and `StationEntity.m:569-600` do not alter mass. The sum is a float32 running add, hull first, then subentities in `shipdata` list order. Each subentity's own mass is computed by the same rule from its own shipdata entry (own density, own mesh, own adaptive depth).

**When to use:** always; this is the single rule for every ship in the phase.

### Pattern 2: Record the mass as the exact float32

Store `Math.fround(value)` as the JSON number. A float32 is exactly representable as a double and has a finite decimal expansion, so `canonicalJson` round-trips it (for example `34040.6796875`, `214737.6875`, `228650880`). Do not round to integers: it would not be Oolite's `GLfloat`.

### Anti-Patterns to Avoid
- **Treating the roadmap formula as complete.** `density * 20 * volume` of the hull is wrong for the Coriolis and the buoy; omit the subentity sum and the Coriolis is 49.8 % low.
- **Summing volume at the build depth.** The volume limit is 5, not the build depth (Coriolis hull at limit 6 would be 106,634,880, at limit 7 51,208,272).
- **Using the bounding-box centre or full edge length.** The cube is centred on the origin and the volume term is `r^3` with `r` the half-width.
- **Mutating shared meshes.** `generate.ts` shares one `models` object between emitters and `glb.ts:1051-1052` runs `repairWinding` on it in place. The octree must not depend on that order (it does not: swaps are 0 on all 16 models and the masses are identical with and without the repair), but do not add a second in-place mutation.
- **Implementing `model_scale_factor`.** Nothing authors one; throw if the key is present on a ship being measured, so a snapshot bump cannot silently produce a wrong mass.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Plane splitting of triangles | A clipping library or a box/triangle overlap test | The nine-case tables of `OOMeshToOctreeConverter.m:456-784` ported verbatim | Cell occupancy depends on zero-area slivers the tables produce; a different clipper gives a different octree and a different mass |
| `.dat` parsing | A second parser | `parseDat` in `tools/oolite-ingest/convert/dat.ts` (already used by `generate.ts` `readModels`) | Already validates counts, indices and bounds; take `mesh.vertices` and `mesh.faces[].vertices` |
| JSON serialisation | Custom number formatting | `canonicalJson` (existing) | Already the project's deterministic emitter |
| Float32 rounding | Typed-array tricks | `Math.fround` at each operation | Clear, matches C semantics, verified bit for bit against C |

**Key insight:** the octree is a quantiser of the hull; any deviation in the split rules changes which cells are non-empty and therefore the mass by whole cells (about 1e-3 to 1e-2 relative), far above the 2e-7 float noise. Port the rules, not the idea.

## Runtime State Inventory

Not a rename, refactor or migration phase. Omitted.

## Common Pitfalls

### Pitfall 1: The subentity masses are missed
**What goes wrong:** Coriolis mass is recorded as 228,650,880 and the buoy as 691,044.375.
**Why it happens:** CONTEXT and the roadmap cite only `ShipEntity.m:417-419`.
**How to avoid:** `ship-mass.ts` walks the catalogue entry's non-flasher subentities recursively. A test pins Coriolis = hull + faceplate + tris + dock = 515,483,904 and buoy = 698,691.1875.
**Warning signs:** a Coriolis mass near 2.3e8.

### Pitfall 2: Volume taken at the octree depth
**What goes wrong:** the depth-6 Coriolis meshes are measured at level 6 instead of 5; the hull comes out at 106,634,880 instead of 228,650,880 (limit 7 gives 51,208,272).
**How to avoid:** always `limit = 5`; pin the depth rule and the limit as named constants with the source lines.

### Pitfall 3: Float32 not emulated at every step
**What goes wrong:** the structure is the same but masses differ in the 7th digit, so the golden depends on platform or on JS evaluation order.
**How to avoid:** `Math.fround` after each operation including `0.5 + maxDim`, the `i01` ratios, each `+= offset`, `r*r` then `*r`, and the accumulator.

### Pitfall 4: NaN and degenerate input (roadmap pitfall 4)
**What goes wrong:** a NaN vertex or an empty triangle set yields NaN or 0 mass silently.
**How to avoid:** fail the build (`contentError`) when any used vertex is non-finite, when no non-degenerate triangle remains, or when the final mass is not finite and positive. The vendored meshes are valid today; the guard protects a snapshot bump.

### Pitfall 5: Test pins that a changed Coriolis mass breaks
**What goes wrong:** `tests/sim/hyperspace-blockage.test.ts` pins `witchspaceStationMass("coriolis")` to `455_223_200` (line 106), "blocks at 6,700 m" and "does not block at 6,800 m" (lines 133-152), and the default-path jump at 6,700 m. A mass M satisfies both distances only if `448,900,000 < M < 462,400,000`.
**How to avoid:** do not change the constant until the owner decides; if it changes, move the test distances with it (see Open Question 1).

### Pitfall 6: Existing tests that encode "no mass"
- `tests/content/ships-npc.test.ts:88-90` asserts that a record with `mass: 1000` is **rejected** ("so no stat can be compiled in"). Replace it with an assertion on a different extra field and add "rejects a missing, zero, negative or non-finite mass".
- `tests/content/ships-client.test.ts` "copies each entry unchanged from the complete catalogue" fails once client entries gain `mass` and `ships.json` does not. Either compare ignoring `mass` or add mass to `ships.json` (see Open Question 4).
- `tools/oolite-ingest/convert/npc-ships.test.ts:113` (`Object.keys(record).sort()` equals `golden.fields`) and the hand-written golden `tests/golden/content/ships-npc.json` (`fields`, `examples`) both gain `mass`.
- The schema comments in `ship-npc.ts` and `npc-ships.ts` that say Phase 10 adds the mass should be updated.

### Pitfall 7: The buoy has no home in the D-05 files
`NPC_SHIP_KEYS` has nine role ships and `compileNpcShips` requires each GLB to be owned by exactly one key (`npc-ships.ts:94-101`); `buoy.glb` has two owners and two sources by design (`glb.ts:81`, `:102`). `tests/e2e/budget.spec.ts:70-90` iterates every record in `ships-npc.json` and opens `public/<glb>`, so a tenth NPC record would also change the first-load budget spec. See Open Question 2.

## Code Examples

### The split step, condensed from the verified scratch port
```typescript
// Source: OOMeshToOctreeConverter.m:456-563 (X), :565-674 (Y), :676-784 (Z); all ops rounded.
const f = Math.fround;
type Tri = number[]; // 9 floats: v0 xyz, v1 xyz, v2 xyz

function split(data: Tri[], axis: 0 | 1 | 2, off: number, yQuirk: boolean): [Tri[], Tri[]] {
  const a = axis, b = (axis + 1) % 3, c = (axis + 2) % 3;
  const plus: Tri[] = [], minus: Tri[] = [];
  for (const tri of data) {
    const v = [0, 1, 2].map((i) => tri.slice(i * 3, i * 3 + 3));
    const [s0, s1, s2] = [v[0][a], v[1][a], v[2][a]];
    let done = false;
    if (s0 >= 0 && s1 >= 0 && s2 >= 0) {
      plus.push(tri.slice()); done = true;
      if (yQuirk && s0 <= 0 && s1 <= 0 && s2 <= 0) minus.push(tri.slice()); // Y only (line 581)
    } else if (s0 <= 0 && s1 <= 0 && s2 <= 0) { minus.push(tri.slice()); done = true; }
    if (!done) {
      const i01 = s0 === s1 ? -1 : f(s0 / f(s0 - s1));
      const i12 = s1 === s2 ? -1 : f(s1 / f(s1 - s2));
      const i20 = s2 === s0 ? -1 : f(s2 / f(s2 - s0));
      // v01/v12/v20: coordinate `a` = 0; the other two = f(f(i * f(p1 - p0)) + p0)
      // then the vertex-on-plane cases (s0 === 0, s1 === 0, s2 === 0) and the six
      // strict sign cases, each pushing the exact triangles listed in the source.
    }
  }
  for (const t of plus) for (let k = 0; k < 3; k++) t[k * 3 + a] = f(t[k * 3 + a] + f(-off));
  for (const t of minus) for (let k = 0; k < 3; k++) t[k * 3 + a] = f(t[k * 3 + a] + off);
  return [plus, minus];
}
```
The full 16-model-verified port is at `/tmp/claude-1027/-home-opencode-git-wegolite/f3d9eaee-f973-4cf3-a107-a779150cce77/scratchpad/oct/octree.mjs` (scratch, not for the repository; the plan should re-derive from the Oolite source lines above, and may read the scratch as a cross-check while it exists). The plain-C transliteration is `oct.c` in the same directory.

### Worked example hand check (Cobra Mk III)
```
depth: bounding spans 130 x 34.9649 x 81.3726 -> two largest 130, 81.3726 -> size = 105.686 -> depth 5
radius = 0.5 + max |coord| = 65.5            (max |coord| = 65 = half of the 130 span)
terminal non-empty nodes at limit 5: 6 at level 4 (solid, folded) and 1,204 at level 5
volume = 6 * (65.5/16)^3 + 1204 * (65.5/32)^3 = 10,736.88   (float32: 10736.884765625)
mass   = 1.0 * 20 * volume = 214,737.6875
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed octree depth | Adaptive depth by mesh size (`ADAPTIVE_OCTREE_DEPTH 1`, `OOMesh.m:60`) with volume limited to 5 levels "for backwards compatibility" (`Octree.m:671-679`, Ahruman 2011-03-10) | 2011 | Big meshes (Coriolis) are built finer than they are measured |
| Source-comment masses | Runtime-computed mass | — | `455,223,200` (`ShipEntity.m:12504`) and `185580.0` (`PlayerEntity.m:191-192`, added 2011-04-26 by commit `b05f83cc8`) are historical; current meshes give 515,483,904 and 214,737.6875 |

**Deprecated/outdated:** the Phase 6 assumption that 455,223,200 is the Coriolis mass; it is a 2005-era comment value (assumed).

## Measured Results (the spike)

All numbers: `[VERIFIED: scratch run in the wegolite-ci image, scripts in the scratchpad dir above]`, produced with `docker compose run --rm -v <scratch>:/scratch test node /scratch/all.mjs` (JavaScript, float32 emulated) and cross-checked by a plain C float32 build (`gcc -O2 -ffp-contract=off` and `gcc -O2 -march=native -ffp-contract=fast`, run on the host because the image has no compiler; it is a scratch cross-check, not project evidence). C and JavaScript agree on every mass shown.

### Octree depth, volume and mass for all 16 vendored meshes (density 1.0, scale 1.0)

| Mesh | Faces | Depth | Root half-width | Terminal nodes (limit 5) | Volume (float32) | Mass (float32) | f64 vs f32 |
|------|-------|-------|-----------------|--------------------------|------------------|----------------|-----------|
| oolite_cobra3 | 1076 | 5 | 65.5 | L4: 6, L5: 1204 | 10736.884765625 | **214,737.6875** | 4.1e-8 |
| oolite_viper | 699 | 5 | 35.5344009 | L4: 9, L5: 1171 | 1702.033935546875 | **34,040.6796875** | -1.7e-7 |
| oolite_coriolis (hull) | 50 | 6 | 500.5 | L5: 2988 | 11432544 | **228,650,880** | 5.1e-8 |
| oolite_coriolis_faceplate | 1820 | 6 | 534.798 | L5: 624 | 2912754.75 | 58,255,096 | 1.2e-7 |
| oolite_coriolis_tris | 26 | 6 | 500.5 | L5: 2888 | 11049929 | 220,998,576 | 4.5e-8 |
| oolite_coriolis_dock | 330 | 5 | 250.5 | L5: 790 | 378966.0625 | 7,579,321 | 9.6e-8 |
| oolite_buoy (hull) | 896 | 5 | 58.2279 | L4: 222, L5: 3959 | 34552.21875 | 691,044.375 | 7.9e-8 |
| oolite_buoy_subents | 1808 | 5 | 24.3478 | L4: 8, L5: 804 | 382.33929443359375 | 7,646.7861328125 | 4.4e-8 |
| oolite_adder | 694 | 5 | 29.4523 | — | 802.274658203125 | 16,045.4931640625 | 2.8e-8 |
| oolite_cobramk1 | 731 | 5 | 35.5 | — | 2614.591796875 | 52,291.8359375 | 1.9e-8 |
| oolite_gecko | 1032 | 5 | 31.2379 | — | 1233.499755859375 | 24,669.99609375 | -1.2e-8 |
| oolite_krait | 1509 | 5 | 47.7038 | — | 4664.5703125 | 93,291.40625 | 5.9e-9 |
| oolite_mamba | 688 | 5 | 34.0581 | — | 1790.349609375 | 35,806.9921875 | -1.8e-7 |
| oolite_moray | 930 | 5 | 35.3507 | — | 2560.171875 | 51,203.4375 | -8.9e-8 |
| oolite_shuttle | 292 | 5 | 20.205 | — | 565.878173828125 | 11,317.5634765625 | -1.6e-8 |
| oolite_sidewinder | 762 | 5 | 32.1146 | — | 1254.381103515625 | 25,087.62109375 | -2.0e-7 |

Ships with no mesh subentity (`oolite_template_cobra3-player`, adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper: the resolved `subentities` lists hold flashers only or nothing; verified against `src/content/generated/ships.json`) have mass equal to the hull row.

**Composite masses (float32 running sum in `subentities` order):**
- Coriolis station = 228,650,880 + 58,255,096 + 220,998,576 + 7,579,321 = **515,483,904** (the exact sum 515,483,873 rounds to the float32 above).
- Navigation buoy (`buoy` and `buoy-witchpoint` share model and core subentity) = 691,044.375 + 7,646.7861328125 = **698,691.1875**.

### Float32 versus float64, depth, and quirks
- **Float32 vs float64:** the octree structure is identical; the volume sum differs by at most 2.03e-7 relative (largest: sidewinder). **Decision: float32 with `Math.fround` at every operation** (bit-identical to C on all 16 meshes, with and without FMA contraction, so cross-platform Oolite builds differ at most in the last float bit).
- **Depth/limit sensitivity (Cobra):** build 5 / limit 5 gives 214,737.6875; build 6 / limit 5 the same; build 6 / limit 6 gives 111,099.3; build 4 gives 425,359. The depth rule and the limit of 5 are therefore load-bearing (a wrong depth moves the mass by a factor of 2 or more).
- **Winding repair:** 0 swaps on all 16 meshes; masses identical with and without `checkNormalsAndAdjustWinding`.
- **Y-plane quirk:** removing it changes no mass.
- **Run time:** 12 to 94 ms per mesh in JavaScript; the whole set well under 1 s. No performance concern for the content build.

### Stated tolerance (recommended, to be copied into the constants ledger)
- **Golden and `assets:check`:** bit-exact float32 (the build is deterministic IEEE arithmetic).
- **Worked examples against an independent derivation** (leaf counts and radius, recomputed in float64): relative 1e-6 (about 5x the measured 2.03e-7 maximum and roughly 8 float32 ulps).
- **External corroboration** (community table below): equal after rounding to the nearest tonne.

### External oracle for the hull masses
`[CITED: https://wiki.alioth.net/index.php/VariableMasslock]` (community Elite Wiki, table "r = mass*0.02 + 17000", masses in tonnes, method not stated, so MEDIUM): Adder 16 t, Gecko 25, Sidewinder 25, Viper 34, Mamba 36, Moray 51, Cobra Mk I 52, Krait 93, Cobra Mk III 215 (Shuttle not listed). Our values rounded to tonnes: 16, 25, 25, 34, 36, 51, 52, 93, 215. All nine match. The page gives no Coriolis or buoy figure.

### The two source-comment constants
- `ShipEntity.m:12504` "coriolis station is mass 455,223,200": hull -49.77 %, full runtime mass +13.24 % (ratios 0.5023 and 1.1324). Hull + tris + dock = 457,228,800 (+0.44 %) and hull + tris = 449,649,472 (-1.2 %); no combination is exact. `[ASSUMED]` explanation: the comment predates the faceplate subentity and the current meshes.
- `PlayerEntity.m:191-192` fallback `return 185580.0;` for the Cobra base mass: current Cobra octree mass is +15.7 % above it. No depth/limit combination (16 tried) gives 185,580. `[ASSUMED]` stale; the wiki table (Cobra Mk III 215 t) agrees with the current mesh, not with 185,580. A web search also found a forum post quoting 185580 from a debug console for a fully equipped Cobra; unverified and not used.

## Jump blockage consequences (decision input for D-04)

`ShipEntity.m:12511`: `GLfloat k = 0.1;` and `:12528`: `if ((k * [ship mass] > d2) && (d2 < SCANNER_MAX_RANGE2))`. Blockage radius = `sqrt(0.1 * mass)`:

| Candidate Coriolis mass | Blockage radius | vs 455,223,200 | Existing test pins (6,700 m blocks, 6,800 m does not) |
|---|---|---|---|
| 455,223,200 (source comment, current) | 6,747.0 m | 0 % | pass |
| 515,483,904 (full runtime mass: hull + 3 subentities) | 7,179.7 m | +13.2 % | **fail at 6,800 m** (now blocks) |
| 228,650,880 (hull octree only) | 4,781.7 m | -49.8 % | **fail at 6,700 m** (no longer blocks) |

Only a mass in (448,900,000, 462,400,000) satisfies both pins. The comparison in D-04 therefore resolves to "outside tolerance, ask the owner" on either reading of "the Coriolis octree mass".

## Where the changes land

| File | Change |
|------|--------|
| `tools/oolite-ingest/convert/octree.ts` (new) | `octreeDepthFor`, `buildOctree`, `octreeVolume` (limit 5) in float32; constants with Oolite line citations |
| `tools/oolite-ingest/convert/ship-mass.ts` (new) | `shipMass(key, catalogue, meshes)`: density from `extras.density` (default 1.0), hull mass, ordered float32 sum of non-flasher subentity masses (recursive), throw on `model_scale_factor`, missing mesh, non-finite or non-positive result |
| `tools/oolite-ingest/generate.ts` (`readModels` at line 198, `emitted` list at lines 152-162) | `readModels` already loads and bounds-asserts all 16 `.dat` files (the union of `MODEL_SOURCE_FILES`); compute the mass map once from `catalogue` and `models`, pass to `emitNpcShips` and `emitClientShips` |
| `tools/oolite-ingest/convert/npc-ships.ts` (`compileNpcShips` lines 79-130, candidate at lines 111-118) | add `mass: masses.get(key)` to the candidate; the schema parse then enforces it; update the header comment ("Phase 10 adds the mass") |
| `src/content/schemas/ship-npc.ts` (`NpcShipSchema` lines 25-32) | `mass: z.number().positive()` and finite; keep `z.strictObject` |
| `src/content/schemas/ship.ts` (`CatalogEntrySchema` lines 81-91) | optional `mass` so the client entries type-check; `ShipCatalogue` consumers see it |
| `tools/oolite-ingest/convert/ships.ts` (`entryToJson` lines 497-509, `emitClientShips` lines 544-562) | write `mass` only for entries that have one; client entries get it from the map; `emitShipsFromCatalogue` stays unchanged (recommended) |
| `src/content/generated/ships-npc.json`, `ships-client.json`, `manifest.json` | regenerated with `docker compose run --rm assets`; never hand-edited |
| `src/sim/hyperspace/countdown.ts` (`CORIOLIS_STATION_MASS` line 55, its doc comment lines 48-54, the buoy paragraph in the header lines 19-24, `witchspaceStationMass` lines 63-65) | keep a literal (sim cannot import `src/content/ships*`); replace the value only after the owner decision; rewrite the comments (the comment says the figure is a "recorded figure and not a vendored config value") |
| `tests/sim/hyperspace-blockage.test.ts` (lines 106, 133-152, header lines 4-13) | add a test that reads `src/content/generated/ships-client.json` and asserts `CORIOLIS_STATION_MASS` equals the compiled Coriolis `mass` (one recorded value, no drift); move the 6,700/6,800 m pins if the owner picks a value outside the window |
| `tests/content/ships-npc.test.ts` (lines 88-90), `tests/content/ships-client.test.ts`, `tools/oolite-ingest/convert/npc-ships.test.ts` (line 113), `tests/golden/content/ships-npc.json` (`fields`, `examples`) | see Pitfall 6; the golden examples carry hand-derived masses for the Viper and the Cobra/Coriolis worked examples |
| `FIDELITY.md` + `tests/contract/fidelity.test.ts` | rows E-22/E-23 describe the Coriolis blockage and its mass (E-23 cites `ShipEntity.m:12504-12504` today); the contract requires a Wegolite cell of the form `` `src/...:line` `` (a `tools/` path is rejected by the cell regex), an Oolite cell `` `src/Core/...:a-b` `` with exactly one excerpt of at most 20 lines. Add rows for the mass formula (`ShipEntity.m:417-419`), the subentity addition (`:2034-2041`), the depth rule (`OOMesh.m:591-623`) and the volume limit (`Octree.m:669-681`), pointing the Wegolite cell at `src/content/schemas/ship-npc.ts` |
| `.planning/PROJECT.md` Key Decisions | the D-04 result (both numbers, the decision, the new blockage radius); update the 06-16 row's "data gaps" text for the buoy |
| `CHANGELOG.md` | `Changed` entry only if the blockage radius changes for the player (user-visible); the mass fields alone are internal |
| `NOTICE` / `ASSETS.md` | no new asset; masses are derived from already-recorded vendored sources. Confirm the existing `ships-npc`/`ships-client` rows still describe the files |

## Open Questions

1. **Coriolis blockage mass (owner decision, blocks the countdown change).**
   - What we know: hull 228,650,880; full runtime 515,483,904; comment value 455,223,200; the window that keeps today's tests is (448.9M, 462.4M).
   - What's unclear: whether the owner wants Oolite's computed runtime mass (7,180 m radius, faithful to Oolite as it runs today, re-pin the two distances, for example 7,100 m blocks and 7,300 m does not) or keeps 455,223,200 as a documented divergence (tests untouched, radius 6,747 m).
   - Recommendation: ask in Russian, plain terms, with both numbers and a recommendation. Recommend the computed 515,483,904, because the project is a faithful reimplementation and the subentity addition is certain from the source; the cost is one test re-pin and a 6.4 % larger blockage radius. Tell the owner the only unverified link is the real Oolite runtime value (no Oolite binary here); if they have Oolite installed, the debug console value of the main station's `mass` property would settle it `[ASSUMED]` (the `Ship.mass` JS property exists in Oolite; not checked in this session).
   - The plan must contain a `checkpoint:decision` task before the countdown constant and the blockage tests change, and a Key Decision row either way (D-04).

2. **Where the buoy's compiled mass lives (D-02 says "gets a mass", D-05 names only the NPC and client files).**
   - What we know: the buoy is not a role ship and is not in `NPC_SHIP_KEYS`; adding it there breaks the single-owner GLB check and the first-load budget spec (`tests/e2e/budget.spec.ts:70-90`); the client file would grow by about 2 KB for one entry (`buoy` is 2,048 bytes in `ships.json`); `buoy-witchpoint` has the same mass.
   - Recommendation: add `buoy` to `CLIENT_SHIP_KEYS` (three entries, code-unit sorted: `buoy`, `coriolis-station`, `oolite_template_cobra3-player`) and update `ships-client.test.ts`. This is a small extension of D-05; confirm with the owner together with Question 1. Fallback if the owner objects: record the buoy mass in `ships.json` only (build catalogue, not shipped) and let Phase 12 decide the runtime path.

3. **Success criterion 2 wording ("reproduce Oolite's mass within a stated tolerance").**
   - What we know: no Oolite runtime is available; the only external check is the whole-tonne wiki table for nine hulls; the two source-comment constants are not reproduced by the pinned meshes.
   - Recommendation: define the worked example as "Oolite's algorithm on the pinned mesh, recomputed independently, relative 1e-6", plus the wiki tonne check for the Viper and Cobra, and record in the ledger that 455,223,200 and 185,580 are historical and not reproduced, each with the measured ratio. State this wording in the plan so the verifier does not expect an Oolite runtime oracle.

4. **`ships-client.test.ts` "copies each entry unchanged from the complete catalogue".**
   - Options: (a) compare entries with `mass` removed and add a separate mass assertion (recommended, minimal, leaves the 706 KB `ships.json` and its golden untouched); (b) give `ships.json` a mass for every entry whose whole mesh set is vendored (larger change, touches the full golden and adds masses nobody asked for).

5. **Density and scale.** None of the 12 shipdata keys nor the four subentity entries authors `density` or `model_scale_factor` (resolved catalogue read this session; the only `density` keys in `shipdata.plist` are on asteroid templates at lines 545 and 963 and a training buoy at line 1103). Implement density (cheap, one lookup) and throw on a scale; revisit only with a snapshot bump.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The comment constants 455,223,200 and 185,580 are stale because the models changed since (the faceplate and a higher-polygon Cobra were added later) | Measured Results | Low: the decision rests on the computed numbers, not on why the old ones differ |
| A2 | Real Oolite at the pinned commit reports 515,483,904 for the Coriolis `mass` property | Open Question 1 | Medium: no runtime oracle here; the code path is read, not run; the owner can check in the debug console |
| A3 | `Ship.mass` is readable from Oolite's JS debug console | Open Question 1 | Low: only affects the suggested owner check |
| A4 | A Cobra-sized wiki table value (215 t) comes from Oolite's own runtime mass | External oracle | Low: independent of the algorithm; matches our value for nine ships |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + `wegolite-ci` image | All tests, `assets:check`, scratch runs | yes | image built 4 days ago | `docker compose build` |
| Node 24 (in image) | Port and tests | yes (container) | `node:24-bookworm-slim` | — |
| Oolite checkout `/home/opencode/git/oolite` | Behaviour reference | yes | HEAD `4bb1f53de`; pin `7437f22` is an ancestor with no diff in the files used | — |
| gcc (host) | Scratch C cross-check only | yes | system gcc | none needed for the deliverable |
| Oolite binary | Runtime oracle | no | — | wiki table for nine hulls; owner debug-console check for the Coriolis |

**Missing dependencies with no fallback:** none for planning or implementation.
**Missing dependencies with fallback:** the Oolite runtime (see above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (`vitest run --coverage` via `npm test`) |
| Config file | `/home/opencode/git/wegolite/vitest.config.ts` (coverage includes `src/content/**`; excludes `src/content/generated/**`) |
| Quick run command | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/octree.test.ts tools/oolite-ingest/convert/ship-mass.test.ts tools/oolite-ingest/convert/npc-ships.test.ts tests/content tests/sim/hyperspace-blockage.test.ts tests/contract/fidelity.test.ts` |
| Full suite command | `docker compose run --rm test` |
| Drift gate | `docker compose run --rm assets npm run assets:check` |

### Phase Requirements to Test Map
| Req ID / criterion | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-11 / SC1 | Depth rule: spans 130x35x81 gives 5; 1000x1000x996 gives 6; < 20 gives 4; >= 1800 gives 7 | unit | `... vitest run tools/oolite-ingest/convert/octree.test.ts` | Wave 0 |
| DATA-11 / SC1 | Synthetic cube of half-width h: radius `0.5 + h`, hand-derived volume; empty mesh and NaN vertex throw | unit | same | Wave 0 |
| DATA-11 / SC1 | Each of the 16 meshes: float32 mass equals the pinned value in the Measured Results table (golden) | unit | `... vitest run tools/oolite-ingest/convert/ship-mass.test.ts` | Wave 0 |
| DATA-11 / SC1 | NPC records and the two client entries carry `mass`; strict schema rejects missing, zero, negative, non-finite | unit | `... vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts tests/content/ships-client.test.ts` | exists, edit |
| DATA-11 / SC2 | Worked examples Cobra 214,737.6875, Viper 34,040.6796875, Coriolis 515,483,904 re-derived from leaf counts and radius in float64 within relative 1e-6; wiki tonne rounding for the nine hulls | unit | `ship-mass.test.ts` | Wave 0 |
| DATA-11 / SC2 | Constants-ledger rows with Oolite excerpts | contract | `... vitest run tests/contract/fidelity.test.ts` | exists, edit |
| DATA-11 / SC3 | `CORIOLIS_STATION_MASS` equals the compiled Coriolis `mass`; blockage pins pass with the owner-chosen value | unit | `... vitest run tests/sim/hyperspace-blockage.test.ts` | exists, edit |
| DATA-11 / SC4 | No octree data in any bundle: generated files contain only `mass`; `src/sim` imports no octree code (existing purity and content-boundary guards) | guard | `... vitest run tests/guards` | exists |
| DATA-11 / SC4 | A changed mesh or octree rule fails the drift gate | gate | `docker compose run --rm assets npm run assets:check` | exists |

### Sampling Rate
- **Per task commit:** the quick run command (or the single new file).
- **Per wave merge:** `docker compose run --rm test`, `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm assets npm run assets:check`.
- **Phase gate:** the four above green. Per AGENTS.md the phase touches only `tools/`, `src/content/` schemas, one `src/sim` constant and tests, so `verify` (browser smoke) is not required; do not run `verify-full` (owner gate policy for pure-logic plans on this slow machine). If the Coriolis blockage value changes, the existing e2e blockage coverage, if any, should be searched (`rg -n "6700|blocked" tests/e2e`) and run through the targeted `e2e` spec only.

### Wave 0 Gaps
- [ ] `tools/oolite-ingest/convert/octree.test.ts`: depth rule, synthetic volumes, guards, f32/f64 structure equality.
- [ ] `tools/oolite-ingest/convert/ship-mass.test.ts`: the 16-mesh golden, composite masses, wiki tonne check, scale/density guards.
- [ ] Golden update `tests/golden/content/ships-npc.json` (`fields` gains `mass`, examples carry mass).
- [ ] Framework install: none.

## Security Domain

`security_enforcement` is enabled (ASVS level 1, block on high). The phase is build-time tooling over vendored data plus one numeric constant; there is no network, auth, session or user input at runtime.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Existing `parseDat` bounds (`MAX_MESH_COUNT = 200_000`, index range, finite numbers); new guards: finite vertices, at least one non-degenerate triangle, finite positive mass, strict zod schema on every emitted record |
| V6 Cryptography | no | The manifest SHA-256 is the existing content hash; unchanged |
| V12 Files / V14 Config | yes (light) | Inputs resolve under `third_party/oolite/` via `resolveSnapshotFile`; no new path is derived from parsed data |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed or hostile `.dat` after a snapshot bump (NaN, huge counts, degenerate faces) causing a wrong or non-finite mass | Tampering | Fail the build with `contentError`; `MESH_BOUNDS` assertion already runs before conversion; schema `positive` and finite |
| Resource exhaustion in the octree build (triangle splitting multiplies pieces) | Denial of service | Recursion depth capped at 7 by the depth rule; face count capped by `MAX_MESH_COUNT`; measured 12-94 ms per mesh |
| A silently wrong mass changing mass lock and blockage | Tampering | Golden masses plus `assets:check`; the sim constant pinned to the compiled number by a test |
| Octree data leaking into the bundle (first-load size) | — | Octree is never serialised; generated files gain one number per record only |

## Project Constraints (from AGENTS.md; no `./CLAUDE.md` exists, `.claude/` holds only worktrees)

- Everything runs in Docker; a green host run is not evidence. Commands: `docker compose run --rm test`, `... test npx vitest run <file>`, `docker compose run --rm assets npm run assets:check`, `... lint`, `... typecheck`, `... verify`.
- Scratch scripts live under `/tmp` and are mounted with `-v`; never add scratch files to the repository.
- `src/sim` must not import Three.js or touch the DOM; it reads only the compiled number, and `src/content/ships*` is denied to it by ESLint.
- Generated content is never hand-edited; regenerate with `docker compose run --rm assets`.
- Do not add a database; no octree data in any bundle.
- Licensing: derived data from CC BY-NC-SA Oolite sources, provenance already recorded; no new asset is added.
- Record significant decisions in `.planning/PROJECT.md` Key Decisions; user-visible changes go under `## [Unreleased]` in `CHANGELOG.md`.
- Documentation in English. Use codebase-memory and `rg`; Oolite reference checkout is at `/home/opencode/git/oolite` (read behaviour there, consume data from `third_party/oolite/`).
- Owner communication style: ask in Russian, plain SRE/devops terms, with a recommendation (memory); scope to the necessary technical minimum.

## Sources

### Primary (HIGH confidence)
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m` lines 261, 417-419, 790-849, 2028-2045, 5779-5792, 7810-7811, 8193, 12498-12531 (read this session; unchanged since pin `7437f22`)
- `/home/opencode/git/oolite/src/Core/OOMeshToOctreeConverter.m` (whole file), `Octree.m` lines 634-681 and 795-878, `Octree.h` lines 31 and 82, `OOMesh.m` lines 60-70, 591-662, 1080-1230, 1441-1532, 1786-1848, `OOTriangle.h`, `OOBoundingBox.h`, `OOMaths.h:49`
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` lines 181-196 and 6544-6565, `StationEntity.m` 569-600 and 658-700, `DockEntity.m` 1115-1127, `Universe.m` 3694-3791
- Project files read this session: `tools/oolite-ingest/{generate,convert/npc-ships,convert/ships,convert/dat,convert/glb}.ts`, `src/content/{ships,ships-npc,schemas/ship,schemas/ship-npc}.ts`, `src/sim/hyperspace/countdown.ts`, `tests/sim/hyperspace-blockage.test.ts`, `tests/content/ships-{npc,client}.test.ts`, `tests/contract/fidelity.test.ts`, `FIDELITY.md`, `compose.yaml`, `vitest.config.ts`
- Scratch port, plain-C cross-check and outputs in `/tmp/claude-1027/-home-opencode-git-wegolite/f3d9eaee-f973-4cf3-a107-a779150cce77/scratchpad/oct/` (`octree.mjs`, `all.mjs`, `worked.mjs`, `oct.c`, `out.json`)

### Secondary (MEDIUM confidence)
- https://wiki.alioth.net/index.php/VariableMasslock (community Elite Wiki; ship mass table, CC BY-NC-SA 4.0; method not stated)

### Tertiary (LOW confidence)
- A forum search hit quoting a Cobra Mk III mass of 185580 from the debug console (not fetched; not relied on)

## Metadata

**Confidence breakdown:**
- Standard stack / approach: HIGH (no new dependency; algorithm read in full and executed twice)
- Hull masses: HIGH (two implementations agree bit for bit; nine external whole-tonne matches)
- Coriolis and buoy composites: MEDIUM (subentity addition is certain from source; no runtime value to compare)
- Architecture and file changes: HIGH (files read; existing tests that must change are listed)
- Pitfalls: HIGH

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (stable; invalidated by an Oolite snapshot bump or a change to the vendored `.dat` files)
