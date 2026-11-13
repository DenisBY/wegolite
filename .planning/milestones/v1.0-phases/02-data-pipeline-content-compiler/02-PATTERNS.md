# Phase 2: Data Pipeline & Content Compiler — Pattern Map

**Mapped:** 2026-11-03
**Files analyzed:** 52 classified rows — 39 to create, 10 to modify, 3 checked and needing no change — plus 61 vendored data files grouped into 3 rows
**Analogs found:** 41 rows with a tracked analog (7 exact, 14 role-match, 20 partial) / 11 rows with no close analog

**Scope of the repo at mapping time.** Phase 1 is complete and the tree is genuinely small: `src/{main.ts,sim/*,render/*}`, `tests/{compliance,contract,golden,guards,e2e}`, `scripts/*.sh`, and the build config. There is **no** `tools/`, `src/content/`, `third_party/`, zod, tsx, GLB, or image code anywhere in the repository. Everything below that is marked *partial* or *no analog* is honest: the planner must write it from RESEARCH.md's verified excerpts, not pretend to copy it.

**Tracked-source gate.** Every analog path named below was verified with `git ls-files -- <path>` and is tracked. No `.gsd/`, `node_modules/`, `dist/`, or other install/runtime mirror is cited.

**Authority order:** `02-CONTEXT.md` (decisions) > `02-RESEARCH.md` (verified Oolite + determinism facts) > tracked repo code (style and wiring) > this document.

---

## File Classification

Role/data-flow vocabulary for this phase: `cli`, `service`, `utility`, `schema`, `data`, `test`, `fixture`, `script`, `config`, `docs`, `compliance`, `generated-asset`, `vendored-input`.

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `third_party/oolite/SOURCE.md` | docs | provenance | `ASSETS.md` (provenance prose) | role-match |
| `third_party/oolite/LICENSE-oolite.txt` | compliance | static text | `LICENSE` (canonical text, checksummed) | role-match |
| `third_party/oolite/Config/*.plist` (40) | vendored-input | data | none — no vendored data in repo | none |
| `third_party/oolite/Models/*.dat` (5) | vendored-input | data | none | none |
| `third_party/oolite/Textures/*.png` (16) | vendored-input | data | `public/.gitkeep` (asset root only) | none |
| `scripts/vendor-oolite.sh` (create) | script | batch / network-once | `scripts/check-verify-fails-fast.sh` | role-match |
| `ASSETS.md` (**modify**) | compliance | provenance table | `ASSETS.md` itself + `tests/compliance.test.ts:130-138` pin | exact (edit in place) |
| `tools/oolite-ingest/cli.ts` | cli | batch, exit-code contract | `scripts/check-verify-fails-fast.sh` + `src/main.ts` | partial |
| `tools/oolite-ingest/content-error.ts` | utility | error construction | `src/main.ts:49-67` + `tests/contract/container-contract.test.ts:56-88` | partial |
| `tools/oolite-ingest/openstep/tokenizer.ts` | service | streaming transform (text→tokens) | `tests/contract/container-contract.test.ts:56-88` `parseServices` | partial |
| `tools/oolite-ingest/openstep/parser.ts` | service | recursive transform | same `parseServices` state-machine shape | partial |
| `tools/oolite-ingest/openstep/plist-value.ts` | model | tagged union | `src/sim/state.ts:12-27` (data contracts as interfaces) | role-match |
| `tools/oolite-ingest/openstep/index.ts` | utility | barrel re-export | no barrel exists; `src/sim/*.ts` direct imports are the convention | none |
| `tools/oolite-ingest/like-ship.ts` | service | graph resolution | none (no graph code) — invariance test analog `src/sim/cadence.test.ts:52-56` | none |
| `tools/oolite-ingest/canonical/json.ts` | utility | transform → canonical bytes | `src/sim/state.ts:38-50` + `src/sim/hash.ts:23-35` | role-match |
| `tools/oolite-ingest/canonical/hash.ts` | utility | hashing | `tests/compliance.test.ts:81-85` | exact (API) |
| `tools/oolite-ingest/manifest.ts` | service | transform + hashing | `src/sim/state.ts` canonical record + `tests/golden/kinematic-probe.json` versioning | partial |
| `tools/oolite-ingest/convert/commodities.ts` | service | CRUD (read → project → emit) | `src/render/camera-relative.ts` (pure transform module) | role-match |
| `tools/oolite-ingest/convert/systems.ts` | service | CRUD + chunking | `src/render/camera-relative.ts` | role-match |
| `tools/oolite-ingest/convert/equipment.ts` | service | CRUD (positional tuples) | `src/render/camera-relative.ts` | role-match |
| `tools/oolite-ingest/convert/labels.ts` | service | CRUD (array projection) | `src/render/camera-relative.ts` | role-match |
| `tools/oolite-ingest/convert/ships.ts` | service | transform + graph join | `src/render/camera-relative.ts` + `like-ship.ts` | partial |
| `tools/oolite-ingest/convert/dat.ts` | service | file-I/O + parsing | `tests/compliance.test.ts:63-77` (walk) + `parseServices` (scanner) | partial |
| `tools/oolite-ingest/convert/glb.ts` | service | binary serialisation | `src/sim/hash.ts:13-21` (only byte-loop in repo) | none |
| `tools/oolite-ingest/convert/textures.ts` | service | file-I/O + binary transform | `tests/compliance.test.ts:18-20,81-85` | partial |
| `src/content/schemas/*.ts` | schema | validation contract | none (zod absent); interface style from `src/render/camera-relative.ts:15-25` | none |
| `src/content/types.ts` | model | type-only barrel | `src/sim/state.ts:4-6` (`import type` + `.js` specifier) | role-match |
| `src/content/index.ts` | service | startup validation | `src/main.ts:49-67` (fail-loud helpers) | role-match |
| `src/content/generated/**` | data (generated) | emitted bytes | `tests/golden/kinematic-probe.json` (committed fixture, versioned) | partial |
| `public/models/*.glb` | generated-asset | binary | `public/.gitkeep` | none |
| `public/textures/*.png` | generated-asset | binary | `public/.gitkeep` | none |
| `tools/oolite-ingest/openstep/parser.test.ts` | test | fixture-driven unit | `tests/golden/kinematic-probe.test.ts` + `tests/guards/sim-purity.test.ts` | role-match |
| `tools/oolite-ingest/like-ship.test.ts` | test | golden + property | `src/sim/cadence.test.ts` (invariance) | role-match |
| `tools/oolite-ingest/canonical/json.test.ts` | test | unit | `src/sim/cadence.test.ts:67-71` (throw cases) | role-match |
| `tools/oolite-ingest/convert/{commodities,systems,equipment,ships}.test.ts` | test | golden | `tests/golden/kinematic-probe.test.ts` | exact (shape) |
| `tools/oolite-ingest/convert/dat.test.ts` | test | golden + fixture | `tests/golden/kinematic-probe.test.ts` | role-match |
| `tools/oolite-ingest/convert/glb.test.ts` | test | binary + independent reader | `tests/compliance.test.ts:81-85` (hash of bytes) | partial |
| `tools/oolite-ingest/drift.test.ts` | test | negative proof | `tests/guards/sim-purity.test.ts:42-57` | exact (shape) |
| `tests/compliance-assets.test.ts` | test | compliance walk | `tests/compliance.test.ts:63-77,169-182` | exact |
| `tests/fixtures/{plist,shipdata,dat}/*` | fixture | malformed inputs | `tests/golden/kinematic-probe.json` (committed fixture) | role-match |
| `tests/fixtures/textures/*.png` | fixture | binary | none | none |
| `tests/golden/content/*.json` | fixture | pinned expectations | `tests/golden/kinematic-probe.json` | role-match |
| `scripts/check-arch-determinism.sh` | script | container batch + diff | `scripts/check-verify-fails-fast.sh` | exact (shape) |
| `package.json` (**modify**) | config | build-config | itself; strings pinned at `tests/contract/container-contract.test.ts:264-269` | exact |
| `compose.yaml` (**modify**) | config | orchestration | `compose.yaml:42-44` (service) + `:64-78` (chain) | exact |
| `vitest.config.ts` (**modify**) | config | test discovery | `vitest.config.ts:10-21` | exact |
| `eslint.config.js` (**modify**) | config | import zones / banned APIs | `eslint.config.js:59-119` (sim zone) | exact |
| `.prettierignore` (**modify**) | config | ignore list | `.prettierignore:1-10` | exact |
| `tests/contract/container-contract.test.ts` (**modify**) | test | contract pins | itself | exact |
| `AGENTS.md`, `README.md` (**modify**) | docs | command contract | existing command tables | exact |
| `NOTICE` (**modify, optional**) | compliance | attribution | `NOTICE` prose pinned by `tests/compliance.test.ts:99-127` | exact |
| `.gitignore`, `.dockerignore` | — | — | **no change required** (generated output is committed) | n/a |
| `tsconfig.json`, `tsconfig.sim.json`, `Dockerfile` | — | — | **no change required** (`tools/**/*.ts` already included; deps come via `npm ci`) | n/a |

