// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Firing decision source tripwire (Phase 17, CBT-15, D-14, advisor decision 3
 * as narrowed by orchestrator disposition 3).
 *
 * Phase 17 lets an NPC fire only when an AI module decides to and the ship has
 * an AI record. No firing decision source may reach ordinary play: no populated
 * ship gets an AI record, and only the `?test=1` hook constructs a pilot. This
 * guard makes the structural half of that mechanical, over comment-stripped
 * `src/**`:
 *
 * - `createTestPilotAi` and `createFlightScriptAi` (the pilot builders) are
 *   named only under `src/sim/ai/**`;
 * - an AI record literal, `aiKey` followed by a string literal, appears only
 *   under `src/sim/ai/**`;
 * - `src/sim/ai/test-spawn.ts`, the seam that builds pilots, is value-imported
 *   (an import, a re-export, a dynamic import or a side-effect import) only by
 *   `src/app/session/probe-publisher.ts`; a type-only import passes.
 *
 * The scan never matches a bare `fire` key: `fire: true` in a control intent is
 * not a decision source.
 *
 * It is a tripwire, not a proof. A bundle can still contain the test seam; the
 * seam is gated at runtime by `?test=1`, which taints the session so no autosave
 * can make the spawned ships durable. There is no static scan of `populate.ts`:
 * the proof that every populated ship has `ai: null` is the runtime check in
 * `tests/sim/world/populate.test.ts` ("spawns the 12-ship table ... inert"), which
 * stays.
 *
 * A legitimate move of a builder, an AI literal or the seam's importer updates
 * the allowlist below in the same commit, with the reason in the commit body.
 */

import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";

