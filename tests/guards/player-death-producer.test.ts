// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The single death path (DEATH-01, D-04, D-11).
 *
 * The player dies through one function, `killPlayer` (`src/sim/combat/death.ts`),
 * called once from `resolveShots` (`src/sim/combat/step.ts`), and `killPlayer`
 * is the only producer of the `playerDestroyed` event. This guard replaces the
 * producer rule of the tripwire that Phase 20's death commit retired
 * (`collision-player-death.test.ts`) and keys on producers and emits, never on
 * the declaration. Over every `.ts` file under `src/`, on non-comment lines, it
 * reports `<path>:<line>: <rule>` for:
 *
 * - (a) the `playerDestroyed` token under `src/sim/` anywhere except exactly one
 *   line in `death.ts` (the push in `killPlayer`) and the two declaration lines
 *   of `events.ts` (the `SimEvent` union member and the `RESERVED_EVENT_KINDS`
 *   entry, matched by trimmed text, each once);
 * - (b) a `killPlayer(` call anywhere except its definition in `death.ts` and
 *   exactly one call in `step.ts`;
 * - (c) the token outside `src/sim/` in any file other than the one enumerated
 *   consumer, `src/app/session/event-router.ts`;
 * - (d) outside `death.ts`, a line that builds the event: an object property
 *   `kind: "playerDestroyed"` on a line that is not a type position, so even
 *   the enumerated consumer cannot emit it.
 *
 * Each offending line is reported once. It is a tripwire, not a proof: a death
 * path spelled without the token or the call is not seen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const DEATH = "src/sim/combat/death.ts";
const STEP = "src/sim/combat/step.ts";
const EVENTS = "src/sim/events.ts";
/** The one app file that consumes the kind (20-04 routes it there). */
const CONSUMER = "src/app/session/event-router.ts";

/** The two declaration lines of `events.ts`, by trimmed text, each once. */
const DECLARATION_LINES: readonly string[] = [
  '| { kind: "playerDestroyed"; position: Vec3; cause: PlayerDeathCause }',
  '"playerDestroyed",',
];

const ONE_PATH =
  "the player's death has one producer, killPlayer, called once from resolveShots (DEATH-01)";

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** Whether the line only names the kind in a type (a union member or `Extract<`). */
function isTypePosition(line: string): boolean {
  const text = line.trim();
  return text.startsWith("|") || text.startsWith("&") || /Extract</.test(text);
}

/**
 * The violations over `files` (repo-relative posix paths and their text):
 * `<path>:<line>: <rule>`, each line once, in file then line order.
 */
function playerDeathViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    const lines = withoutComments(source).split("\n");
    const inSim = path.startsWith("src/sim/");
    const declarations = path === EVENTS ? [...DECLARATION_LINES] : [];
    let deathPushes = 0;
    let stepCalls = 0;
    lines.forEach((line, index) => {
      const at = `${path}:${String(index + 1)}`;
      const names = /\bplayerDestroyed\b/.test(line);
      let reported = false;
      const report = (rule: string): void => {
        if (reported) return;
        reported = true;
        found.push(`${at}: ${rule}`);
      };

      if (names) {
        if (inSim) {
          // (a) The token under src/sim: the push in death.ts, once, and the two
          // declaration lines of events.ts, each once.
          if (path === DEATH) {
            deathPushes += 1;
            if (deathPushes > 1)
              report(`a second playerDestroyed in death.ts: ${ONE_PATH}`);
          } else {
            const declared = declarations.indexOf(line.trim());
            if (declared >= 0) {
              declarations.splice(declared, 1);
            } else {
              report(`playerDestroyed outside its one producer: ${ONE_PATH}`);
            }
          }
        } else if (path !== CONSUMER) {
          // (c) Outside src/sim only the enumerated consumer may name the kind.
          report(
            `playerDestroyed in an unlisted app file (only ${CONSUMER} consumes it): ${ONE_PATH}`,
          );
        }
      }

      // (d) A line that builds the event, outside death.ts.
      if (
        path !== DEATH &&
        /\bkind\s*:\s*["'`]playerDestroyed["'`]/.test(line) &&
        !isTypePosition(line)
      ) {
        report(`a line builds playerDestroyed outside death.ts: ${ONE_PATH}`);
      }

      // (b) A killPlayer( call: the definition in death.ts and one call in step.ts.
      if (/\bkillPlayer\s*\(/.test(line)) {
        if (path === DEATH && /\bfunction\s+killPlayer\s*\(/.test(line)) {
          // The definition.
        } else if (path === STEP) {
          stepCalls += 1;
          if (stepCalls > 1)
            report(`a second killPlayer( call in step.ts: ${ONE_PATH}`);
        } else {
          report(`killPlayer( called outside resolveShots: ${ONE_PATH}`);
        }
      }
    });
    if (path === DEATH && deathPushes === 0) {
      found.push(
        `${path}:1: death.ts must hold exactly one playerDestroyed push, found none: ${ONE_PATH}`,
      );
    }
    if (path === STEP && stepCalls === 0) {
      found.push(
        `${path}:1: step.ts must hold exactly one killPlayer( call, found none: ${ONE_PATH}`,
      );
    }
    for (const missing of declarations) {
      found.push(`${path}:1: the declaration line ${missing} is missing`);
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

describe("playerDestroyed has one producer, killPlayer (DEATH-01)", () => {
  const tree = srcTree();

  it("passes on the current tree, and the tree holds what the guard reads", () => {
    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(tree.length).toBeGreaterThanOrEqual(100);
    for (const path of [DEATH, EVENTS, STEP]) {
      expect(tree.map((file) => file.path)).toContain(path);
    }
    expect(withoutComments(sourceOf(tree, DEATH))).toContain(
      'kind: "playerDestroyed"',
    );
    const found = playerDeathViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("fails on a kill path that pushes the death as an object literal", () => {
    const kill = sourceOf(tree, "src/sim/world/kill.ts");
    const found = playerDeathViolations(
      withFile(
        tree,
        "src/sim/world/kill.ts",
        `${kill}\nexport function diePlayer(events: SimEvent[], position: Vec3): void {\n  events.push({ kind: "playerDestroyed", position });\n}\n`,
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/sim\/world\/kill\.ts:\d+: /);
    expect(found[0]).toContain("killPlayer");
  });

  it("fails on a factory beside the two declaration lines in events.ts", () => {
    const events = sourceOf(tree, EVENTS);
    const found = playerDeathViolations(
      withFile(
        tree,
        EVENTS,
        `${events}\nexport const playerDied = (position: Vec3): SimEvent => ({\n  kind: "playerDestroyed",\n  position,\n});\n`,
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/sim\/events\.ts:\d+: /);
  });

  it("fails on a constant that holds the kind's string in a new sim file", () => {
    const found = playerDeathViolations(
      withFile(
        tree,
        "src/sim/flight/death-kind.ts",
        'export const PLAYER_DEATH_KIND = "playerDestroyed" as const;\n',
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/sim\/flight\/death-kind\.ts:1: /);
  });

  it("fails on a second killPlayer( call in sim.ts and in step.ts", () => {
    const sim = sourceOf(tree, "src/sim/sim.ts");
    const inSim = playerDeathViolations(
      withFile(
        tree,
        "src/sim/sim.ts",
        `${sim}\nkillPlayer(player, combat, { damage: "laser" }, events);\n`,
      ),
    );
    expect(inSim).toHaveLength(1);
    expect(inSim[0]).toMatch(/^src\/sim\/sim\.ts:\d+: /);

    const step = sourceOf(tree, STEP);
    const inStep = playerDeathViolations(
      withFile(
        tree,
        STEP,
        `${step}\nkillPlayer(player, combat, { damage: "laser" }, events);\n`,
      ),
    );
    expect(inStep).toHaveLength(1);
    expect(inStep[0]).toMatch(/^src\/sim\/combat\/step\.ts:\d+: /);
  });

  it("fails when resolveShots no longer calls killPlayer", () => {
    const step = sourceOf(tree, STEP);
    const found = playerDeathViolations(
      withFile(tree, STEP, step.replace(/killPlayer\(/g, "killNobody(")),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("exactly one killPlayer( call");
  });

  it("fails on the token in an unlisted app file", () => {
    const found = playerDeathViolations(
      withFile(
        tree,
        "src/app/session/frame-loop.ts",
        'if (event.kind === "playerDestroyed") stop();\n',
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/app\/session\/frame-loop\.ts:1: /);
    expect(found[0]).toContain(CONSUMER);
  });

  it("fails on an object literal that builds the event inside the consumer", () => {
    const found = playerDeathViolations(
      withFile(
        tree,
        CONSUMER,
        'const fake = { kind: "playerDestroyed", position, cause };\n',
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/app\/session\/event-router\.ts:1: /);
    expect(found[0]).toContain("builds playerDestroyed");
  });

  it("passes on the three consumer shapes in the event router and a doc comment naming the kind", () => {
    const consumer = [
      "/** The router reads `playerDestroyed` from the sim (DEATH-01). */",
      "const ROUTED = [",
      '  "playerDestroyed",',
      "] as const;",
      "const table = {",
      "  playerDestroyed: (event: Died) => latch(event),",
      "};",
      'if (event.kind === "playerDestroyed") latch(event);',
      'type Died = Extract<SimEvent, { kind: "playerDestroyed" }>;',
      "",
    ].join("\n");
    expect(playerDeathViolations(withFile(tree, CONSUMER, consumer))).toEqual(
      [],
    );
  });

  it("allows each events.ts declaration line once: a second copy fails", () => {
    const events = sourceOf(tree, EVENTS);
    const found = playerDeathViolations(
      withFile(
        tree,
        EVENTS,
        `${events}\nexport const DEATH_KINDS = [\n  "playerDestroyed",\n] as const;\n`,
      ),
    );
    expect(found).toHaveLength(1);
  });

  it("ignores the kind and the call named in comments", () => {
    const found = playerDeathViolations(
      withFile(
        tree,
        "src/sim/flight/notes.ts",
        [
          "// playerDestroyed is posted by killPlayer( in death.ts",
          "/**",
          ' * kind: "playerDestroyed", killPlayer(player)',
          " */",
          "export const ok = 1;",
          "",
        ].join("\n"),
      ),
    );
    expect(found).toEqual([]);
  });
});
