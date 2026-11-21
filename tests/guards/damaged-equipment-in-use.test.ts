// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the in-use clauses of damaged equipment that Wegolite cannot
 * exercise yet (Phase 19, decision D-06, plan 19-15).
 *
 * Oolite's behaviour for damaged items has three in-use clauses that need an
 * in-use state Wegolite does not have: the autopilot disengages when the
 * docking computer is damaged (`ShipEntity.m:3327-3330`), a galactic jump
 * aborts with a damaged drive (`PlayerEntity.m:3432-3440`) and a damaged ANA
 * provides nothing (`ShipEntity.m:2803-2818`). They are recorded as not
 * applicable today in
 * `.planning/todos/pending/2026-11-21-damaged-equipment-in-use.md`, and this
 * guard makes the deferral mechanical (the deferred-work rule: a deferred fix
 * is a todo plus a guard that fails on its first consumer). It fails, naming
 * the todo and Oolite's clause, on any of
 *
 * - (a) a non-comment `autopilot` token (case-insensitive) in any
 *   `src/**\/*.ts` file;
 * - (b) a non-comment `EQ_GAL_DRIVE` token in a `src/**\/*.ts` file other than
 *   `src/sim/player/outfitting.ts`, or a number of them in `outfitting.ts`
 *   other than its pin;
 * - (c) the same for `EQ_ADVANCED_NAVIGATIONAL_ARRAY`.
 *
 * `outfitting.ts` is the one home of the two keys (the F3 visible list and the
 * single-instance list), and it is pinned, not exempt: the pins live in
 * `OUTFITTING_KEY_PINS`, 2 per key (`VISIBLE_EQUIPMENT_KEYS` and
 * `SINGLE_INSTANCE_KEYS`), so a re-export or alias added there (for example
 * `export const GAL_DRIVE_KEY = "EQ_GAL_DRIVE"`) moves the count and fails.
 * Raise a pin only for a new list entry that is not a consumer (plan 19-03
 * raises both to 3 with its `DAMAGEABLE_EQUIPMENT_KEYS`); a consumer is not a
 * reason to raise it, it takes the todo's damaged-item clause with it.
 *
 * It keys on spelling, so it is green on the current tree and each trigger has
 * a synthetic input that fails. It is a limited tripwire, not a proof: a
 * consumer that never spells a key or the word autopilot (for example one that
 * reads a key from an existing list by position, or that calls its feature
 * `autoDock`) is not seen, which is why the todo also asks the first consumer
 * for a damaged-item test at its own simulation boundary.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const TODO = ".planning/todos/pending/2026-11-21-damaged-equipment-in-use.md";

/** The one file that may spell the two keys, matched by its repo-relative path. */
const OUTFITTING = "src/sim/player/outfitting.ts";

/**
 * The non-comment token count of each key in `OUTFITTING`, measured at
 * `0d922a2`: `outfitting.ts:78, 96` (`EQ_GAL_DRIVE`) and `:80, 98` (the ANA),
 * the visible list and the single-instance list. 19-03 raises both to 3 in the
 * commit that adds `DAMAGEABLE_EQUIPMENT_KEYS`.
 */
const OUTFITTING_KEY_PINS = {
  EQ_GAL_DRIVE: 2,
  EQ_ADVANCED_NAVIGATIONAL_ARRAY: 2,
} as const;

type PinnedKey = keyof typeof OUTFITTING_KEY_PINS;

const KEYS = Object.keys(OUTFITTING_KEY_PINS) as PinnedKey[];

const AUTOPILOT_RULE = `an autopilot consumer appeared: disengage the autopilot with "Autopilot disengaged." when the docking computer is damaged while it is engaged (Oolite ShipEntity.m:3327-3330) and add a damaged-item test at its own simulation boundary (see ${TODO})`;

/** The clause each key's first consumer must take with it. */
const KEY_CLAUSES: Readonly<Record<PinnedKey, string>> = {
  EQ_GAL_DRIVE: `a galactic-jump consumer appeared: refuse to start a jump with a damaged drive and abort a countdown when it is damaged (Oolite PlayerEntity.m:3432-3440), with a damaged-item test at its own simulation boundary (see ${TODO})`,
  EQ_ADVANCED_NAVIGATIONAL_ARRAY: `an ANA consumer appeared: a damaged ANA provides nothing, so the chart route, the ANA mode keys, the next-hop target and the mission charts fall back to their plain behaviour (Oolite ShipEntity.m:2803-2818, GuiDisplayGen.m:1696, PlayerEntityControls.m:1895, PlayerEntity.m:601 and 11210-11244), with a damaged-item test at its own simulation boundary (see ${TODO})`,
};