---

## Pattern Assignments

### 1. Canonical output — `tools/oolite-ingest/canonical/json.ts`

**Analog:** `src/sim/state.ts:38-50` (**tracked**) and `src/sim/hash.ts:23-35` (**tracked**).

**Why the analog matters:** Phase 1 already made "one canonicaliser, never `JSON.stringify`" a repo rule. Copy the *discipline* and the documentation style exactly. Do **not** copy `canon()`'s `toFixed` implementation — RESEARCH §P6.1 bans `toFixed` in the generator.

**Analog — canonical serialiser with rationale (state.ts:38-50):**

```ts
/**
 * Canonical labelled text: fixed key order, one record per line, every number
 * through `canon`. Never `JSON.stringify` — property order and float formatting
 * would drift and silently weaken the golden fixtures (D-11).
 */
export function serialize(state: SimState): string {
  return [
    `tick=${canon(state.tick, 0)}`,
    // ...
  ].join("\n");
}
```

**Analog — the throw-don't-format rule (hash.ts:23-35):**

```ts
export function canon(n: number, digits = 6): string {
  if (!Number.isFinite(n)) {
    throw new Error(`non-finite value in state: ${String(n)}`);
  }
  const r = Number(n.toFixed(digits));
  return (r === 0 ? 0 : r).toFixed(digits);
}
```

**What to write instead** (RESEARCH §P6.1 + Code Examples:1144-1162):

```ts
// tools/oolite-ingest/canonical/json.ts
export function canonicalNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`non-finite number: ${String(n)}`);
  if (Object.is(n, -0)) return "0";
  return String(n); // shortest round-trip; architecture-independent
}
```

Hard rules to encode in the module doc comment, mirroring the analog's style:
sorted keys by **code-unit** comparison (`a < b ? -1 : ...`, never `localeCompare`), 2-space indent, `\n`, final newline, UTF-8 with literal non-ASCII, no timestamps/host paths/versions, arrays instead of objects with integer-like keys.

**Divergence the planner must state:** the sim's `canon()` is fixed-precision and deliberately reused nowhere in the pipeline.

---

### 2. Hashing — `tools/oolite-ingest/canonical/hash.ts`

**Analog:** `tests/compliance.test.ts:26-27,81-85` (**tracked**) — the repo's only `node:crypto` usage.

```ts
const CANONICAL_GPL2_MD5 = "570a9b3749dd0463a1778803b12a6dce";

// ...
const digest = createHash("md5")
  .update(readFileSync(join(REPO_ROOT, "LICENSE")))
  .digest("hex");
```

**Apply:** identical shape, `"sha256"` instead of `"md5"`, `node:crypto` imported at the top of a tools-only module. Keep `src/sim/hash.ts`'s FNV-1a untouched — the sim may never import `node:crypto` (RESEARCH §Standard Stack).

