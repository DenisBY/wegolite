// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * HUD message length tripwire (owner decision 2026-11-20, after plan 18-07).
 *
 * Oolite never truncates a HUD message: `printLongText:` word-wraps it into
 * extra rows (`Universe.m:6403`, `GuiDisplayGen.m:736-794`). Wegolite draws one
 * row per message and clamps it to `MAX_MESSAGE_CHARS` with an ellipsis, so a
 * longer message loses its end on screen. Until the word wrap is ported, every
 * message Wegolite writes must fit the budget; this guard fails when one
 * outgrows it, and when the witch-blocked copy starts naming its blocker
 * dynamically (real NPC ship names in place of "a ship"), which is the first
 * consumer of the word wrap: Oolite's "Witchspace jump aborted (too close to
 * [blockerName])." with "Sidewinder Scout Ship" is 61 characters.
 *
 * It checks three things, each deterministic:
 *
 * - the body of `refusalCopy` holds only fixed string literals that fit;
 * - every string literal of the HUD message subscriber
 *   (`src/app/session/event-router.ts`) fits;
 * - every message built from compiled content or default bindings fits: the
 *   ident lock for every NPC and static name, the arrival line for every
 *   system, and every hint.
 *
 * Three messages were longer than the first budget (55) and were cut on screen:
 * the two docking bounce lines and the default pitch and roll hint. The owner
 * raised the budget to 60 the same day so they fit whole; no message is
 * exempt. They stay below as witnesses: the guard fails if the scan stops
 * producing one of them, so it cannot silently lose sight of the longest lines.
 *
 * It is a tripwire, not a proof: a message assembled elsewhere is not seen. The
 * fix for every failure is the todo below, or a shorter wording.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { withoutComments } from "./source-scan.js";
import {
  CARGO_DESTROYED_TEMPLATE,
  EQUIPMENT_DAMAGED_TEMPLATE,
  formatDamageMessage,
  formatIdentLocked,
  IDENT_LOCKED_TEMPLATE,
} from "../../src/app/session/event-router.js";
import { hintText } from "../../src/app/hints.js";
import { STATION_KINDS, stationRecord } from "../../src/content/stations.js";
import { createBindingMap } from "../../src/input/bindings.js";
import { MAX_MESSAGE_CHARS } from "../../src/render/hud/format.js";
import { HINT_IDS } from "../../src/settings/schema.js";

const REPO_ROOT = process.cwd();

/** The fixed start of every witch-blocked line; a station line ends in its name. */
const WITCH_BLOCKED_PREFIX = "Witchspace jump aborted: too close to ";

const WORD_WRAP_TODO =
  ".planning/todos/pending/2026-11-20-hud-message-word-wrap-like-oolite.md";

const RULE = `longer than MAX_MESSAGE_CHARS (${String(MAX_MESSAGE_CHARS)}): the HUD would cut it with an ellipsis; port Oolite's word wrap first, see ${WORD_WRAP_TODO}`;

/**
 * The longest messages the scan sees, once cut at the old budget of 55 (owner
 * decision 2026-11-20 raised it to 60): two docking bounce lines
 * (`bounceMessage`) and the pitch and roll hint with the default bindings
 * (`hintText("pitchRoll")`). If a wording changes, update it here.
 */
const LONGEST_WITNESSES: readonly string[] = [
  "Too wide for the slot - roll 90 degrees to match the opening",
  "Hull contact - roll 90 degrees and line up with the slot",
  "Up arrow / Down arrow pitch, Left arrow / Right arrow roll",
];

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/** Every double- or single-quoted literal of comment-free `source`. */
function quotedLiterals(source: string): string[] {
  return [
    ...source.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g),
  ].map((match) => match[1] ?? match[2] ?? "");
}

/** The comment-free body of `function <name>(`, braces balanced. */
function functionBody(source: string, name: string): string {
  const cleaned = withoutComments(source);
  const start = cleaned.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const open = cleaned.indexOf("{", cleaned.indexOf(")", start));
  let depth = 0;
  for (let index = open; index < cleaned.length; index += 1) {
    if (cleaned[index] === "{") depth += 1;
    if (cleaned[index] === "}") {
      depth -= 1;
      if (depth === 0) return cleaned.slice(open, index + 1);
    }
  }
  throw new Error(`function ${name} has no closing brace`);
}

/** The fixed literals of the HUD message subscriber. */
function subscriberLiterals(): string[] {
  return quotedLiterals(
    withoutComments(read("src/app/session/event-router.ts")),
  );
}