const PIN_HINT =
  "raise the pin in OUTFITTING_KEY_PINS only for a new list entry that is not a consumer (for example the damageable set); a consumer takes the todo's damaged-item clause with it";

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** How many times `key` occurs in `text`. */
function occurrences(text: string, key: string): number {
  return text.split(key).length - 1;
}

/**
 * The violations over `files` (repo-relative posix paths and their text):
 * `<path>:<line>: <rule>` per offending token line, and `<path>: <rule>` for a
 * pinned-count mismatch in `outfitting.ts`, in file then trigger order.
 */
function inUseViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    const cleaned = withoutComments(source);
    cleaned.split("\n").forEach((line, index) => {
      const where = `${path}:${String(index + 1)}`;
      // (a) A non-comment `autopilot` token, any case.
      if (/autopilot/i.test(line)) found.push(`${where}: ${AUTOPILOT_RULE}`);
      // (b), (c) A key outside `outfitting.ts` (its count is pinned below).
      if (path === OUTFITTING) return;
      for (const key of KEYS) {
        if (line.includes(key)) found.push(`${where}: ${KEY_CLAUSES[key]}`);
      }
    });
    if (path !== OUTFITTING) continue;
    // (b), (c) In `outfitting.ts` the count of each key equals its pin.
    for (const key of KEYS) {
      const count = occurrences(cleaned, key);
      if (count !== OUTFITTING_KEY_PINS[key]) {
        found.push(
          `${path}: ${key} appears ${String(count)} times in non-comment code, pinned at ${String(OUTFITTING_KEY_PINS[key])}: ${KEY_CLAUSES[key]}; ${PIN_HINT}`,
        );
      }
    }
  }
  return found;
}

/** Every `.ts` file under `src`, read from the working tree. */
function srcTree(): SourceFile[] {
  return listSrcFiles().map((path) => ({
    path,
    source: readFileSync(join(REPO_ROOT, path), "utf8"),
  }));
}

/** The tree with `path` replaced by (or extended with) `source`. */
function withFile(
  tree: readonly SourceFile[],
  path: string,
  source: string,
): SourceFile[] {
  return [...tree.filter((file) => file.path !== path), { path, source }];
}

function sourceOf(tree: readonly SourceFile[], path: string): string {
  const file = tree.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`no ${path} in the tree`);
  return file.source;
}