---

### 3. Structured failure — `tools/oolite-ingest/content-error.ts`

**Analogs:**
- `src/main.ts:49-67` (**tracked**) — fail-loud helper with a contextual, named error and `{ cause }`.
- `tests/contract/container-contract.test.ts:56-61,93-98` (**tracked**) — errors that name the exact artefact and construct.
- `src/sim/hash.ts:29-32` (**tracked**) — throw instead of emitting a valid-looking value.

**Analog — named, actionable failure (main.ts:49-67):**

```ts
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      `Wegolite: expected an element with id "${id}", but it is missing.`,
    );
  }
  return element;
}
```

**Analog — error message names file and construct (container-contract.test.ts:56-61):**

```ts
const start = lines.findIndex((line) => /^services:\s*$/.test(line));
if (start < 0)
  throw new Error("compose.yaml has no top-level services: block");
```

**Analog — wrapping a foreign failure without losing the cause (main.ts:80-86):**

```ts
} catch (cause) {
  throw new Error(
    "WebGL2 is required to run Wegolite: the browser could not create a WebGL2 context.",
    { cause },
  );
}
```

**What to write:** one `class ContentError extends Error` with the RESEARCH §P6.6 fields, plus `isContentError()`; a `formatContentError()` used only by the CLI. Note repo-wide `exactOptionalPropertyTypes: true` (tsconfig.json:10) — declare `line?: number` and never assign `undefined` explicitly.

**No exact analog:** the repo has no custom error class; this is a *new* shared pattern, and it is the only sanctioned way tools report failure (D-17).

---

### 4. OpenStep tokenizer/parser — `tools/oolite-ingest/openstep/{tokenizer,parser,plist-value}.ts`

**Analog (partial):** `tests/contract/container-contract.test.ts:56-88` (**tracked**) — the repo's only hand-written text scanner. Copy its *shape*, not its line-based strategy.

```ts
function parseServices(compose: string): Map<string, string> {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => /^services:\s*$/.test(line));
  if (start < 0)
    throw new Error("compose.yaml has no top-level services: block");

  const services = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== null) services.set(current, buffer.join("\n"));
  };

  for (let index = start + 1; index < lines.length; index++) {
    // ...
  }
  flush();

  if (services.size === 0) {
    throw new Error("compose.yaml services: block parsed to zero services");
  }
  return services;
}
```

**Patterns to carry over:**
1. **`Map`, not object literals**, for parsed dictionaries — the analog uses `Map<string, string>`, which is also the RESEARCH §Security mitigation for `__proto__` keys.
2. **Vacuity guard at the end** (`if (services.size === 0) throw`) — mirror it as "a file that parses to nothing is an error unless it is the known-empty `gui-settings.plist`".
3. **Named errors with the construct** — same as §3.
4. **Deliberately small, documented subset parser** — the analog's comment justifies avoiding a YAML dependency; do the same for plists (`plist` package is XML/binary only; `@plist/openstep.parse` lacks line/column and octal escapes).

**Where the analog is wrong for this job:** it splits on `\n` up front. Oolite's grammar allows `=` and `{` to be separated by a newline (`shipdata.plist:1226-1227`), so the real tokenizer must be a character scanner with line/column state, four states, and a token stream (RESEARCH §P2.3, Code Examples:1166-1188). Use RESEARCH's tokenizer sketch verbatim as the implementation contract.

**`plist-value.ts` analog:** `src/sim/state.ts:12-27` (**tracked**) shows the repo's interface-as-data-contract style — no methods, no classes, documented invariants:

```ts
export interface SimState {
  tick: number;
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
}
```

**`index.ts` barrel:** no barrel modules exist anywhere in the repo (imports are direct, `./hash.js`). Prefer **direct imports** and drop the barrel, or keep it as a 3-line re-export; do not make it the only import path.

---

### 5. `like_ship` resolver — `tools/oolite-ingest/like-ship.ts`

**No analog.** Nothing in the repo resolves references, detects cycles, or merges dictionaries. Use RESEARCH §P3.2 (verbatim merge rules), §P3.3 (cycle/dangling), and Code Examples:1194-1227 as the specification.

**Test-shape analog — invariance instead of exact values:** `src/sim/cadence.test.ts:52-56` (**tracked**) shows how this repo asserts an order/parameter independence property:

```ts
it("hashes identically at 30, 60, 120 and 144 Hz when driven by step count", () => {
  const hashes = new Set([30, 60, 120, 144].map(replay));
  expect(hashes.size).toBe(1);
});
```

Mirror it exactly for "shuffle entry insertion order ⇒ identical canonical output", and use `fast-check` for the generator. The negative-path style is `src/sim/cadence.test.ts:67-71`:

```ts
it("rejects a non-finite state instead of hashing it", () => {
  const state = initState();
  state.position = { x: Number.NaN, y: 0, z: 0 };
  expect(() => hashState(state)).toThrow(/non-finite/);
});
```

**Non-negotiable rules to restate in the module header** (RESEARCH §P3): shallow merge only; strip `like_ship`; `display_name`/`is_template` only when the **child** declares them (presence test `!== undefined && !== null`, not `typeof === "string"` — the Cobra declares `is_template = 1`); five alias pairs; overrides applied **before** resolution and never adding entries.

---

### 6. Entity converters — `tools/oolite-ingest/convert/{commodities,systems,equipment,labels,ships}.ts`

**Analog:** `src/render/camera-relative.ts:4-34` (**tracked**) — the repo's model "one pure module, one job, typed input, typed output, doc comment stating the invariant".

```ts
/**
 * Absolute simulation coordinates are float64 metres. GPU upload is float32,
 * where a coordinate at 1.4e6 m has a unit-in-the-last-place of 0.125 m — far
 * too coarse to hold a ship steady. This module is the one place where absolute
 * world coordinates become render coordinates: the subtraction happens in JS
 * doubles *before* any float32 upload, so the small difference keeps its
 * precision.
 *
 * Nothing else may turn world coordinates into render coordinates.
 */

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function cameraRelative(world: Point3, camera: Point3): Point3Delta {
  return {
    x: world.x - camera.x,
    y: world.y - camera.y,
    z: world.z - camera.z,
  };
}
```

