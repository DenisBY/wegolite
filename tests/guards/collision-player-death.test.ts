// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the player's deferred collision reversal (CBT-18, owner rule
 * 2026-11-18, plan 18-18; T-18-52).
 *
 * The collision stage never makes the player `destroyable` before Phase 20
 * owns its death (`PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` in
 * `src/sim/combat/collide.ts`), so Oolite's inelastic reversal for a lethal
 * ram on the player is not taken. That is harmless while the player cannot
 * die. The first death path must settle it, and this guard makes that
 * mechanical: while the marker survives, it fails, naming the todo, on any of
 *
 * - (a) a non-comment `playerDestroyed` token anywhere in `src/sim`,
 *   `src/sim/events.ts` included, other than exactly its two declaration lines
 *   in `events.ts` (the union member and the kind-list entry, matched by their
 *   trimmed text, each once): an emit, a push, a factory, a constant;
 * - (b) the `FlightMode` union in `src/sim/flight/state.ts` not being exactly
 *   `"docked" | "launching" | "inFlight"`: any new mode may be a death path;
 * - (c) `src/sim/combat/ledger.ts` no longer carrying its marker sentence
 *   that the player's energy floors at 0 until the player's death in Phase 20.
 *
 * It keys on producers and on the mode set, never on the declaration, so it
 * is green on the current tree and each trigger has a synthetic input that
 * fails. It is a tripwire, not a proof: a death path spelled without the
 * token, a new mode or a changed floor is not seen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const TODO =
  ".planning/todos/pending/2026-11-19-collision-reversal-on-player-death.md";
const TODO_NAME = "2026-11-19-collision-reversal-on-player-death";

const COLLIDE = "src/sim/combat/collide.ts";
const EVENTS = "src/sim/events.ts";
const FLIGHT_STATE = "src/sim/flight/state.ts";
const LEDGER = "src/sim/combat/ledger.ts";

const MARKER = "PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20";

/** The two declaration lines of `events.ts`, by trimmed text, each once. */
const DECLARATION_LINES: readonly string[] = [
  '| { kind: "playerDestroyed"; position: Vec3 }',
  '"playerDestroyed",',
];

/** The pinned `FlightMode` members. */
const FLIGHT_MODES: readonly string[] = ["docked", "launching", "inFlight"];

/** The ledger's marker sentence (comment markers and line breaks folded). */
const LEDGER_MARKER =
  "the energy floors at 0 until the player's death in Phase 20";

const RULE = `the player may die before the collision reversal is settled: give the player Oolite's inelastic reversal first (see ${TODO})`;
const MODE_RULE = `FlightMode gained a member: review whether it is a player-death path (todo ${TODO_NAME})`;
const MODE_SHAPE_RULE = `FlightMode is not the pinned "docked" | "launching" | "inFlight" union: review whether it is a player-death path (todo ${TODO_NAME})`;
const LEDGER_RULE = `the ledger no longer floors the player's energy at 0 until Phase 20: settle the collision reversal first (see ${TODO})`;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** `source` with comment markers dropped and every whitespace run folded. */
function foldComments(source: string): string {
  return source
    .replace(/^\s*(?:\/\/+|\/?\*+\/?)\s?/gm, "")
    .replace(/\s+/g, " ");
}

/** The members of `FlightMode`, or null when the union is not literal-only. */
function flightModes(source: string): string[] | null {
  const cleaned = withoutComments(source);
  const match = /\bexport\s+type\s+FlightMode\s*=([^;]*);/.exec(cleaned);
  if (match === null) return null;
  const members = (match[1] ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const names: string[] = [];
  for (const member of members) {
    const literal = /^"([^"]*)"$/.exec(member);
    if (literal === null) return null;
    names.push(literal[1] ?? "");
  }
  return names;
}

/**
 * The violations over `files` (repo-relative posix paths and their text):
 * `<path>:<line>: <rule>`. Empty while `collide.ts` lacks the marker (the
 * guard is retired with it) or when no trigger holds.
 */
function playerDeathViolations(files: readonly SourceFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file.source]));
  const collide = byPath.get(COLLIDE);
  if (collide === undefined || !withoutComments(collide).includes(MARKER)) {
    return [];
  }
  const found: string[] = [];

  // (a) Any non-comment `playerDestroyed` outside the two declaration lines.
  for (const { path, source } of files) {
    if (!path.startsWith("src/sim/")) continue;
    const allowed = path === EVENTS ? [...DECLARATION_LINES] : [];
    const lines = withoutComments(source).split("\n");
    lines.forEach((line, index) => {
      if (!/\bplayerDestroyed\b/.test(line)) return;
      const at = allowed.indexOf(line.trim());
      if (at >= 0) {
        allowed.splice(at, 1);
        return;
      }
      found.push(`${path}:${String(index + 1)}: ${RULE}`);
    });
  }

  // (b) The FlightMode union is exactly the three pinned members.
  const state = byPath.get(FLIGHT_STATE);
  const modes = state === undefined ? null : flightModes(state);
  if (modes === null) {
    found.push(`${FLIGHT_STATE}: ${MODE_SHAPE_RULE}`);
  } else {
    const pinned = new Set(FLIGHT_MODES);
    if (modes.some((mode) => !pinned.has(mode))) {
      found.push(`${FLIGHT_STATE}: ${MODE_RULE}`);
    } else if (
      modes.length !== FLIGHT_MODES.length ||
      new Set(modes).size !== FLIGHT_MODES.length
    ) {
      found.push(`${FLIGHT_STATE}: ${MODE_SHAPE_RULE}`);
    }
  }

  // (c) The ledger still floors the player's energy at 0 until Phase 20.
  const ledger = byPath.get(LEDGER);
  if (ledger === undefined || !foldComments(ledger).includes(LEDGER_MARKER)) {
    found.push(`${LEDGER}: ${LEDGER_RULE}`);
  }
  return found;
}