/** The messages built from compiled content and the default bindings. */
function builtMessages(): string[] {
  const npc = JSON.parse(read("src/content/generated/ships-npc.json")) as {
    name: string;
  }[];
  // Every static hull file: the shared one and one per own-file station (Phase
  // 22.1), found by a glob over the generated directory so a new station's
  // ident line is checked without editing this guard.
  const staticFiles = readdirSync(join(REPO_ROOT, "src/content/generated"))
    .filter((file) => /^ships-static-hulls.*\.json$/.test(file))
    .sort();
  expect(staticFiles).toContain("ships-static-hulls.json");
  expect(staticFiles.length).toBeGreaterThanOrEqual(3);
  const staticNames = staticFiles.flatMap(
    (file) =>
      (
        JSON.parse(read(`src/content/generated/${file}`)) as {
          names: { name: string }[];
        }
      ).names,
  );
  const shipNames = [...npc, ...staticNames].map((record) => record.name);
  expect(shipNames.length).toBeGreaterThan(0);
  expect(shipNames).toContain("Dodecahedron Station");
  expect(shipNames).toContain("Icosahedron Station");

  const systemsDir = "src/content/generated/systems";
  const systemNames = readdirSync(join(REPO_ROOT, systemsDir))
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) =>
      (JSON.parse(read(`${systemsDir}/${file}`)) as { name: string }[]).map(
        (system) => system.name,
      ),
    );
  expect(systemNames.length).toBe(2048);

  // The arrival line below mirrors the controller's copy; keep them equal.
  expect(read("src/app/session/hyperspace-controller.ts")).toContain(
    "`Arrived at ${destination.name}`",
  );
  // Phase 19 (D-07, D-04): the damage messages over every compiled equipment
  // and commodity display name.
  const equipmentNames = (
    JSON.parse(read("src/content/generated/equipment.json")) as {
      name: string;
    }[]
  ).map((record) => record.name);
  const commodityNames = (
    JSON.parse(read("src/content/generated/commodities.json")) as {
      name: string;
    }[]
  ).map((record) => record.name);
  expect(equipmentNames.length).toBeGreaterThan(0);
  expect(commodityNames.length).toBeGreaterThan(0);
  return [
    ...equipmentNames.map((name) =>
      formatDamageMessage(EQUIPMENT_DAMAGED_TEMPLATE, name),
    ),
    ...commodityNames.map((name) =>
      formatDamageMessage(CARGO_DESTROYED_TEMPLATE, name),
    ),
    ...shipNames.map((name) =>
      formatIdentLocked(IDENT_LOCKED_TEMPLATE, {
        name,
        scanClass: "CLASS_NEUTRAL",
      }),
    ),
    ...systemNames.map((name) => `Arrived at ${name}`),
    ...HINT_IDS.map((id) => hintText(id, createBindingMap())),
  ];
}

/** One violation line per text longer than the budget. */
function overlong(texts: readonly string[]): string[] {
  return texts
    .filter((text) => text.length > MAX_MESSAGE_CHARS)
    .map((text) => `"${text}" (${String(text.length)}) is ${RULE}`);
}

describe("HUD messages fit one message row (todo 2026-11-20-hud-message-word-wrap-like-oolite)", () => {
  it("the witch-blocked lines are fixed literals that fit", () => {
    const body = functionBody(
      read("src/app/session/hyperspace-controller.ts"),
      "refusalCopy",
    );
    // A template literal or a concatenation is a dynamic blocker name: the
    // first consumer of the word wrap.
    const dynamic = /`|["']\s*\+|\+\s*["']/.test(body)
      ? [
          `refusalCopy builds its text dynamically; a blocker name of any length needs the word wrap, see ${WORD_WRAP_TODO}`,
        ]
      : [];
    const literals = quotedLiterals(body);
    expect(
      literals.filter((text) => text.startsWith("Witchspace jump aborted")),
    ).not.toHaveLength(0);
    expect([...dynamic, ...overlong(literals)]).toEqual([]);
  });

  it("the three station witch-blocked lines equal the witch-blocked prefix plus the compiled station name and fit (Phase 22.1)", () => {
    const entries = JSON.parse(
      read("src/content/generated/ships-client.json"),
    ) as { key: string; extras: { name?: unknown } }[];
    const lines = STATION_KINDS.map((kind) => {
      const record = stationRecord(kind);
      const entry = entries.find(
        (candidate) => candidate.key === record.shipKey,
      );
      return { kind, line: record.witchBlockedLine, name: entry?.extras.name };
    });
    // Each line is the prefix plus the name compiled for its ship key, so a
    // typed name that drifts from the content build fails here, and the
    // comment's counts (54, 58, 57) in refusalCopy are checked, not trusted.
    expect(
      lines.map(({ kind, line, name }) => [
        kind,
        line === WITCH_BLOCKED_PREFIX + String(name),
      ]),
    ).toEqual(STATION_KINDS.map((kind) => [kind, true]));
    expect(lines.map(({ line }) => line.length)).toEqual([54, 58, 57]);
    expect(overlong(lines.map(({ line }) => line))).toEqual([]);
    // The refusal copy reads the line from the record, never builds it.
    expect(
      functionBody(
        read("src/app/session/hyperspace-controller.ts"),
        "refusalCopy",
      ),
    ).toContain("witchBlockedLine");
  });

  it("every fixed literal of the HUD message subscriber fits", () => {
    expect(overlong(subscriberLiterals())).toEqual([]);
  });

  it("every message built from compiled names or the default bindings fits", () => {
    expect(overlong(builtMessages())).toEqual([]);
  });

  it("the scan still sees the longest messages, and they fit", () => {
    const produced = [...subscriberLiterals(), ...builtMessages()];
    for (const witness of LONGEST_WITNESSES) {
      expect(produced).toContain(witness);
      expect(witness.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
  });
});