**Apply to each converter:**
- Module header states the single responsibility and the source file it compiles (`third_party/oolite/Config/trade-goods.plist` etc.) and the D-decision it implements.
- `readonly` on input/projection fields; no `any`.
- Pure function `(parsed: PlistValue) => TypedRecord[]`; **all** file reading and writing stays in `cli.ts` / a small `io` helper so converter tests never touch the snapshot.
- One file per entity, one exported `compile*` function, matching the file naming already in the research tree.

**Import and I/O conventions to copy from tracked code:**
- `src/sim/state.ts:4-6` (**tracked**) — explicit `.js` specifiers and `import type` for types:
  ```ts
  import { canon, fnv1a32 } from "./hash.js";
  import type { Quat, Vec3 } from "./math.js";
  ```
  This is mandatory: `verbatimModuleSyntax` + `isolatedModules` are on (tsconfig.json:11,15) and `tsx` resolves `.js` literally against `.ts` sources.
- `tests/compliance.test.ts:24,44-46` (**tracked**) — `node:fs` + `node:path` with a `REPO_ROOT = process.cwd()` anchor and a tiny `read()`/`readJson()` pair. Reuse this shape for any reading the converters do.
- `tests/compliance.test.ts:48-54` (**tracked**) — whitespace normalisation helper, useful for the `system_description`/`descriptions.plist` templates:
  ```ts
  function readProse(relativePath: string): string {
    return read(relativePath).replace(/\s+/g, " ");
  }
  ```

**`noUncheckedIndexedAccess: true`** (tsconfig.json:9) means every `arr[i]` is `T | undefined`. Equipment's 6-element positional tuples are exactly where this bites: destructure through a small `tuple6()` guard that throws `SCHEMA` on a short array, rather than sprinkling `!`.

---

### 7. `.dat` parser — `tools/oolite-ingest/convert/dat.ts`

**Analogs (partial, two halves):**
- Text scanning: `tests/contract/container-contract.test.ts:56-88` (as in §4).
- Deterministic directory walking plus extension dispatch: `tests/compliance.test.ts:32-42,63-77` (**tracked**):

```ts
const SKIP_DIRECTORIES = new Set([
  "node_modules", "dist", "test-results", "playwright-report", ".git", ".planning",
]);
const SOURCE_EXTENSIONS = [".ts", ".js", ".sh"];

function collectSourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      collectSourceFiles(join(directory, entry.name), found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
      continue;
    found.push(join(directory, entry.name));
  }
  return found;
}
```

**Divergence to record:** the analog iterates in filesystem order. The generator must `.sort()` every directory listing before it affects output or hashing (RESEARCH §P6.4).

**What the parser must contain** (RESEARCH §P4.1-P4.3, no analog): split on `/[,\s]+/`; `NVERTS`/`NFACES`/`VERTEX`/`FACES`/`TEXTURES`/`NAMES`/`NORMALS`/`TANGENTS`/`END`; `> 3` truncation warns, `< 3` hard-fails; three normal modes (`explicit → smooth → per-face`); per-component winding repair with UV swap, applied in both legacy modes (per-face **and** smooth, mirroring `IsLegacyNormalMode`), with a zero face normal assigned `vector_flip(calc)` before the sign test; bbox assertions; caps on `NVERTS`/`NFACES` (security table).

---

### 8. GLB writer — `tools/oolite-ingest/convert/glb.ts`

**No analog.** There is no binary serialiser in the repo. The only byte-level code is `src/sim/hash.ts:13-21` (**tracked**), which is worth copying for its *integer discipline*, not its structure:

```ts
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    // Math.imul, never `*`: a double multiply loses the low bits.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
```

Carry over: explicit `>>> 0`, explicit `& 0xff`, and a comment naming the trap. For the GLB: `Uint8Array`/`DataView`, `writeUint32LE`, 4-byte padding (`0x20` for JSON, `0x00` for BIN), fixed `asset.generator = "wegolite-oolite-ingest/1"`, no `Date`, no `Math.random`. Use RESEARCH §P5.5 and the Code Examples “`.dat` coordinate conversion” and “GLB container” blocks as the contract (keep the authored corner order `c0, c1, c2`; the Z reflection alone yields glTF CCW).

**Reader/writer split:** writer is ours; `@gltf-transform/core` `NodeIO.readBinary` is a **test-only** dependency.

---

### 9. Texture copy + emissive bake — `tools/oolite-ingest/convert/textures.ts`

**Analog (partial):** `tests/compliance.test.ts:18-20,44-46,81-85` (**tracked**) — the repo's only `node:fs` + `node:crypto` pipeline (`readFileSync` → `createHash` → `digest("hex")`). Reuse the pattern for "read bytes, hash bytes, write bytes", and keep every step inside `try/finally` cleanup-free (the file is either written or the build fails).

**No analog** for PNG/ZLIB. Implement RESEARCH Code Examples:1255-1266: parse `IHDR`, `zlib.inflateSync(IDAT)`, unfilter rows, grey = alpha, emit colour-type 0, filter 0/scanline, `deflateSync(raw, { level: 9, strategy: Z_FIXED, memLevel: 9, windowBits: 15 })`, CRC32 per chunk. Missing/unreadable texture ⇒ `TEXTURE_MISSING` naming file, ship, material, expected path (D-21).

---

### 10. Manifest — `tools/oolite-ingest/manifest.ts`

**Analogs:** `src/sim/state.ts:38-50` (canonical record writer) and `tests/golden/kinematic-probe.json` + `tests/golden/kinematic-probe.test.ts:18-24` (**tracked**) — the repo's convention for a **versioned** committed artefact:

```ts
interface Fixture {
  version: number;
  dt: number;
  targetSteps: number;
  script: readonly InputFrame[];
  expected: { algorithm: string; hash: string };
}
```

