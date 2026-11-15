// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative and positive proofs for the AI lint zone (FOUND-13, D-11, plan
 * 08-09, Pitfall 5).
 *
 * Every probe is written under `src/sim/ai/` through `withSimProbe` (probe lock,
 * `__purity_` basename, SPDX header, full cleanup), linted through the real root
 * config and asserted by rule id and a fragment of the configured message. The
 * probes are the end-to-end proof; the "AI import allow-list table" pins the
 * regex shapes themselves, read from the effective config.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { lintProbe } from "./eslint-gate.js";
import type { GateRun } from "./eslint-gate.js";
import { withSimProbe } from "./sim-probe.js";

const TIMEOUT = 120_000;
const REPO_ROOT = process.cwd();

const IMPORTS = "no-restricted-imports";
const SYNTAX = "no-restricted-syntax";
const GLOBALS = "no-restricted-globals";
const PROPERTIES = "no-restricted-properties";

const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

/** One AI zone depth: where its probes live and how a specifier reaches `src/sim`. */
interface Zone {
  readonly name: string;
  /** Probe directory under src/sim, with a trailing slash. */
  readonly dir: string;
  /** The prefix that climbs from the probe directory to src/sim/. */
  readonly up: string;
  /** Whether the zone has an allow-list (depth 3 rejects every import). */
  readonly allows: boolean;
}

const DEPTH1: Zone = { name: "depth 1", dir: "ai/", up: "../", allows: true };
const PILOTS: Zone = {
  name: "depth 2 (pilots)",
  dir: "ai/pilots/",
  up: "../../",
  allows: true,
};
const NESTED: Zone = {
  name: "depth 2 (nested)",
  dir: "ai/nested/",
  up: "../../",
  allows: true,
};
const DEPTH3: Zone = {
  name: "depth 3 (roles)",
  dir: "ai/pilots/roles/",
  up: "../../../",
  allows: false,
};

const ALL_ZONES: readonly Zone[] = [DEPTH1, PILOTS, NESTED, DEPTH3];
const TWO_ZONES: readonly Zone[] = [DEPTH1, PILOTS];

// The TypeScript project service remembers a probe path it has seen, so reusing
// one basename after its file was deleted fails with "not found by the project
// service"; every probe therefore gets its own name.
let probeCount = 0;

async function lint(zone: Zone, source: string): Promise<GateRun> {
  probeCount += 1;
  let run: GateRun | undefined;
  await withSimProbe(
    `${zone.dir}__purity_probe_${String(probeCount)}.ts`,
    source,
    async (file) => {
      run = await lintProbe(file);
    },
  );
  if (run === undefined) throw new Error("the probe did not run");
  return run;
}

/** Assert `rule` fired with a message containing `fragment`. */
function expectFires(run: GateRun, rule: string, fragment: string): void {
  const hit = run.messages.find(
    (message) => message.ruleId === rule && message.message.includes(fragment),
  );
  expect(hit, `${rule} "${fragment}" in:\n${run.output}`).toBeDefined();
  expect(run.status).toBe(1);
}

/** Assert neither the import rule nor the syntax rule fired. */
function expectZoneClean(run: GateRun): void {
  const hits = run.messages.filter(
    (message) => message.ruleId === IMPORTS || message.ruleId === SYNTAX,
  );
  expect(hits, run.output).toEqual([]);
}

// ---------------------------------------------------------------------------
// Imports of simulation internals are rejected at every depth.
// ---------------------------------------------------------------------------

interface ImportCase {
  readonly name: string;
  readonly source: (up: string) => string;
}