/** Every `.ts` file under `src/sim`, read from the working tree. */
function simTree(): SourceFile[] {
  return listSrcFiles()
    .filter((path) => path.startsWith("src/sim/"))
    .map((path) => ({
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

describe("the player's collision reversal waits for its death path (tripwire)", () => {
  const tree = simTree();

  it("passes on the current tree, and the tree holds what the guard reads", () => {
    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(tree.length).toBeGreaterThanOrEqual(100);
    for (const path of [COLLIDE, EVENTS, FLIGHT_STATE, LEDGER]) {
      expect(tree.map((file) => file.path)).toContain(path);
    }
    expect(withoutComments(sourceOf(tree, COLLIDE))).toContain(MARKER);
    expect(flightModes(sourceOf(tree, FLIGHT_STATE))).toEqual([
      "docked",
      "launching",
      "inFlight",
    ]);
    const found = playerDeathViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("fails on a kill path that pushes the player's death as an object literal", () => {
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
    expect(found[0]).toContain(TODO);
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

  it("fails on a constant that holds the kind's string", () => {
    const found = playerDeathViolations(
      withFile(
        tree,
        "src/sim/flight/death.ts",
        'export const PLAYER_DEATH_KIND = "playerDestroyed" as const;\n',
      ),
    );
    expect(found).toEqual([`src/sim/flight/death.ts:1: ${RULE}`]);
  });

  it('fails when FlightMode gains "destroyed" or "dead"', () => {
    const state = sourceOf(tree, FLIGHT_STATE);
    for (const added of ['"destroyed"', '"dead"']) {
      const found = playerDeathViolations(
        withFile(
          tree,
          FLIGHT_STATE,
          state.replace(
            'export type FlightMode = "docked" | "launching" | "inFlight";',
            `export type FlightMode =\n  | "docked"\n  | "launching"\n  | "inFlight"\n  | ${added};`,
          ),
        ),
      );
      expect(found, added).toEqual([`${FLIGHT_STATE}: ${MODE_RULE}`]);
      expect(found[0]).toContain(
        "FlightMode gained a member: review whether it is a player-death path (todo 2026-11-19-collision-reversal-on-player-death)",
      );
    }
  });

  it("fails when FlightMode is no longer a literal union of the pinned members", () => {
    const state = sourceOf(tree, FLIGHT_STATE);
    const found = playerDeathViolations(
      withFile(
        tree,
        FLIGHT_STATE,
        state.replace(
          'export type FlightMode = "docked" | "launching" | "inFlight";',
          'export type FlightMode = "docked" | "launching" | "inFlight" | DeathMode;',
        ),
      ),
    );
    expect(found).toEqual([`${FLIGHT_STATE}: ${MODE_SHAPE_RULE}`]);
  });

  it("fails when the ledger loses its floor marker sentence", () => {
    const ledger = sourceOf(tree, LEDGER);
    expect(foldComments(ledger)).toContain(LEDGER_MARKER);
    const found = playerDeathViolations(
      withFile(
        tree,
        LEDGER,
        foldComments(ledger).replace(LEDGER_MARKER, "the energy may reach 0"),
      ),
    );
    expect(found).toEqual([`${LEDGER}: ${LEDGER_RULE}`]);
  });

  it("passes on the two events.ts declaration lines with a doc comment naming the kind", () => {
    const found = playerDeathViolations(
      withFile(
        tree,
        EVENTS,
        [
          "/** Reserved: `playerDestroyed` is posted by the player's death (Phase 20). */",
          "export type SimEvent =",
          '  | { kind: "playerDestroyed"; position: Vec3 }',
          '  | { kind: "energyLow"; id: EntityId };',
          "// playerDestroyed is listed below.",
          "export const RESERVED_EVENT_KINDS = [",
          '  "playerDestroyed",',
          '  "energyLow",',
          "] as const;",
          "",
        ].join("\n"),
      ),
    );
    expect(found).toEqual([]);
  });

  it("allows each declaration line once: a second copy in events.ts fails", () => {
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

  it("is retired with the marker: without it a producer passes", () => {
    const collide = sourceOf(tree, COLLIDE);
    const found = playerDeathViolations(
      withFile(
        withFile(
          tree,
          COLLIDE,
          collide.replaceAll(MARKER, "PLAYER_DESTROYABLE"),
        ),
        "src/sim/flight/death.ts",
        'export const PLAYER_DEATH_KIND = "playerDestroyed" as const;\n',
      ),
    );
    expect(found).toEqual([]);
  });
});