import { lineOf, listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

/** The directory that may build pilots and write AI record literals. */
const AI_DIRECTORY = "src/sim/ai/";

/** The seam module, repo-relative without extension. */
const TEST_SPAWN_MODULE = "src/sim/ai/test-spawn";

/** The one file that may value-import the seam. */
const SEAM_IMPORTER = "src/app/session/probe-publisher.ts";

const DECISION_SOURCE_RULE =
  "a firing decision source may not reach ordinary play (CBT-15, D-14, advisor decision 3, orchestrator disposition 3). This guard is a tripwire, not a proof: a legitimate move of a pilot builder, an AI record literal or the seam's importer updates the allowlist in tests/guards/fire-decision-source.test.ts in the same commit, with the reason in the commit body";

const BUILDER_RULE = `${DECISION_SOURCE_RULE}. Pilot builder named outside ${AI_DIRECTORY}**`;
const LITERAL_RULE = `${DECISION_SOURCE_RULE}. AI record literal (aiKey with a string literal) outside ${AI_DIRECTORY}**`;
const IMPORT_RULE = `${DECISION_SOURCE_RULE}. Value import of src/sim/ai/test-spawn outside ${SEAM_IMPORTER}`;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** Whether `specifier`, written in the file at `path`, resolves to the seam. */
function resolvesToTestSpawn(path: string, specifier: string): boolean {
  const bare = specifier.replace(/\.(?:js|ts)$/, "");
  if (specifier.startsWith(".")) {
    return (
      posix.normalize(posix.join(posix.dirname(path), bare)) ===
      TEST_SPAWN_MODULE
    );
  }
  return bare === TEST_SPAWN_MODULE || bare.endsWith("sim/ai/test-spawn");
}

/**
 * Value imports of any module: a static import or export-from that is not
 * `import type` or `export type`, a dynamic `import("...")`, and a side-effect
 * `import "..."`. Each result is a specifier and the offset of its quote.
 */
function valueSpecifiers(
  cleaned: string,
): { specifier: string; offset: number }[] {
  const found: { specifier: string; offset: number }[] = [];
  for (const match of cleaned.matchAll(
    /\b(?:import|export)(\s+type\b)?[^;"'`]*?\bfrom\s*["']([^"']+)["']/g,
  )) {
    if (match[1] !== undefined) continue;
    const specifier = match[2] as string;
    found.push({
      specifier,
      offset: match.index + match[0].lastIndexOf(specifier),
    });
  }
  for (const pattern of [
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ]) {
    for (const match of cleaned.matchAll(pattern)) {
      const specifier = match[1] as string;
      found.push({
        specifier,
        offset: match.index + match[0].lastIndexOf(specifier),
      });
    }
  }
  return found;
}

/** Violations over `files`: `<path>:<line>: <rule>`; comments never count. */
function decisionSourceViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    const cleaned = withoutComments(source);

    if (!path.startsWith(AI_DIRECTORY)) {
      for (const match of cleaned.matchAll(
        /\b(?:createTestPilotAi|createFlightScriptAi)\b/g,
      )) {
        found.push(`${path}:${lineOf(cleaned, match.index)}: ${BUILDER_RULE}`);
      }
      for (const match of cleaned.matchAll(/\baiKey\s*:\s*["'`]/g)) {
        found.push(`${path}:${lineOf(cleaned, match.index)}: ${LITERAL_RULE}`);
      }
    }

    if (path !== SEAM_IMPORTER) {
      for (const { specifier, offset } of valueSpecifiers(cleaned)) {
        if (!resolvesToTestSpawn(path, specifier)) continue;
        found.push(`${path}:${lineOf(cleaned, offset)}: ${IMPORT_RULE}`);
      }
    }
  }
  return found;
}

describe("no firing decision source reaches ordinary play", () => {
  const violationsOf = (path: string, source: string): string[] =>
    decisionSourceViolations([{ path, source }]);

  it("finds no stray builder, AI literal or seam import anywhere in src today", () => {
    const files = listSrcFiles();

    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(100);
    for (const path of [
      SEAM_IMPORTER,
      "src/app/session/traffic.ts",
      "src/sim/world/populate.ts",
      "src/sim/ai/test-spawn.ts",
      "src/sim/ai/pilots/flight-script.ts",
      "src/sim/ai/pilots/test-pilot.ts",
    ]) {
      expect(files).toContain(path);
    }

    const found = decisionSourceViolations(
      files.map((path) => ({
        path,
        source: readFileSync(join(REPO_ROOT, path), "utf8"),
      })),
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("reports a pilot builder called from the populator", () => {
    const path = "src/sim/world/populate.ts";
    const source = "const ai = createFlightScriptAi(tick, { script });\n";

    expect(violationsOf(path, source)).toEqual([`${path}:1: ${BUILDER_RULE}`]);
  });

  it("reports the test pilot builder called from the game session", () => {
    const path = "src/app/session/game-session.ts";
    const source = [
      "const a = 1;",
      "const ai = createTestPilotAi(tick, options);",
      "",
    ].join("\n");

    expect(violationsOf(path, source)).toEqual([`${path}:2: ${BUILDER_RULE}`]);
  });

  it("reports an AI record literal in the app", () => {
    const path = "src/app/session/x.ts";
    const found = violationsOf(
      path,
      'const ai = { aiKey: "flight-script", params };\n',
    );

    expect(found).toEqual([`${path}:1: ${LITERAL_RULE}`]);
    expect(violationsOf(path, "const ai = { aiKey: 'test-pilot' };\n")).toEqual(
      [`${path}:1: ${LITERAL_RULE}`],
    );
  });

  it("reports a value import of the seam from the game session", () => {
    const path = "src/app/session/game-session.ts";
    const found = violationsOf(
      path,
      'import { spawnTestShooter } from "../../sim/ai/test-spawn.js";\n',
    );

    expect(found).toEqual([`${path}:1: ${IMPORT_RULE}`]);
  });

  it("reports a re-export, a dynamic import and a side-effect import of the seam", () => {
    const path = "src/app/session/x.ts";

    expect(
      violationsOf(
        path,
        'export { spawnTestFlyers } from "../../sim/ai/test-spawn.js";\n',
      ),
    ).toHaveLength(1);
    expect(
      violationsOf(
        path,
        'const m = await import("../../sim/ai/test-spawn.js");\n',
      ),
    ).toHaveLength(1);
    expect(
      violationsOf(path, 'import "../../sim/ai/test-spawn.js";\n'),
    ).toHaveLength(1);
  });

  it("reports a multi-line value import of the seam at the specifier's line", () => {
    const path = "src/sim/world/x.ts";
    const found = violationsOf(
      path,
      [
        "import {",
        "  spawnTestFlyers,",
        '} from "../ai/test-spawn.js";',
        "",
      ].join("\n"),
    );

    expect(found).toEqual([`${path}:3: ${IMPORT_RULE}`]);
  });

  it("names the rule, says it is a tripwire and tells a legitimate move to update the allowlist", () => {
    const [message] = violationsOf(
      "src/sim/world/populate.ts",
      "createFlightScriptAi(tick, o);\n",
    );

    expect(message).toContain("CBT-15");
    expect(message).toContain("tripwire, not a proof");
    expect(message).toContain("updates the allowlist");
    expect(message).toContain("in the same commit");
  });

  it("allows the one importer of the seam to value-import it", () => {
    expect(
      violationsOf(
        SEAM_IMPORTER,
        'import { spawnTestFlyers, spawnTestShooter } from "../../sim/ai/test-spawn.js";\n',
      ),
    ).toEqual([]);
  });

  it("allows a type-only import of the seam", () => {
    expect(
      violationsOf(
        "src/app/session/traffic.ts",
        'import type { FlyerRecords } from "../../sim/ai/test-spawn.js";\n',
      ),
    ).toEqual([]);
    expect(
      violationsOf(
        "src/app/session/traffic.ts",
        'export type { FlyerRecords } from "../../sim/ai/test-spawn.js";\n',
      ),
    ).toEqual([]);
  });

  it("allows builders and AI literals in a new file under src/sim/ai (a refactor inside the AI module)", () => {
    const source = [
      'import { createFlightScriptAi } from "./pilots/flight-script.js";',
      'const ai = { aiKey: "flight-script" };',
      "const b = createTestPilotAi(tick, o);",
      "",
    ].join("\n");

    expect(violationsOf("src/sim/ai/new-seam.ts", source)).toEqual([]);
    expect(violationsOf("src/sim/ai/pilots/new-pilot.ts", source)).toEqual([]);
  });

  it("never matches a bare fire key", () => {
    const text = [
      "const intent = { fire: true, thrust: 1 };",
      "ctl.fire(self);",
      "const ai = { aiKey, params };",
      "const typed: { aiKey: AiKey } = x;",
      "",
    ].join("\n");

    expect(violationsOf("src/app/session/x.ts", text)).toEqual([]);
  });

  it("ignores builders, literals and the seam path in comments", () => {
    const text = [
      "// createFlightScriptAi and createTestPilotAi build pilots",
      '/* aiKey: "flight-script" */',
      "/**",
      ' * import { x } from "../../sim/ai/test-spawn.js";',
      " */",
      "export const ok = 1;",
      "",
    ].join("\n");

    expect(violationsOf("src/app/session/x.ts", text)).toEqual([]);
  });
});