const REJECTED_IMPORTS: readonly ImportCase[] = [
  {
    name: "a value import from the flight step module",
    source: (up) =>
      lines(
        `import { stepFlight } from "${up}flight/step.js";`,
        "export const f = stepFlight;",
      ),
  },
  {
    name: "a type-only import from the flight state module",
    source: (up) =>
      lines(
        `import type { FlightState } from "${up}flight/state.js";`,
        "export type S = FlightState;",
      ),
  },
  {
    name: "a value import from the world store module",
    source: (up) =>
      lines(
        `import { createEntityStore } from "${up}world/store.js";`,
        "export const s = createEntityStore;",
      ),
  },
  {
    name: "a type-only import from the world entity module",
    source: (up) =>
      lines(
        `import type { Entity } from "${up}world/entity.js";`,
        "export type E = Entity;",
      ),
  },
  {
    name: "a type-only import from the content types module",
    source: (up) =>
      lines(
        `import type { ShipDef } from "${up}../content/types.js";`,
        "export type D = ShipDef;",
      ),
  },
  {
    name: "a re-export from the world module",
    source: (up) => lines(`export * from "${up}world/world.js";`),
  },
  {
    name: 'an import of "three"',
    source: () =>
      lines('import { Vector3 } from "three";', "export const v = Vector3;"),
  },
  {
    name: 'an import of "zod"',
    source: () => lines('import { z } from "zod";', "export const s = z;"),
  },
  {
    name: "a specifier that starts with ./ and climbs into the flight directory",
    source: (up) =>
      lines(
        `import { stepFlight } from "./${up}flight/step.js";`,
        "export const f = stepFlight;",
      ),
  },
];

describe("the AI zone rejects imports of simulation internals", () => {
  for (const zone of ALL_ZONES) {
    for (const probe of REJECTED_IMPORTS) {
      it(
        `${zone.name}: ${probe.name}`,
        async () => {
          const run = await lint(zone, probe.source(zone.up));
          expectFires(run, IMPORTS, "");
        },
        TIMEOUT,
      );
    }
  }

  it(
    "names the AI seam in the message of an allow-list rejection",
    async () => {
      const run = await lint(
        DEPTH1,
        lines(
          'import { stepFlight } from "../flight/step.js";',
          "export const f = stepFlight;",
        ),
      );
      expectFires(run, IMPORTS, "AI modules may import only AI siblings");
    },
    TIMEOUT,
  );

  it(
    "names the missing depth allow-list in the message of a depth 3 file",
    async () => {
      const run = await lint(
        DEPTH3,
        lines(
          'import type { AiComponent } from "../../types.js";',
          "export type A = AiComponent;",
        ),
      );
      expectFires(run, IMPORTS, "no configured allow-list");
    },
    TIMEOUT,
  );

  for (const zone of ALL_ZONES) {
    it(
      `${zone.name}: a dynamic import fails with the dynamic import message`,
      async () => {
        const run = await lint(
          zone,
          lines(`export const load = () => import("${zone.up}world/ids.js");`),
        );
        expectFires(run, SYNTAX, "dynamic import");
      },
      TIMEOUT,
    );
  }
});