describe("damaged equipment's in-use clauses wait for their consumers (tripwire)", () => {
  const tree = srcTree();

  it("passes on the current tree", () => {
    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(tree.length).toBeGreaterThanOrEqual(100);
    const found = inUseViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("(a) fails on a non-comment autopilot token, naming the todo and the clause", () => {
    const found = inUseViolations([
      ...tree,
      {
        path: "src/sim/flight/auto.ts",
        source: "export interface Hud {\n  autopilotEngaged: boolean;\n}\n",
      },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/sim\/flight\/auto\.ts:2: /);
    expect(found[0]).toContain(TODO);
    expect(found[0]).toContain("Autopilot disengaged.");
    expect(found[0]).toContain("ShipEntity.m:3327-3330");
  });

  it("(a) is case-insensitive and sees a string literal", () => {
    const found = inUseViolations([
      {
        path: "src/ui/messages.ts",
        source: 'export const OFF = "Autopilot disengaged.";\n',
      },
    ]);
    expect(found).toHaveLength(1);
  });

  it("(a) passes on the same word inside a line or block comment", () => {
    const found = inUseViolations([
      {
        path: "src/sim/dock/note.ts",
        source: [
          "// Shift+C is Oolite's fast autopilot.",
          "/** The ordinary autopilot is not modelled. */",
          "/*",
          " * autopilotEngaged is not a field.",
          " */",
          "export const DOCKED = true;",
          "",
        ].join("\n"),
      },
    ]);
    expect(found).toEqual([]);
  });

  describe("the galactic drive and the ANA keys", () => {
    const outfitting = sourceOf(tree, OUTFITTING);
    const ALIAS = 'export const GAL_DRIVE_KEY = "EQ_GAL_DRIVE";';
    const ANA_ALIAS =
      'export const ANA_KEY = "EQ_ADVANCED_NAVIGATIONAL_ARRAY";';

    it("holds the real outfitting.ts at its pins (the pins are today's counts)", () => {
      const cleaned = withoutComments(outfitting);
      for (const key of KEYS) {
        expect(occurrences(cleaned, key), key).toBe(OUTFITTING_KEY_PINS[key]);
      }
    });

    it("(b) fails on EQ_GAL_DRIVE in another file, naming the todo and the clause", () => {
      const found = inUseViolations(
        withFile(
          tree,
          "src/sim/flight/galactic.ts",
          'if (!owned.has("EQ_GAL_DRIVE")) return;\n',
        ),
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^src\/sim\/flight\/galactic\.ts:1: /);
      expect(found[0]).toContain(TODO);
      expect(found[0]).toContain("PlayerEntity.m:3432-3440");
    });

    it("(c) fails on EQ_ADVANCED_NAVIGATIONAL_ARRAY in another file, naming the ANA clause and its lines", () => {
      const found = inUseViolations(
        withFile(
          tree,
          "src/ui/chart.ts",
          'export const ANA = "EQ_ADVANCED_NAVIGATIONAL_ARRAY";\n',
        ),
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^src\/ui\/chart\.ts:1: /);
      expect(found[0]).toContain(TODO);
      for (const line of [
        "ShipEntity.m:2803-2818",
        "GuiDisplayGen.m:1696",
        "PlayerEntityControls.m:1895",
        "PlayerEntity.m:601",
        "11210-11244",
      ]) {
        expect(found[0]).toContain(line);
      }
    });

    it("fails on the real outfitting.ts text plus an alias line, per key", () => {
      for (const [alias, key] of [
        [ALIAS, "EQ_GAL_DRIVE"],
        [ANA_ALIAS, "EQ_ADVANCED_NAVIGATIONAL_ARRAY"],
      ] as const) {
        const found = inUseViolations(
          withFile(tree, OUTFITTING, `${outfitting}\n${alias}\n`),
        );
        expect(found, key).toHaveLength(1);
        expect(found[0]).toContain(`${OUTFITTING}: ${key} appears 3 times`);
        expect(found[0]).toContain("pinned at 2");
        expect(found[0]).toContain(TODO);
        // The message says when raising the pin is right and when it is not.
        expect(found[0]).toContain(
          "only for a new list entry that is not a consumer",
        );
        expect(found[0]).toContain(
          "a consumer takes the todo's damaged-item clause",
        );
      }
    });

    it("fails when a pinned key disappears from outfitting.ts", () => {
      const found = inUseViolations(
        withFile(tree, OUTFITTING, outfitting.replace('"EQ_GAL_DRIVE",', "")),
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toContain("EQ_GAL_DRIVE appears 1 times");
    });

    it("passes on the alias lines inside comments in outfitting.ts", () => {
      const found = inUseViolations(
        withFile(
          tree,
          OUTFITTING,
          `${outfitting}\n// ${ALIAS}\n/* ${ANA_ALIAS} */\n`,
        ),
      );
      expect(found).toEqual([]);
    });

    it("passes on either key inside a comment elsewhere", () => {
      const found = inUseViolations(
        withFile(
          tree,
          "src/sim/flight/galactic.ts",
          [
            "// The EQ_GAL_DRIVE drive is not modelled.",
            "/** EQ_ADVANCED_NAVIGATIONAL_ARRAY charts are not drawn. */",
            "export const JUMP = false;",
            "",
          ].join("\n"),
        ),
      );
      expect(found).toEqual([]);
    });

    it("matches outfitting.ts by its repo-relative path, not its base name", () => {
      const found = inUseViolations(
        withFile(tree, "src/ui/outfitting.ts", outfitting),
      );
      // The copy has no pin: each of its four key lines fails.
      expect(found).toHaveLength(4);
      expect(
        found.every((line) => line.startsWith("src/ui/outfitting.ts:")),
      ).toBe(true);
    });
  });
});
