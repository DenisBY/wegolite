// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Kill-credit consumer tripwire (Phase 17, D-10 and D-13.1).
 *
 * `killShip` credits a kill through one asymmetric rule: in a same-tick mutual
 * kill the lower-id victim is credited to the other ship and the higher-id
 * victim ends with no killer, where Oolite's update order decides. That is a
 * recorded divergence and harmless while nothing reads the credit. The first
 * code that does (a bounty, a rating, legal status, a kill message) must settle
 * the asymmetry first; this guard makes that mechanical.
 *
 * It scans comment-stripped `src/**` for two things:
 *
 * - the AI kill notifications `shipTargetDestroyed` and `shipKilledOther`
 *   outside the two files that define and post them, and
 * - a kill-credit read outside the kill path: a `.killer` or `?.killer`
 *   property read, a `["killer"]` index read, or `killer` as a key inside an
 *   object destructuring pattern (`const { killer } = event`, a destructured
 *   parameter `({ killer }) =>`). A local variable, a parameter or an object
 *   literal key that is merely named `killer` is not a read.
 *
 * It is a tripwire, not a proof: it cannot see a credit carried through a
 * renamed alias or a nested destructuring pattern. A legitimate consumer
 * changes the allowlists below in the same commit as the decision recorded in
 * the todo.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SRC_DIR = join(REPO_ROOT, "src");

const KILL_CREDIT_TODO =
  ".planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md";

/** The files that define or post the AI kill notifications. */
const KILL_EVENT_FILES: readonly string[] = [
  "src/sim/ai/types.ts",
  "src/sim/world/kill.ts",
];

/** The kill path: the only files that may read the kill credit. */
const KILL_PATH_FILES: readonly string[] = [
  "src/sim/world/kill.ts",
  "src/sim/combat/ledger.ts",
  "src/sim/combat/step.ts",
  "src/sim/events.ts",
  "src/sim/ai/types.ts",
];

const KILL_CREDIT_RULE = `kill credit has a consumer: revisit the asymmetric same-tick mutual-kill credit first (D-10), see ${KILL_CREDIT_TODO}`;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/**
 * Drop `//` line comments and block comments while keeping string and template
 * literals intact and preserving every newline. Local on purpose: each guard in
 * this directory stays independent of the others' helpers.
 */
function withoutComments(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
    } else if (char === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") out += "\n";
        index += 1;
      }
      index += 2;
      out += " ";
    } else if (char === '"' || char === "'" || char === "`") {
      out += char;
      index += 1;
      while (index < source.length && source[index] !== char) {
        if (source[index] === "\\") {
          out += source[index] as string;
          index += 1;
        }
        out += source[index] ?? "";
        index += 1;
      }
      out += char;
      index += 1;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

/** The 1-based line of character offset `offset` in `text`. */
function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") line += 1;
  }
  return line;
}

/** A property read: `x.killer` or `x?.killer`, but not the spread `...killer`. */
const PROPERTY_READ = /(?:\?\.|(?<!\.)\.)\s*killer\b/g;

/** An index read: `x["killer"]`. */
const INDEX_READ = /\[\s*["'`]killer["'`]\s*\]/g;

/**
 * A flat object pattern naming `killer` as a key, in a destructuring
 * declaration (`const { killer } = e`), a destructured parameter
 * (`({ killer }) =>`) or a typed destructured parameter (`({ killer }: Ev)`).
 * `{ victim: killer }` renames into a local and does not match: the key is
 * `victim`.
 */
const DESTRUCTURING_READ =
  /\{([^{}]*)\}\s*(?:=(?![=>])|\)\s*=>|:\s*[A-Za-z_][\w.<>[\]| ]*\s*[,)=])/g;

/** Whether the inside of an object pattern lists `killer` as a key. */
function patternHasKillerKey(inside: string): boolean {
  return /(?:^|,)\s*killer\s*(?::|,|=|$)/.test(inside.replace(/\s+/g, " "));
}

/** Violations over `files`: `<path>:<line>: <rule>`; comments never count. */
function killCreditViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    const cleaned = withoutComments(source);

    if (!KILL_EVENT_FILES.includes(path)) {
      for (const match of cleaned.matchAll(
        /\b(?:shipTargetDestroyed|shipKilledOther)\b/g,
      )) {
        found.push(
          `${path}:${lineOf(cleaned, match.index)}: ${KILL_CREDIT_RULE}`,
        );
      }
    }

    if (KILL_PATH_FILES.includes(path)) continue;
    for (const pattern of [PROPERTY_READ, INDEX_READ]) {
      for (const match of cleaned.matchAll(pattern)) {
        found.push(
          `${path}:${lineOf(cleaned, match.index)}: ${KILL_CREDIT_RULE}`,
        );
      }
    }
    for (const match of cleaned.matchAll(DESTRUCTURING_READ)) {
      if (!patternHasKillerKey(match[1] ?? "")) continue;
      found.push(
        `${path}:${lineOf(cleaned, match.index)}: ${KILL_CREDIT_RULE}`,
      );
    }
  }
  return found;
}