describe("the AI zone accepts the seam", () => {
  for (const zone of [DEPTH1, PILOTS, NESTED]) {
    it(
      `${zone.name}: WorldView, ShipControl, world/ids, sim math and an AI sibling lint clean`,
      async () => {
        const sibling = zone === DEPTH1 ? "./types.js" : "../types.js";
        const run = await lint(
          zone,
          lines(
            `import type { WorldView } from "${zone.up}world/view.js";`,
            `import type { ShipControl } from "${zone.up}world/control.js";`,
            `import { NO_ENTITY } from "${zone.up}world/ids.js";`,
            `import { vec } from "${zone.up}math.js";`,
            `import type { AiComponent } from "${sibling}";`,
            "export type Alias = AiComponent;",
            "export function probe(view: WorldView, ctl: ShipControl): number {",
            "  ctl.setTarget(1, NO_ENTITY);",
            "  return view.tick + vec(1, 2, 3).x;",
            "}",
          ),
        );
        expectZoneClean(run);
      },
      TIMEOUT,
    );
  }

  it(
    "depth 2: a sibling in the same directory lints clean",
    async () => {
      const run = await lint(
        PILOTS,
        lines(
          'import { TEST_PILOT } from "./test-pilot.js";',
          "export const same = TEST_PILOT;",
        ),
      );
      expectZoneClean(run);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// The sim determinism bans still fire inside the zone (Pitfall 5).
// ---------------------------------------------------------------------------

interface BanCase {
  readonly name: string;
  readonly source: string;
  readonly rule: string;
  readonly fragment: string;
}

const INHERITED_BANS: readonly BanCase[] = [
  {
    name: "a for..in loop",
    source: lines(
      "export function keysOf(o: Record<string, number>): string[] {",
      "  const out: string[] = [];",
      "  for (const k in o) out.push(k);",
      "  return out;",
      "}",
    ),
    rule: SYNTAX,
    fragment: "for..in order",
  },
  {
    name: "Date.now()",
    source: lines("export const now = Date.now();"),
    rule: PROPERTIES,
    fragment: "No wall clock",
  },
  {
    name: "Math.random()",
    source: lines("export const r = Math.random();"),
    rule: PROPERTIES,
    fragment: "seeded PRNG",
  },
  {
    name: "an argument-less sort",
    source: lines("export const sorted = [2, 1].sort();"),
    rule: SYNTAX,
    fragment: "Bare .sort()",
  },
  {
    name: "a setTimeout call",
    source: lines("setTimeout(() => undefined, 1);"),
    rule: GLOBALS,
    fragment: "No timers inside src/sim",
  },
  {
    name: "a globalThis read",
    source: lines("export const g = globalThis;"),
    rule: GLOBALS,
    fragment: "must not reach the global object",
  },
  {
    name: "an alias of Math",
    source: lines("export const m = Math;"),
    rule: SYNTAX,
    fragment: "Do not alias Math",
  },
  {
    name: "new Function",
    source: lines('export const f = new Function("return 1");'),
    rule: "no-new-func",
    fragment: "Function constructor",
  },
  {
    name: "an Intl.Collator use",
    source: lines("export const c = new Intl.Collator();"),
    rule: GLOBALS,
    fragment: "Intl is locale",
  },
  {
    name: "a localeCompare comparator",
    source: lines(
      'export const sorted = ["b", "a"].sort((a, b) => a.localeCompare(b));',
    ),
    rule: SYNTAX,
    fragment: "localeCompare is ICU",
  },
];

describe("the sim determinism bans stay active inside the AI zone", () => {
  for (const zone of TWO_ZONES) {
    for (const ban of INHERITED_BANS) {
      it(
        `${zone.name}: ${ban.name}`,
        async () => {
          expectFires(await lint(zone, ban.source), ban.rule, ban.fragment);
        },
        TIMEOUT,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Round 4: the closure-held stream and module-level mutable state.
// ---------------------------------------------------------------------------

describe("the AI zone cannot reach the closure-held random stream", () => {
  it(
    "depth 1: an aliased createSeededRandom import is rejected",
    async () => {
      const run = await lint(
        DEPTH1,
        lines(
          'import { createSeededRandom as r } from "../math.js";',
          "export const draw = r(1);",
        ),
      );
      expectFires(run, IMPORTS, "closure-held stream");
    },
    TIMEOUT,
  );

  it(
    "depth 1: a namespace import of sim math is rejected",
    async () => {
      const run = await lint(
        DEPTH1,
        lines(
          'import * as m from "../math.js";',
          "export const v = m.vec(1, 2, 3);",
        ),
      );
      expectFires(run, IMPORTS, "closure-held stream");
    },
    TIMEOUT,
  );

  it(
    "depth 2: createSeededRandom from ../../math.js is rejected",
    async () => {
      const run = await lint(
        PILOTS,
        lines(
          'import { createSeededRandom } from "../../math.js";',
          "export const draw = createSeededRandom(1);",
        ),
      );
      expectFires(run, IMPORTS, "closure-held stream");
    },
    TIMEOUT,
  );

  for (const zone of TWO_ZONES) {
    it(
      `${zone.name}: another named sim math import lints clean`,
      async () => {
        const run = await lint(
          zone,
          lines(
            `import { vec } from "${zone.up}math.js";`,
            "export const v = vec(1, 2, 3);",
          ),
        );
        expectZoneClean(run);
      },
      TIMEOUT,
    );
  }
});

const STATE = "module-level mutable state";

const STATE_REJECTED: readonly { name: string; source: string }[] = [
  {
    name: "a top-level let mutated by an exported function",
    source: lines(
      "let count = 0;",
      "export function bump(): number {",
      "  count += 1;",
      "  return count;",
      "}",
    ),
  },
  { name: "export let", source: lines("export let shared = 0;") },
  {
    name: "a top-level var",
    source: lines(
      "var legacy = 0;",
      "export const seen = (): number => legacy;",
    ),
  },
  {
    name: "a top-level const new Map",
    source: lines(
      "const cache = new Map<string, number>();",
      "export const size = (): number => cache.size;",
    ),
  },
  {
    name: "a top-level const object literal",
    source: lines("const table = { a: 1 };", "export const a = table.a;"),
  },
  {
    name: "a top-level const array literal",
    source: lines(
      "const list: number[] = [];",
      "export const n = list.length;",
    ),
  },
  {
    name: "an exported const object literal",
    source: lines("export const SHARED = { a: 1 };"),
  },
  {
    name: "an exported const new expression",
    source: lines("export const SHARED = new Map<string, number>();"),
  },
  {
    name: "an object default export",
    source: lines("export default { a: 1 };"),
  },
];

const STATE_ALLOWED: readonly { name: string; source: string }[] = [
  {
    name: "an exported Object.freeze table",
    source: lines("export const TABLE = Object.freeze({ a: 1 });"),
  },
  {
    name: "a numeric constant",
    source: lines("const LIMIT = 15;", "export const limit = LIMIT;"),
  },
  {
    name: "an as const array (the documented residual)",
    source: lines(
      'const NAMES = ["a", "b"] as const;',
      "export const names = NAMES;",
    ),
  },
  {
    name: "a local let inside a function",
    source: lines(
      "export function total(xs: readonly number[]): number {",
      "  let sum = 0;",
      "  for (const x of xs) sum += x;",
      "  return sum;",
      "}",
    ),
  },
];

describe("the AI zone bans module-level mutable state", () => {
  for (const zone of TWO_ZONES) {
    for (const probe of STATE_REJECTED) {
      it(
        `${zone.name}: ${probe.name} is rejected`,
        async () => {
          expectFires(await lint(zone, probe.source), SYNTAX, STATE);
        },
        TIMEOUT,
      );
    }
  }

  for (const probe of STATE_ALLOWED) {
    it(
      `depth 1: ${probe.name} lints clean`,
      async () => {
        expectZoneClean(await lint(DEPTH1, probe.source));
      },
      TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// The real modules are the positive control (D-11).
// ---------------------------------------------------------------------------

describe("the real AI modules lint clean", () => {
  for (const file of [
    "src/sim/ai/pilots/test-pilot.ts",
    "src/sim/ai/registry.ts",
    "src/sim/ai/types.ts",
    "src/sim/ai/time.ts",
    // The one carve-out (plan 13-14): a world-side `?test=1` seam that needs the
    // world and the flight state, so it lints under the sim zone, not the AI zone.
    "src/sim/ai/test-spawn.ts",
  ]) {
    it(
      file,
      async () => {
        const run = await lintProbe(file);
        expect(run.output).toBe("");
        expect(run.status).toBe(0);
      },
      TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// The allowed non-AI modules cannot become a re-export bridge.
// ---------------------------------------------------------------------------

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/** Every `export ... from` statement: `export *`, `export * as x`, `export { a } from`. */
const REEXPORT =
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s/;

/** Every top-level import statement: `[type?, specifier]`. */
function importStatements(source: string): [boolean, string][] {
  const found: [boolean, string][] = [];
  const pattern = /^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gms;
  for (const match of source.matchAll(pattern)) {
    found.push([match[1] !== undefined, match[2] ?? ""]);
  }
  return found;
}

describe("allowed AI seam modules do not re-export internals", () => {
  const SEAM = [
    "src/sim/world/ids.ts",
    "src/sim/math.ts",
    "src/sim/world/view.ts",
    "src/sim/world/control.ts",
  ];

  it("none of the four contains an export ... from statement", () => {
    for (const file of SEAM) {
      expect(REEXPORT.test(read(file)), file).toBe(false);
    }
  });

  it("ids.ts has no imports", () => {
    expect(importStatements(read("src/sim/world/ids.ts"))).toEqual([]);
    expect(/^import\b/m.test(read("src/sim/world/ids.ts"))).toBe(false);
  });

  it("math.ts imports only ./rng.js", () => {
    const source = read("src/sim/math.ts");
    expect(importStatements(source).map(([, specifier]) => specifier)).toEqual([
      "./rng.js",
    ]);
    expect(source.match(/^import\b/gm)?.length).toBe(1);
  });

  it("view.ts and control.ts contain only import type from ./ids.js and ../math.js", () => {
    for (const file of ["src/sim/world/view.ts", "src/sim/world/control.ts"]) {
      const source = read(file);
      const imports = importStatements(source);
      expect(imports.length, file).toBe(source.match(/^import\b/gm)?.length);
      for (const [typeOnly, specifier] of imports) {
        expect(typeOnly, `${file} imports ${specifier}`).toBe(true);
        expect(["./ids.js", "../math.js"], file).toContain(specifier);
      }
    }
  });

  it("the scanner itself recognises the forms it is meant to reject", () => {
    for (const text of [
      'export * from "./store.js";',
      'export * as store from "./store.js";',
      'export { a } from "./store.js";',
      'export type { A } from "./store.js";',
      'export {\n  a,\n  b,\n} from "./store.js";',
    ]) {
      expect(REEXPORT.test(text), text).toBe(true);
    }
    expect(REEXPORT.test("export const a = 1;")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The allow-list regexes themselves, read from the effective config.
// ---------------------------------------------------------------------------

interface PathEntry {
  readonly name: string;
  readonly importNames: readonly string[];
}
interface PatternEntry {
  readonly regex: string;
  readonly caseSensitive: boolean;
}
interface ImportsOptions {
  readonly paths: readonly PathEntry[];
  readonly patterns: readonly PatternEntry[];
}

async function effectiveImports(file: string): Promise<ImportsOptions> {
  const config = (await new ESLint({ cwd: REPO_ROOT }).calculateConfigForFile(
    file,
  )) as { rules?: Record<string, unknown> } | undefined;
  const rule = config?.rules?.[IMPORTS];
  if (!Array.isArray(rule)) throw new Error(`no ${IMPORTS} rule for ${file}`);
  return rule[1] as ImportsOptions;
}

interface TableCase {
  readonly file: string;
  readonly mathPath: string;
  readonly allowed: readonly string[];
  readonly rejected: readonly string[];
}

const TABLES: readonly TableCase[] = [
  {
    file: "src/sim/ai/__table.ts",
    mathPath: "../math.js",
    allowed: [
      "./types.js",
      "./time.js",
      "./registry.js",
      "./pilots/test-pilot.js",
      "../math.js",
      "../world/ids.js",
      "../world/view.js",
      "../world/control.js",
    ],
    rejected: [
      "./../flight/step.js",
      "../flight/state.js",
      "../world/store.js",
      "../world/world.js",
      "../world/view.ts",
      "../world/viewx.js",
      "../world/view.js/x",
      "./Types.js",
      "./a/b.js",
      "./types",
      ".//types.js",
      "../../content/types.js",
      "three",
      "zod",
    ],
  },
  {
    file: "src/sim/ai/pilots/__table.ts",
    mathPath: "../../math.js",
    allowed: [
      "./test-pilot.js",
      "../types.js",
      "../time.js",
      "../../math.js",
      "../../world/ids.js",
      "../../world/view.js",
      "../../world/control.js",
    ],
    rejected: [
      "../../flight/step.js",
      "./../../flight/state.js",
      "../../world/store.js",
      "../pilots/../../flight/step.js",
      "../../../app/game-session.js",
      "../Types.js",
      "three",
    ],
  },
];

describe("AI import allow-list table", () => {
  for (const table of TABLES) {
    describe(table.file, () => {
      it(
        "is case-sensitive and bans only createSeededRandom by name",
        async () => {
          const options = await effectiveImports(table.file);
          expect(options.patterns).toHaveLength(1);
          expect(options.patterns[0]?.caseSensitive).toBe(true);
          expect(options.paths).toHaveLength(1);
          expect(options.paths[0]?.name).toBe(table.mathPath);
          expect(options.paths[0]?.importNames).toEqual(["createSeededRandom"]);
        },
        TIMEOUT,
      );

      it(
        "accepts every allowed specifier and rejects every other one",
        async () => {
          const options = await effectiveImports(table.file);
          const regex = options.patterns[0]?.regex;
          if (regex === undefined) throw new Error("no pattern");
          // ESLint compiles a case-sensitive regex pattern with the "u" flag.
          const compiled = new RegExp(regex, "u");
          for (const specifier of table.allowed) {
            expect(compiled.test(specifier), `allowed: ${specifier}`).toBe(
              false,
            );
          }
          for (const specifier of table.rejected) {
            expect(compiled.test(specifier), `rejected: ${specifier}`).toBe(
              true,
            );
          }
        },
        TIMEOUT,
      );
    });
  }
});
