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
 * Three messages were already longer than the budget when the guard was added
 * and are cut on screen today; they are listed below and in the todo, and the
 * guard fails if one of them changes or disappears, so the list cannot rot.
 *
 * It is a tripwire, not a proof: a message assembled elsewhere is not seen. The
 * fix for every failure is the todo below, or a shorter wording.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { withoutComments } from "./source-scan.js";
import {
  formatIdentLocked,
  IDENT_LOCKED_TEMPLATE,
} from "../../src/app/session/event-router.js";
import { hintText } from "../../src/app/hints.js";
import { createBindingMap } from "../../src/input/bindings.js";
import { MAX_MESSAGE_CHARS } from "../../src/render/hud/format.js";
import { HINT_IDS } from "../../src/settings/schema.js";

const REPO_ROOT = process.cwd();

const WORD_WRAP_TODO =
  ".planning/todos/pending/2026-11-20-hud-message-word-wrap-like-oolite.md";

const RULE = `longer than MAX_MESSAGE_CHARS (${String(MAX_MESSAGE_CHARS)}): the HUD would cut it with an ellipsis; port Oolite's word wrap first, see ${WORD_WRAP_TODO}`;

/**
 * Messages already longer than the budget and cut on screen today, recorded in
 * the todo: two docking bounce lines (`bounceMessage`) and the pitch and roll
 * hint with the default bindings (`hintText("pitchRoll")`).
 */
const KNOWN_OVERLONG: readonly string[] = [
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
  const statics = JSON.parse(
    read("src/content/generated/ships-static-hulls.json"),
  ) as { names: { name: string }[] };
  const shipNames = [...npc, ...statics.names].map((record) => record.name);
  expect(shipNames.length).toBeGreaterThan(0);

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
  return [
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

/** One violation line per text longer than the budget and not known. */
function overlong(texts: readonly string[]): string[] {
  return texts
    .filter(
      (text) =>
        text.length > MAX_MESSAGE_CHARS && !KNOWN_OVERLONG.includes(text),
    )
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

  it("every fixed literal of the HUD message subscriber fits", () => {
    expect(overlong(subscriberLiterals())).toEqual([]);
  });

  it("every message built from compiled names or the default bindings fits", () => {
    expect(overlong(builtMessages())).toEqual([]);
  });

  it("every known overlong message is still produced, so the list cannot rot", () => {
    const produced = [...subscriberLiterals(), ...builtMessages()];
    for (const known of KNOWN_OVERLONG) {
      expect(known.length).toBeGreaterThan(MAX_MESSAGE_CHARS);
      expect(produced).toContain(known);
    }
  });
});