/** Every `.ts` file under `src`, repo-relative posix, code-unit ordered. */
function listSrcFiles(): string[] {
  const found: string[] = [];
  const walk = (directory: string, relative: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith("__purity_")) continue;
      const rel = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), rel);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        found.push(rel);
      }
    }
  };
  walk(SRC_DIR, "src");
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

describe("kill credit has no consumer outside the kill path", () => {
  const APP = "src/app/session/x.ts";
  const violationsOf = (source: string, path = APP): string[] =>
    killCreditViolations([{ path, source }]);

  it("finds no consumer anywhere in src today", () => {
    const files = listSrcFiles();

    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(100);
    for (const path of [...KILL_EVENT_FILES, ...KILL_PATH_FILES]) {
      expect(files).toContain(path);
    }

    const found = killCreditViolations(
      files.map((path) => ({
        path,
        source: readFileSync(join(REPO_ROOT, path), "utf8"),
      })),
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("names the todo in its message", () => {
    const found = violationsOf("const who = event.killer;\n");

    expect(found).toEqual([`${APP}:1: ${KILL_CREDIT_RULE}`]);
    expect(found[0]).toContain(
      ".planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md",
    );
  });

  it("reports a property read and an optional property read", () => {
    expect(violationsOf("const a = event.killer;\n")).toHaveLength(1);
    expect(violationsOf("const a = event?.killer;\n")).toHaveLength(1);
    expect(violationsOf("const a = event.\n  killer;\n")).toHaveLength(1);
  });

  it("reports an index read", () => {
    expect(violationsOf('const a = event["killer"];\n')).toHaveLength(1);
  });

  it("reports a destructuring declaration naming killer", () => {
    expect(violationsOf("const { killer } = event;\n")).toHaveLength(1);
    expect(violationsOf("const { victim, killer } = event;\n")).toHaveLength(1);
    expect(violationsOf("const { killer: who } = event;\n")).toHaveLength(1);
    expect(
      violationsOf("const { killer = NO_ENTITY } = event;\n"),
    ).toHaveLength(1);
  });

  it("reports a destructured parameter naming killer", () => {
    expect(violationsOf("events.map(({ killer }) => killer);\n")).toHaveLength(
      1,
    );
    expect(
      violationsOf("function f({ killer }: Ev, other: number) {}\n"),
    ).toHaveLength(1);
  });

  it("reports the AI kill notifications outside the two files that post them", () => {
    const pilot = [
      "switch (event.name) {",
      '  case "shipKilledOther":',
      "    break;",
      "}",
      "",
    ].join("\n");

    expect(violationsOf(pilot, "src/sim/ai/pilots/x.ts")).toEqual([
      `src/sim/ai/pilots/x.ts:2: ${KILL_CREDIT_RULE}`,
    ]);
    expect(violationsOf('const n = "shipTargetDestroyed";\n')).toHaveLength(1);
  });

  it("allows the kill path to read the credit and to name the events", () => {
    expect(
      violationsOf("const who = hit.killer;\n", "src/sim/combat/step.ts"),
    ).toEqual([]);
    expect(
      violationsOf(
        'postAiEvent(w, { name: "shipKilledOther" });\n',
        "src/sim/world/kill.ts",
      ),
    ).toEqual([]);
    // The kill-event allowlist is narrower than the credit-read allowlist.
    expect(
      violationsOf('const n = "shipKilledOther";\n', "src/sim/events.ts"),
    ).toHaveLength(1);
  });

  it("passes a local, a parameter or an object literal merely named killer", () => {
    const text = [
      "const killer = 3;",
      "function normalise(victim: number, killer: number): number {",
      "  return killer + victim;",
      "}",
      "const record = ({ victim, killer });",
      "const spread = [...killer];",
      "const renamed = (({ victim: killer }) => killer);",
      "const pairs = entries.map(([victim, killer]) => ({ victim, killer }));",
      "",
    ].join("\n");

    expect(violationsOf(text)).toEqual([]);
  });

  it("ignores the credit and the events named in comments", () => {
    const text = [
      "// reads event.killer and shipKilledOther",
      "/* const { killer } = event; shipTargetDestroyed */",
      "/**",
      " * hit.killer, event?.killer, event['killer']",
      " */",
      "export const ok = 1;",
      "",
    ].join("\n");

    expect(violationsOf(text)).toEqual([]);
  });

  it("reports at the line of the read", () => {
    const text = ["const a = 1;", "", "const who = event.killer;", ""].join(
      "\n",
    );

    expect(violationsOf(text)).toEqual([`${APP}:3: ${KILL_CREDIT_RULE}`]);
  });
});