**Apply:** `schemaVersion: 1` is the same idea as `version: 1` — a future shape change must fail loudly rather than silently re-baseline. Manifest `files[]` sorted by `path` in code-unit order, one row per emitted artefact (JSON, GLB, copied PNG, baked PNG), `oolite.retrieved` asserted literally, not `new Date()`.

**Runtime counterpart (`src/content/index.ts`) analog:** `src/main.ts:49-67` (fail-loud `requireElement`/`requireCanvas`). The app boundary must throw a named error on a missing/mismatched manifest entry rather than boot to a blank screen — same posture as the WebGL2 boot errors at `src/main.ts:80-96`.

---

### 11. zod schemas and type surface — `src/content/schemas/*.ts`, `src/content/types.ts`

**No zod analog** — zod is not installed. Interface *style* comes from `src/render/camera-relative.ts:15-25` (**tracked**, `readonly` fields) and `src/sim/state.ts:12-27`.

**Recommendation on the RESEARCH structure's ambiguity.** The tree lists both `tools/oolite-ingest/schemas/` and `src/content/schemas/*.ts`. D-16 makes the schema the single source of truth for types, so keep **one** home: `src/content/schemas/<entity>.ts`, imported by the tools. `src/content/types.ts` then does exactly this, following `src/sim/state.ts:4-6`:

```ts
import type { z } from "zod";
import type { SystemSchema } from "./schemas/system.js";
export type System = z.infer<typeof SystemSchema>;
```

