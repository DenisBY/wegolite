// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: no Coriolis-only station constant outside the station record
 * (Phase 22.1, WORLD-20, Success Criterion 4, Pitfall P10).
 *
 * Before the phase every station number and name lived where it was used (a
 * radius literal in the layout, a mass in the hyperspace countdown, the word
 * "Coriolis" in the scene and the station screen), so a second kind of station
 * would have inherited the Coriolis silently. Now one record,
 * `src/content/stations.ts`, names the kinds and their files, and the compiled
 * `ships-client.json` carries each kind's mass, radius and dock offset. This
 * guard fails, naming `<path>:<line>: <rule>`, on a non-comment
 *
 * - station kind word (`coriolis`, `dodecahedron`, `icosahedron`, any case);
 * - old station constant: `STATION_RADIUS` (the layout's radius literal),
 *   `CORIOLIS_STATION_MASS` or `witchspaceStationMass` (the blockage mass);
 * - station mass, collision radius or dock offset number, read at test time
 *   from `src/content/generated/ships-client.json` (never typed here), matched
 *   by the first significant digits a literal would write;
 *
 * in a non-test `.ts` file under `src` other than the allowed one.
 *
 * What it protects: the station numbers and names have one home. The frozen
 * acceptance files live under `tests` and are outside its scan.
 *
 * Scope (review L1058@92f951b7): it scans `src` only. The content tool under
 * `tools/oolite-ingest` keeps the Coriolis keys of the shared static hull
 * artifact, `STATIC_HULL_KEYS` and `STATIC_NAME_KEYS` in
 * `convert/static-hulls.ts` and `DOCK_PORT_PATH` in `convert/dock-port.ts`, so
 * that artifact stays byte-identical; the guard does not see them.
 *
 * `PENDING_PRESENTATION` lists a presentation file that still carries a
 * Coriolis constant until the plan that removes it lands. It is empty: plan
 * 22.1-11 removed the three `src/render` entries and plan 22.1-12 the last one
 * (the station screen model), so no file in `src` carries an allowance. The
 * mechanism stays for a later phase, and an allowance cannot outlive its
 * reason: a pending file with no violation left fails the guard and must be
 * removed from the list.
 *
 * It keys on text, so it is a tripwire and not a proof: a constant spelled
 * without these words or numbers is not seen. Each rule has a synthetic source
 * that fails, so the guard cannot pass vacuously.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "../../src/content/schemas/ship.js";
import { STATION_KINDS, stationSpecFor } from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

/** The one file that may name the kinds: the station record. */
const ALLOWED: readonly string[] = ["src/content/stations.ts"];

/** A presentation file that still carries a Coriolis constant, and why. */
interface PendingAllowance {
  /** The plan that removes the constant and empties this entry. */
  readonly plan: string;
  readonly reason: string;
}

/**
 * The presentation files that may still name a station constant, each naming
 * the plan that ends its allowance. Empty since plan 22.1-12: the station
 * screen's model reads the system's own station, and the render files (plan
 * 22.1-11) have no entry either.
 */
const PENDING_PRESENTATION: Readonly<Record<string, PendingAllowance>> = {};

const GENERATED_CATALOGUE = "src/content/generated/ships-client.json";

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** One violation rule: a name for the report and a test over one line. */
interface Rule {
  readonly name: string;
  readonly matches: (line: string) => boolean;
}

/** The numeric literals of a line, without `_` separators. */
function numericLiterals(line: string): string[] {
  const found = line.match(/(?<![\w.])\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
  return (found ?? []).map((token) => token.replaceAll("_", ""));
}

/**
 * The digits a literal of `value` begins with: an integer in full, a fraction
 * as its first six significant digits (`779.3702392578125` is `779.37`),
 * truncated and not rounded, trailing zeros dropped.
 */
function literalPrefix(value: number): string {
  const text = String(value);
  if (Number.isInteger(value)) return text;
  let digits = 0;
  let end = 0;
  for (; end < text.length && digits < 6; end += 1) {
    if (text[end] !== ".") digits += 1;
  }
  return text.slice(0, end).replace(/0+$/, "");
}

/** The compiled mass, collision radius and dock offset of each station kind. */
function stationNumbers(): {
  readonly label: string;
  readonly value: number;
}[] {
  const catalogue = JSON.parse(
    readFileSync(join(REPO_ROOT, GENERATED_CATALOGUE), "utf8"),
  ) as CatalogEntry[];
  return STATION_KINDS.flatMap((kind) => {
    const spec = stationSpecFor(catalogue, kind);
    return [
      { label: `the ${kind} station mass`, value: spec.mass },
      { label: `the ${kind} station radius`, value: spec.collisionRadius },
      { label: `the ${kind} station dock offset`, value: spec.dockOffset },
    ];
  });
}

/** Every rule, built from the record and the compiled numbers. */
function buildRules(): Rule[] {
  const kindRules = STATION_KINDS.map((kind): Rule => ({
    name: `the station kind name "${kind}" belongs to src/content/stations.ts only: read the station record instead`,
    matches: (line) => new RegExp(`\\b${kind}\\b`, "i").test(line),
  }));
  const oldNames: Rule[] = [
    {
      name: "STATION_RADIUS was the layout's Coriolis radius: the radius comes from the station spec",
      matches: (line) => /\bSTATION_RADIUS\b/.test(line),
    },
    {
      name: "the Coriolis-only blockage mass is gone: the mass comes from the layout's stationMass",
      matches: (line) =>
        /\b(?:CORIOLIS_STATION_MASS|witchspaceStationMass)\b/.test(line),
    },
  ];
  const numberRules = stationNumbers().map(({ label, value }): Rule => {
    const prefix = literalPrefix(value);
    return {
      name: `${label} (${prefix}...) belongs to the compiled station record only: read it from the spec`,
      matches: (line) =>
        numericLiterals(line).some((token) => token.startsWith(prefix)),
    };
  });
  return [...kindRules, ...oldNames, ...numberRules];
}

const RULES = buildRules();

/** The violations of one file: `<path>:<line>: <rule>`. */
function fileViolations(file: SourceFile, rules: readonly Rule[]): string[] {
  const found: string[] = [];
  withoutComments(file.source)
    .split("\n")
    .forEach((line, index) => {
      for (const rule of rules) {
        if (rule.matches(line)) {
          found.push(`${file.path}:${String(index + 1)}: ${rule.name}`);
        }
      }
    });
  return found;
}

/** The violations over `files`, the allowed files skipped. */
function violationsOf(files: readonly SourceFile[]): string[] {
  return files
    .filter((file) => !ALLOWED.includes(file.path))
    .flatMap((file) => fileViolations(file, RULES));
}

/** Every non-test `.ts` file under `src`, read from the working tree. */
function srcTree(): SourceFile[] {
  return listSrcFiles()
    .filter((path) => !path.endsWith(".test.ts"))
    .map((path) => ({
      path,
      source: readFileSync(join(REPO_ROOT, path), "utf8"),
    }));
}

/**
 * The pending allowances that no longer have a reason: a listed file that is
 * not in `files` or has no violation left.
 */
function staleAllowances(
  files: readonly SourceFile[],
  allowances: Readonly<Record<string, PendingAllowance>> = PENDING_PRESENTATION,
): string[] {
  const stale: string[] = [];
  for (const [path, allowance] of Object.entries(allowances)) {
    const file = files.find((candidate) => candidate.path === path);
    if (file === undefined || fileViolations(file, RULES).length === 0) {
      stale.push(
        `${path}: no violation left, remove the allowance (plan ${allowance.plan})`,
      );
    }
  }
  return stale;
}

/** A synthetic source file in a path no allowance names. */
function synthetic(source: string): SourceFile[] {
  return [{ path: "src/app/synthetic.ts", source }];
}

/** The path of `violation` (everything before the first `:<line>:`). */
function pathOf(violation: string): string {
  return violation.slice(0, violation.indexOf(":"));
}

describe("station constants live in the station record only (tripwire)", () => {
  const tree = srcTree();
  const found = violationsOf(tree);

  it("scans more than 200 non-test src files and reads the compiled numbers", () => {
    expect(tree.length).toBeGreaterThan(200);
    expect(tree.some((file) => file.path.endsWith(".test.ts"))).toBe(false);
    expect(RULES.length).toBe(
      STATION_KINDS.length + 2 + STATION_KINDS.length * 3,
    );
    expect(stationNumbers()).toHaveLength(STATION_KINDS.length * 3);
  });

  it("finds no violation outside the allowed file and the pending presentation files", () => {
    const unexpected = found.filter(
      (violation) => !(pathOf(violation) in PENDING_PRESENTATION),
    );
    expect(unexpected, unexpected.join("\n")).toEqual([]);
  });

  it("keeps every pending file a scanned file that still violates", () => {
    const stale = staleAllowances(tree);
    expect(stale, stale.join("\n")).toEqual([]);
  });

  it("allows nothing beyond the station record: no pending presentation file is left (plan 22.1-12)", () => {
    expect(ALLOWED).toEqual(["src/content/stations.ts"]);
    expect(Object.keys(PENDING_PRESENTATION)).toEqual([]);
    for (const path of ALLOWED) {
      expect(path.startsWith("src/render/"), path).toBe(false);
    }
  });

  it("finds no station constant in any src/render file", () => {
    const render = tree.filter((file) => file.path.startsWith("src/render/"));
    expect(render.length).toBeGreaterThan(20);
    const inRender = found.filter((violation) =>
      pathOf(violation).startsWith("src/render/"),
    );
    expect(inRender, inRender.join("\n")).toEqual([]);
  });

  it("holds the three kinds in the allowed file, and STATION_KINDS lists them in order", () => {
    expect(STATION_KINDS).toEqual(["coriolis", "dodecahedron", "icosahedron"]);
    const [allowed] = ALLOWED;
    if (allowed === undefined) throw new Error("no allowed file");
    const record = withoutComments(
      readFileSync(join(REPO_ROOT, allowed), "utf8"),
    );
    for (const kind of STATION_KINDS) {
      expect(
        new RegExp(`\\b${kind}\\b`, "i").test(record),
        `${allowed} no longer declares ${kind}`,
      ).toBe(true);
    }
  });

  it("scans the allowed file's kind words without reporting them", () => {
    const [allowed] = ALLOWED;
    if (allowed === undefined) throw new Error("no allowed file");
    const file: SourceFile = {
      path: allowed,
      source: readFileSync(join(REPO_ROOT, allowed), "utf8"),
    };
    expect(fileViolations(file, RULES).length).toBeGreaterThan(0);
    expect(violationsOf([file])).toEqual([]);
  });
});

describe("each rule fails on its own synthetic source", () => {
  it.each(STATION_KINDS)(
    "fails on the station kind name %s in any case",
    (kind) => {
      const spellings = [
        kind,
        kind.toUpperCase(),
        `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
      ];
      for (const spelling of spellings) {
        const result = violationsOf(
          synthetic(`export const NAME = "${spelling} Station";\n`),
        );
        expect(result, spelling).toHaveLength(1);
        expect(result[0]).toContain("src/app/synthetic.ts:1:");
        expect(result[0]).toContain(`"${kind}"`);
      }
    },
  );

  it("fails on the old layout radius constant name", () => {
    const result = violationsOf(
      synthetic("const radius = STATION_RADIUS * 2;\n"),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("STATION_RADIUS");
  });

  it.each(["CORIOLIS_STATION_MASS", "witchspaceStationMass"])(
    "fails on the old blockage mass name %s",
    (name) => {
      const result = violationsOf(synthetic(`const mass = ${name};\n`));
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("blockage mass");
    },
  );

  it.each(stationNumbers())(
    "fails on a literal of $label",
    ({ label, value }) => {
      const sources = [
        `const n = ${String(value)};\n`,
        `const n = ${literalPrefix(value)};\n`,
        // A thousands-separated integer, as a mass would be written.
        ...(Number.isInteger(value)
          ? [
              `const n = ${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "_")};\n`,
            ]
          : []),
      ];
      for (const source of sources) {
        const result = violationsOf(synthetic(source));
        expect(result, `${label}: ${source}`).toHaveLength(1);
        expect(result[0]).toContain(label);
        expect(result[0]).toContain("src/app/synthetic.ts:1:");
      }
    },
  );

  it("does not fail on a number that merely shares a leading digit", () => {
    // The literal one digit short of the matched prefix is not the number.
    for (const { value } of stationNumbers()) {
      const nearMiss = literalPrefix(value).slice(0, -1);
      expect(nearMiss.length).toBeGreaterThan(3);
      expect(
        violationsOf(synthetic(`const n = ${nearMiss};\n`)),
        nearMiss,
      ).toEqual([]);
    }
  });
});

describe("a comment is not a violation", () => {
  it("allows the same words and numbers in line comments, block comments and doc comments", () => {
    const numbers = stationNumbers().map(({ value }) => String(value));
    const kinds = [...STATION_KINDS];
    const source = [
      `// ${kinds.join(" ")} STATION_RADIUS CORIOLIS_STATION_MASS witchspaceStationMass`,
      `/* ${numbers.join(" ")} */`,
      `/**`,
      ` * ${kinds.map((kind) => kind.toUpperCase()).join(" ")} ${numbers.join(" ")}`,
      ` */`,
      "export const NOTHING = 0;",
      "",
    ].join("\n");
    expect(violationsOf(synthetic(source))).toEqual([]);
  });

  it("does not exempt a literal moved into a string, a template or a regular expression-like token", () => {
    const [mass] = stationNumbers();
    if (mass === undefined) throw new Error("no station numbers");
    const kind: StationKind = STATION_KINDS[0];
    for (const source of [
      `const text = "see ${String(mass.value)}";\n`,
      `const text = \`${kind}-${String(mass.value)}\`;\n`,
    ]) {
      expect(violationsOf(synthetic(source)).length, source).toBeGreaterThan(0);
    }
  });
});

describe("a pending allowance cannot outlive its reason", () => {
  const path = "src/ui/station-model.ts";
  /** A sample allowance, since the real list is empty. */
  const sample: Readonly<Record<string, PendingAllowance>> = {
    [path]: { plan: "sample", reason: "a sample allowance" },
  };

  it("reports a pending file with no violation left as 'remove the allowance'", () => {
    const violating: SourceFile[] = [
      { path, source: 'export const K = "coriolis";\n' },
    ];
    expect(staleAllowances(violating, sample)).toEqual([]);
    const cleaned: SourceFile[] = [{ path, source: "export const A = 1;\n" }];
    const stale = staleAllowances(cleaned, sample);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain(path);
    expect(stale[0]).toContain("remove the allowance");
  });

  it("reports a pending file that no longer exists", () => {
    const stale = staleAllowances(
      srcTree().filter((file) => file.path !== path),
      sample,
    );
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain(path);
    expect(stale[0]).toContain("remove the allowance");
  });
});
