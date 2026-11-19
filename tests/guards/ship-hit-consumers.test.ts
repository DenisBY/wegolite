// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `shipHit` consumer tripwire (Phase 17, D-11 and D-13.2).
 *
 * A ship doomed earlier in a tick still receives `shipHit` from a later hit in
 * the same tick, where in Oolite it would already be dead. With no consumer
 * nothing can double a hit sound or flash over the explosion, so Phase 15 and
 * Phase 16 left it, and Phase 17 adds no player hit feedback. The first
 * consumer (audio, a hit flash or screen shake, a HUD hit indicator, an event
 * router subscriber row) must take the skip with it.
 *
 * The scan is comment-stripped `src/**`: `shipHit` may appear only in
 * `src/sim/events.ts` (the event type and the kind list) and
 * `src/sim/combat/ledger.ts` (the emitter). Naming it anywhere else, including a
 * row in the event router's subscriber table, fails. It is a tripwire, not a
 * proof: it cannot see a consumer that reaches the event through a generic
 * handler without naming the kind. A legitimate consumer updates the allowlist
 * in the same commit as the skip.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SRC_DIR = join(REPO_ROOT, "src");

const SHIP_HIT_TODO =
  ".planning/todos/pending/2026-11-17-skip-shiphit-for-a-doomed-target.md";

/** The event definition and its emitter: the only files that may name `shipHit`. */
const SHIP_HIT_FILES: readonly string[] = [
  "src/sim/events.ts",
  "src/sim/combat/ledger.ts",
];

const SHIP_HIT_RULE = `shipHit has a consumer: skip shipHit for a target already lethal in the same tick before shipping it (D-11, OC-5), see ${SHIP_HIT_TODO}`;

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

/** Violations over `files`: `<path>:<line>: <rule>`; comments never count. */
function shipHitViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    if (SHIP_HIT_FILES.includes(path)) continue;
    const cleaned = withoutComments(source);
    for (const match of cleaned.matchAll(/\bshipHit\b/g)) {
      found.push(`${path}:${lineOf(cleaned, match.index)}: ${SHIP_HIT_RULE}`);
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

describe("shipHit has no consumer", () => {
  const violationsOf = (path: string, source: string): string[] =>
    shipHitViolations([{ path, source }]);

  it("finds no consumer anywhere in src today", () => {
    const files = listSrcFiles();

    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(100);
    for (const path of [
      ...SHIP_HIT_FILES,
      "src/sim/combat/step.ts",
      "src/app/session/event-router.ts",
    ]) {
      expect(files).toContain(path);
    }

    const found = shipHitViolations(
      files.map((path) => ({
        path,
        source: readFileSync(join(REPO_ROOT, path), "utf8"),
      })),
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("reports an event-router subscriber row for shipHit and names the todo", () => {
    const path = "src/app/session/event-router.ts";
    const source = [
      "const SUBSCRIBERS = [",
      '  { kind: "shipDestroyed", handle: onExplosion },',
      '  { kind: "shipHit", handle: onHitFlash },',
      "];",
      "",
    ].join("\n");

    const found = violationsOf(path, source);

    expect(found).toEqual([`${path}:3: ${SHIP_HIT_RULE}`]);
    expect(found[0]).toContain(
      ".planning/todos/pending/2026-11-17-skip-shiphit-for-a-doomed-target.md",
    );
  });

  it("reports an audio module that names shipHit", () => {
    const path = "src/audio/hit-sound.ts";
    const source =
      'export function onEvent(event: { kind: string }) { if (event.kind === "shipHit") play(); }\n';

    expect(violationsOf(path, source)).toEqual([`${path}:1: ${SHIP_HIT_RULE}`]);
  });

  it("allows the event definition and its emitter", () => {
    const source = 'events.push({ kind: "shipHit", shield: true });\n';

    expect(violationsOf("src/sim/events.ts", source)).toEqual([]);
    expect(violationsOf("src/sim/combat/ledger.ts", source)).toEqual([]);
  });

  it("ignores shipHit in comments, as src/sim/combat/step.ts has", () => {
    const text = [
      "// shipHit is emitted by the ledger",
      "/* shipHit* then shipDestroyed* */",
      "/**",
      " * Event order: `laserFired*`, `shipHit*`, `shipDestroyed*`.",
      " */",
      "export const ok = 1;",
      "",
    ].join("\n");

    expect(violationsOf("src/sim/combat/step.ts", text)).toEqual([]);
  });

  it("matches the whole word only", () => {
    const text = "export const shipHitCount = 1; const shipHits = 2;\n";

    expect(violationsOf("src/app/session/x.ts", text)).toEqual([]);
  });
});
