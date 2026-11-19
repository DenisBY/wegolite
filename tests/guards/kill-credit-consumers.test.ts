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
 * - the whole word `killer` outside the kill path. Every way to read the credit
 *   names the field: a property or index read, a destructuring pattern, an
 *   alias of the type. A local variable that is merely named `killer` is flagged
 *   too, which is the signal the guard wants to raise: a new file talking about
 *   a killer is where the credit gets consumed.
 *
 * It is a tripwire, not a proof: it cannot see a credit carried by a name other
 * than `killer`. A legitimate consumer changes the allowlists below in the same
 * commit as the decision recorded in the todo.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lineOf, listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const KILL_CREDIT_TODO =
  ".planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md";

/** The files that define or post the AI kill notifications. */
const KILL_EVENT_FILES: readonly string[] = [
  "src/sim/ai/types.ts",
  "src/sim/world/kill.ts",
];

/** The kill path: the only files that may name the kill credit. */
const KILL_PATH_FILES: readonly string[] = [
  "src/sim/world/kill.ts",
  "src/sim/combat/ledger.ts",
  "src/sim/combat/step.ts",
  "src/sim/events.ts",
];

const KILL_CREDIT_RULE = `kill credit has a consumer: revisit the asymmetric same-tick mutual-kill credit first (D-10), see ${KILL_CREDIT_TODO}`;

interface SourceFile {
  readonly path: string;
  readonly source: string;
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
    for (const match of cleaned.matchAll(/\bkiller\b/g)) {
      found.push(
        `${path}:${lineOf(cleaned, match.index)}: ${KILL_CREDIT_RULE}`,
      );
    }
  }
  return found;
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

  it("reports every way to read the credit: property, optional property, index, destructuring, alias", () => {
    for (const source of [
      "const a = event.killer;\n",
      "const a = event?.killer;\n",
      "const a = event.\n  killer;\n",
      'const a = event["killer"];\n',
      "const { killer } = event;\n",
      "const { victim, killer: who } = event;\n",
      "events.map(({ killer }) => killer);\n",
      "const { victim: { killer } } = event;\n",
      "const k = event; const who = k[`killer`];\n",
      "type Credit = Event['killer'];\n",
    ]) {
      expect(violationsOf(source), source).not.toEqual([]);
    }
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

  it("flags a local merely named killer, and passes the other words", () => {
    expect(violationsOf("const killer = 3;\n")).toHaveLength(1);
    expect(
      violationsOf(
        "const killers = 1; const killerX = 2; const bekiller = 3;\n",
      ),
    ).toEqual([]);
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