(The zod import and usage are type-position only, so the sim's `lib: ["ES2022"]`, `types: []` project still passes — RESEARCH §Pitfall 13.)

**Schema rules to encode** (RESEARCH §Pitfall 12): `.passthrough()`/`z.record` on raw Oolite dictionaries, `conditions`, and `extras`; `.strict()` **only** on our own output records. Open records must never reject tomorrow's bump.

**Type-only boundary:** no `export const` in `types.ts`, no runtime import of zod. Extend the guard (§Shared S-5) with a probe rather than trusting the convention.

---

### 12. CLI — `tools/oolite-ingest/cli.ts`

**Analogs:**
- `scripts/check-verify-fails-fast.sh:22-31,39-58` (**tracked**) — explicit exit status, named diagnostics, `trap` cleanup, and a comment explaining why the exit code is the contract.
- `src/main.ts:103-110` (**tracked**) — top-level entry that resolves required inputs and fails loudly.

**Analog — capture the status, name the failure, exit non-zero:**

```sh
set -eu
cd "$(dirname "$0")/.."
trap 'rm -f src/sim/__verify_probe.ts' EXIT
# ...
set +e
output=$(docker compose run --rm verify 2>&1)
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo "check-verify-fails-fast: verify exited 0 with a seeded sim-zone violation" >&2
  exit 1
fi
```

**What the TS CLI must do** (RESEARCH §P6.3/P6.6): `--check` regenerates into `mkdtemp(os.tmpdir())`, compares file **set** (missing **and** extra fail), bytes, and per-file SHA-256 against the committed manifest, prints one line per file (`MISSING` / `EXTRA` / `CHANGED bytes` / `CHANGED hash`), exits 1, and cleans up in `try/finally`. Never shell out to `git diff --exit-code`.

**CLI flag names are discretion** (CONTEXT §Agent's Discretion); keep exactly `assets:build` = no flag, `assets:check` = `--check`.

---

### 13. Tests

#### 13a. Golden fixtures — `tools/oolite-ingest/convert/*.test.ts`

**Analog:** `tests/golden/kinematic-probe.test.ts:18-48` (**tracked**) — the exact shape to copy.

```ts
interface Fixture {
  version: number;
  dt: number;
  targetSteps: number;
  script: readonly InputFrame[];
  expected: { algorithm: string; hash: string };
}

const fixture = JSON.parse(
  readFileSync(new URL("./kinematic-probe.json", import.meta.url), "utf8"),
) as Fixture;

describe("golden fixture: kinematic probe", () => {
  it("replays the versioned input script to the recorded FNV-1a hash", () => {
    expect(fixture.version).toBe(1);
    // `toBe`, not `toBeCloseTo`: the recorded literal parses to the same
    // IEEE-754 double as 1/120, so any transcription slip is caught here.
    expect(fixture.dt).toBe(DT);
    // ...
  });
});
```

**Apply:** `new URL("./…", import.meta.url)` + `readFileSync` + `JSON.parse` (goldens never import JSON as modules; plan 09 later enables `resolveJsonModule` for the single runtime manifest import); `version` asserted first; exact `toBe`/`toEqual`, never a tolerance. Lave/commodities/equipment goldens live in `tests/golden/content/*.json` and are read the same way.

#### 13b. Negative-proof drift test — `tools/oolite-ingest/drift.test.ts`

**Analog:** `tests/guards/sim-purity.test.ts:42-57,68-74` (**tracked**) — the repo's canonical "seed a violation, assert the gate names it, restore the tree" harness.

```ts
function withProbe(
  name: string,
  source: string,
  body: (file: string) => void,
): void {
  mkdirSync(SIM_DIR, { recursive: true });
  const file = join("src", "sim", name);
  writeFileSync(join(REPO_ROOT, file), source);
  try {
    body(file);
  } finally {
    rmSync(join(REPO_ROOT, file), { force: true });
  }
}
```

**Apply:** mutate one byte of a committed generated file, run the exported `check()` function (not a spawned process where avoidable), assert the report names the file and the failure class, restore in `finally`. Add the missing-file and extra-file cases from RESEARCH §P6.3.

#### 13c. Asset provenance — `tests/compliance-assets.test.ts`

**Analog:** `tests/compliance.test.ts:63-77` (recursive walk, above) + `tests/compliance.test.ts:169-182` (**tracked**) — including the **vacuity guard**, which must be copied:

```ts
describe("licence headers", () => {
  it("puts the S-6 SPDX header on every source file", () => {
    const files = collectSourceFiles(REPO_ROOT);

    // Vacuity guard: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(8);

    const missing = files.filter((file) => {
      const head = readFileSync(file, "utf8").split("\n", 3).join("\n");
      return !head.includes("SPDX-License-Identifier: GPL-2.0-or-later");
    });

    expect(missing).toEqual([]);
  });
});
```

**Apply:** walk `third_party/**` only, parse the `ASSETS.md` table by its eight-column header (`ASSETS.md:13`), assert **every** vendored file has a row **and** a matching SHA-256, and add a vacuity guard (`third_party` file count ≥ 62). Reuse `readProse()` from the analog for markdown assertions (`tests/compliance.test.ts:52-54`).

#### 13d. Parser/like-ship/dat/glb tests

Use 13a for goldens and 13b for negative paths. Property tests use `fast-check`; assert code + file + construct, and line/column where the failure is textual (D-19 / RESEARCH §P6.6).

**Test placement decision (RESEARCH Q11):** put converter tests beside the code as `tools/**/*.test.ts` and add one glob to `vitest.config.ts:18`. `tests/**/*.test.ts` is already matched, so `tests/compliance-assets.test.ts` needs nothing.

---

### 14. Scripts

#### `scripts/check-arch-determinism.sh`

**Analog (exact shape):** `scripts/check-verify-fails-fast.sh:1-31,39-58` (**tracked**) and `scripts/smoke-preview.sh:19-36` (**tracked**).

Copy all four conventions:
1. `#!/bin/sh`, SPDX header, then a multi-line comment stating what claim the script is the single authority for and why it is **not** part of `verify`.
2. `set -eu` then `cd "$(dirname "$0")/.."`.
3. `trap` that tears down anything created on every exit path — here, the temp output trees (`smoke-preview.sh:24` / `check-verify-fails-fast.sh:31`).
4. An assertion that prints a **named** diagnostic to stderr and `exit 1`, then a success line (`smoke-preview.sh:33-38`).

**Apply:** run `assets:build` under `docker buildx build --platform linux/arm64` and `linux/amd64` from the same image digest, `diff -r` the two output trees, compare manifests, and keep any exclusion list in the script header (D-06 permits nothing else).

#### `scripts/vendor-oolite.sh`

Same shell analog. Three ordered steps from RESEARCH §Pattern 1: re-fetch the pinned ref into a temp dir → rewrite `SOURCE.md` and `ASSETS.md` hashes → run `assets:build`. The build failing afterwards **is** the review gate; do not add a "force" flag.

---

### 15. Config, docs, compliance (modify in place)

#### `package.json` — add two scripts only

**Analog:** itself; the four existing script strings are **pinned byte-for-byte** at `tests/contract/container-contract.test.ts:264-269`:

```ts
expect(script(manifest, "test")).toBe("vitest run");
expect(script(manifest, "lint")).toBe("eslint . && prettier --check .");
expect(script(manifest, "typecheck")).toBe(
  "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit",
);
expect(script(manifest, "test:e2e")).toBe("playwright test");
```

Add exactly:

```json
"assets:build": "tsx tools/oolite-ingest/cli.ts",
"assets:check": "tsx tools/oolite-ingest/cli.ts --check"
```

Dependency placement: `zod` in `dependencies` (runtime manifest validation), `tsx`/`fast-check`/`@gltf-transform/core` in `devDependencies`. Every version must be bare `x.y.z` — `tests/contract/container-contract.test.ts:339-347` rejects ranges. Do **not** add `tsconfig.tools.json` (it would break the `typecheck` pin); `tools/**/*.ts` is already in `tsconfig.json:24`.

#### `compose.yaml` — one service + one chain edit

**Analog — service (compose.yaml:42-44):**

```yaml
  test:
    <<: *workspace
    command: ["npm", "test"]
```

**Add:**

```yaml
  assets:
    <<: *workspace
    command: ["npm", "run", "assets:build"]
```

No `ports:` (the contract asserts test services publish none — `container-contract.test.ts:243-245`), no `depends_on:` (`:246`).

**Analog — verify chain (compose.yaml:64-78):**

```yaml
  verify:
    <<: *workspace
    ipc: host
    command:
      - sh
      - -lc
      - >-
        npm run lint &&
        npm run typecheck &&
        npm run test &&
        npm run build &&
        npm run test:e2e
```

Insert `npm run assets:check &&` **between `typecheck` and `test`** (D-04), keeping the `&&` chain and the folded-scalar shape.

#### `vitest.config.ts` — one glob

**Analog:** `vitest.config.ts:10-21` (**tracked**):

```ts
projects: [
  {
    test: {
      name: "unit",
      environment: "node",
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    },
  },
],
```

Add `"tools/**/*.test.ts"`. Keep the "one Node-only project" comment and extend it; do not add a second project.

#### `eslint.config.js` — a `tools` zone modelled on the sim zone

**Analog:** `eslint.config.js:59-119` (**tracked**). The load-bearing shape:

```js
{
  files: ["src/sim/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", { patterns: [ /* ... */ ] }],
    "no-restricted-globals": ["error", ...DOM_GLOBALS.map(/* ... */)],
    "no-restricted-properties": [
      "error",
      { object: "Math", property: "random", message: "Use the seeded PRNG in sim/math." },
      { object: "Date", property: "now", message: "No wall clock inside src/sim." },
      // ...
    ],
    "no-restricted-syntax": [
      "error",
      { selector: 'NewExpression[callee.name="Date"]', message: "No Date inside src/sim." },
    ],
  },
},
```

**Add a second zone for `files: ["tools/oolite-ingest/**/*.ts"]`** banning, per RESEARCH §P6.4: `Math.sin|cos|tan|exp|log|pow`, `localeCompare`, `toFixed`, `toPrecision`, `Intl.*`, `Date`/`Date.now`, `Math.random`, `eval`, `new Function`. Keep the existing `ignores` list at four entries unless generated `.ts` is emitted (it is not). Also extend the **sim zone** so `src/content` runtime is unreachable from `src/sim`: add `**/content/index*`, `**/content/schemas/**`, and `**/content/generated/**` to the deny patterns (negation-free, so it cannot silently widen), leaving `**/content/types*` importable.

#### `.prettierignore` — two lines + a comment

**Analog:** `.prettierignore:1-10` (**tracked**), including its comment idiom:

```
# Agent runtime state written by the GSD harness, not project source.
.gsd
```

Add:

```
# Generated canonical JSON: Prettier's array wrapping would break assets:check.
src/content/generated
# Vendored Oolite snapshot: third-party bytes, never reformatted.
third_party
```

#### `tests/contract/container-contract.test.ts` — three coordinated edits

**Analog:** itself. Copy the exact assertions that will fail:

```ts
expect(verify.slice(chainAt)).toBe(
  "npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e",
);
```

→ must become the new chain string with `assets:check` third.

```ts
const declared = [...SERVICES.keys()].sort();
for (const guide of ["AGENTS.md", "README.md"]) {
  const targets = [...documentedTargets(read(guide))].sort();
  expect(targets, `${guide} command targets`).toEqual(declared);
}
```

→ adding the `assets` service **requires** a `docker compose run --rm assets` row in **both** guides in the same commit. Also extend the no-ports loop (`:243-245`) and the service→script map (`:249-262`) with `assets`.

#### `AGENTS.md`, `README.md` — command tables

**Analog:** `README.md:23-33` and `AGENTS.md`'s "Commands quick reference". Add one row:

```
| Content build (regenerate)       | `docker compose run --rm assets`                 |
| Content drift check              | `docker compose run --rm assets npm run assets:check` |
```

Careful: `documentedTargets` collects the **service name** from both forms, so two rows naming `assets` are fine; a row naming a *new* service that does not exist is not.

#### `ASSETS.md` — 63 new rows

**Analog:** the table header at `ASSETS.md:13`, pinned by `tests/compliance.test.ts:130-138`:

```
| Path | Kind | Origin | Source URL | Author / Copyright | Licence | Modifications | SHA-256 |
```

Do not change the header or the "No asset may be committed…" sentence (both are asserted). Add one row per vendored file: 40 plists + 5 models + 16 textures + `SOURCE.md` + `LICENSE-oolite.txt`. Generated GLBs/textures recorded with `Modifications = "converted from X"` and the CC BY-NC-SA 3.0 licence (D-03).

---

## Shared Patterns

### S-1 — SPDX header on every new source file (**mandatory**)

**Source:** `tests/compliance.test.ts:169-182`; example `src/sim/hash.ts:1-2`.

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors
```

**Apply to:** every new `.ts` (≈30 files) and `.sh` (2 files). Generated `.json`, fixtures, vendored plists/`.dat`/`.png` are out of scope (the walk only matches `.ts`/`.js`/`.sh`), but **never vendor a `.js` file** — `third_party` is not in `SKIP_DIRECTORIES`.

### S-2 — ESM `.js` specifiers + `import type`

**Source:** `src/sim/state.ts:4-6`; enforced by `tsconfig.json:11,15` and used by every tracked module.

```ts
import { canon, fnv1a32 } from "./hash.js";
import type { Quat, Vec3 } from "./math.js";
```

**Apply to:** all new tool modules and `src/content/types.ts`. `tsx` is required precisely because Node's type stripping resolves `./x.js` literally and fails (RESEARCH §Standard Stack).

### S-3 — Fail loudly, never silently substitute

**Source:** `src/main.ts:49-96`, `src/sim/hash.ts:29-32`, `scripts/smoke-dev.sh:31-34`.

**Apply to:** every converter, the CLI, the manifest validator, and the texture copier. Missing input, unknown key outside the 153-key shipdata allowlist (warn only), unresolved `like_ship`, short tuple, bad `.dat` section, non-finite number ⇒ a named error. D-21 forbids placeholders.

### S-4 — Canonicalise before you hash or compare

**Source:** `src/sim/state.ts:38-54`, `tests/golden/kinematic-probe.test.ts:33-48`.

**Apply to:** every emitted JSON file, the manifest, and `assets:check`. One serialiser; no `JSON.stringify` on data-bearing structures; no `localeCompare`; `.sort()` every directory listing.

### S-5 — Same rule enforced twice (type project + ESLint) with a negative proof

**Source:** `tests/guards/sim-purity.test.ts:59-104` and `eslint.config.js:59-119`; the two-gate design is documented in `tsconfig.sim.json:1-9`.

**Apply to:** the new `src/content` boundary. Add a probe test that imports `../../content/index.js` from inside `src/sim` and asserts `no-restricted-imports` names it — the message "may only import src/sim and content/types" is currently aspirational for runtime content, not enforced.

### S-6 — Node-only Vitest; browser only via Playwright

**Source:** `vitest.config.ts:8-9`; enforced by the single `unit` project.

**Apply to:** all new tests. No DOM, no `jsdom`, no browser globals in ingest tests. GLB validation uses `@gltf-transform/core`'s Node reader.

### S-7 — Test doubles are generated and removed in `finally`

**Source:** `tests/guards/sim-purity.test.ts:42-57`; also `scripts/check-verify-fails-fast.sh:31`.

**Apply to:** the drift test, the missing-texture test, the malformed-fixture runners, and any test that writes into the working tree. Never leave a probe behind; announce the reason in a header comment (the analog does).

### S-8 — Docker is the only execution path

**Source:** `AGENTS.md` non-negotiables 1–2; `compose.yaml:1-26`.

**Apply to:** the two npm scripts, the `assets` service, the arm64/amd64 script, and every plan `<verify>` command. After `package.json` changes the executor must run `docker compose build` **and** `docker compose down --volumes`. Commands are `docker compose run --rm assets` / `... assets npm run assets:check` — never `docker compose run --rm ci`.

### S-9 — `.prettierignore` before the first generated byte

**Source:** `package.json:14` (`lint` = `eslint . && prettier --check .`), `.prettierignore:1-10`.

**Apply to:** `src/content/generated` and `third_party`. Land this in the tracer commit; otherwise the first `assets:build` turns `lint` red and the tempting fix (`prettier --write`) destroys canonical bytes.

---

## Hard-pinned contracts the planner must touch in the *same* plan

| Contract | Pinned at | What breaks if forgotten |
|---|---|---|
| Verify chain string | `tests/contract/container-contract.test.ts:281-283` | `verify` fails at the `test` stage with a multi-line diff |
| Four script strings | `:264-269` | Any reformat of `lint`/`test`/`typecheck`/`test:e2e` fails |
| Service-set equality across `compose.yaml` + both guides | `:390-397` | Adding `assets` without two doc rows fails |
| `ASSETS.md` eight-column header + intro sentence | `tests/compliance.test.ts:130-138` | `test` fails on prose |
| SPDX header on all `.ts`/`.js`/`.sh` | `tests/compliance.test.ts:169-182` | `test` fails listing every new file |
| Exact dependency pins (`^\d+\.\d+\.\d+$`) | `:339-347` | A caret range fails the contract test |
| No `ports:`/`depends_on:` on test services | `:243-246` | New service shape fails |

---

## Divergences and traps specific to this codebase

1. **`noUncheckedIndexedAccess`** — every index access is `T | undefined`. The `.dat` tokenizer and the equipment tuple parser must narrow explicitly; a bare `parts[0].trim()` will not compile.
2. **`exactOptionalPropertyTypes`** — `ContentError.line?: number` cannot be assigned `undefined`; build the object conditionally or use `line: number | undefined`.
3. **`recommendedTypeChecked`** is on (`eslint.config.js:45`). `JSON.parse` results and `PlistValue` unions must be narrowed with type guards; `any`/`as` chains will fail `no-unsafe-*`.
4. **`tsconfig.json` already includes `tools/**/*.ts`** (`:24`) — no tsconfig change, and **no** `tsconfig.tools.json`.
5. **`tests/compliance.test.ts` walks `third_party`** — safe for `.plist/.dat/.png/.md`, fatal for any vendored `.js`.
6. **`public/` is already tracked** (`.gitkeep`); generated `.glb`/`.png` are committed, so `.gitignore` does not change.
7. **`vite.config.ts` has `base: "./"`** — GLB/texture URLs must be built from `import.meta.env.BASE_URL` or `new URL(..., import.meta.url)`, never a leading `/`. No Vite change is required until Phase 3 loads them.
8. **`@gltf-transform/core` must not become the producer** — its `asset.generator` string re-baselines every GLB on upgrade (RESEARCH §P5.5).
9. **Determinism bans apply only to `tools/oolite-ingest/**`** — do not add `Math.sin` bans to `src/sim` or `src/render`, which legitimately use them (`src/render/camera-relative.ts:42-43`).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tools/oolite-ingest/convert/glb.ts` | service | binary serialisation | No GLB/glTF/binary-writer code in the repo |
| `tools/oolite-ingest/convert/textures.ts` (PNG half) | service | binary transform | No image/PNG/zlib code; deliberately no image dependency |
| `tools/oolite-ingest/like-ship.ts` | service | graph resolution | No graph, cycle-detection, or dictionary-merge code |
| `tools/oolite-ingest/openstep/tokenizer.ts`, `parser.ts` | service | text→AST | Only line-splitting scanners exist; no char-level tokenizer |
| `src/content/schemas/*.ts` | schema | validation | zod is not installed and no schema layer exists |
| `tools/oolite-ingest/convert/dat.ts` | service | file-I/O + parsing | Only a line-based YAML-subset scanner exists |
| `third_party/oolite/**` (61 files) | vendored-input | data | Nothing is vendored today |
| `tests/fixtures/textures/*.png` | fixture | binary | No binary fixtures exist (JSON only) |
| `public/models/*.glb`, `public/textures/*.png` | generated-asset | binary | `public/` holds only `.gitkeep` |
| `tools/oolite-ingest/openstep/index.ts` | utility | barrel | No barrel modules anywhere in the repo |
| `src/content/index.ts` (manifest validator body) | service | startup validation | No runtime content boundary exists; only the fail-loud *style* has an analog |

---

## Metadata

**Analog search scope:** `src/**`, `tests/**`, `scripts/**`, root config (`package.json`, `compose.yaml`, `eslint.config.js`, `vitest.config.ts`, `tsconfig*.json`, `.prettierignore`, `Dockerfile`, `.gitignore`, `.dockerignore`), `ASSETS.md`, `README.md`, `AGENTS.md`.
**Files read for excerpts:** 17 tracked files (all listed above with line numbers).
**Method:** codebase-memory index (`index_status`: ready, 860 nodes) for package/entry-point shape, then direct reads to confirm every excerpt. `tools/`, `src/content/`, `third_party/` confirmed absent from the filesystem and from `git ls-files` (82 tracked paths).
**Pattern extraction date:** 2026-11-03.

**Highest-leverage findings for the planner:**

1. `src/sim/state.ts` + `src/sim/hash.ts` are the canonical-serialisation template — but the pipeline must swap `toFixed` for `String(n)` and add sorted keys.
2. `tests/compliance.test.ts` is the template for the new `tests/compliance-assets.test.ts` (walk + vacuity guard + `readProse`), and its walk is why `third_party` may never contain a `.js`.
3. `tests/guards/sim-purity.test.ts`'s `withProbe`/`finally` harness is the exact shape for `drift.test.ts`, for the missing-texture case, and for the new `src/content` boundary proof.
4. `tests/golden/kinematic-probe.test.ts` is the golden-fixture template (versioned, `new URL`, exact `toBe`).
5. Four Phase 1 contract pins (chain string, script strings, service-set equality, `ASSETS.md` header) must be edited in the same commit as the feature — the tracer plan owns all of them.
6. The repo has **no** zod, tsx, GLB, or image code: six files are genuinely new work and must be built from RESEARCH.md, not "copied".
