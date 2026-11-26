// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The population recorder (Phase 22, plan 22-01): the byte-for-byte rerun and
 * the pin refusal.
 *
 * Both cases execute Oolite's own JavaScript and need the pinned tree: run
 * with `OOLITE_SRC` naming a directory built from the local Oolite checkout at
 * 7437f22 (`git archive 7437f22 src Resources`). Without it they are reported
 * as skipped (never passed), which is the state on the remote test machine and
 * in CI (no checkout there): CI replays the committed fixtures through
 * `tests/oracles/population/population.self.test.ts` instead.
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  POPULATOR_FILE,
  POPULATOR_SCRIPT_SHA256,
  PopulatorPinError,
  recordPopulation,
  writeFixture,
} from "./populator-record.js";

const OOLITE_SRC = process.env.OOLITE_SRC ?? "";
const NEEDS_TREE = OOLITE_SRC === "";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/oracles/population/fixtures/", import.meta.url),
);

/** The committed fixtures the recorder is responsible for. */
function committedFixtures(): { name: string; system: string; seed: number }[] {
  const found: { name: string; system: string; seed: number }[] = [];
  for (const name of readdirSync(FIXTURE_DIR).sort()) {
    const match = /^(g[0-7]-s\d+)-seed(\d+)\.json$/.exec(name);
    if (match !== null) {
      found.push({
        name,
        system: match[1] ?? "",
        seed: Number(match[2]),
      });
    }
  }
  return found;
}

/** The path of the first key at which two parsed fixtures differ. */
function firstDifference(a: unknown, b: unknown, path = "$"): string | null {
  if (Array.isArray(a) && Array.isArray(b)) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const found = firstDifference(a[i], b[i], `${path}[${String(i)}]`);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = [
      ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort();
    for (const key of keys) {
      const found = firstDifference(left[key], right[key], `${path}.${key}`);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  return Object.is(a, b) ? null : path;
}

describe("populator recorder (needs OOLITE_SRC at the pinned tree)", () => {
  it.skipIf(NEEDS_TREE)(
    "reproduces every committed fixture byte for byte",
    () => {
      const fixtures = committedFixtures();
      expect(fixtures.length).toBeGreaterThan(0);
      const scratch = mkdtempSync(join(tmpdir(), "populator-record-"));
      try {
        for (const fixture of fixtures) {
          const written = writeFixture(
            OOLITE_SRC,
            scratch,
            fixture.system,
            fixture.seed,
          );
          const fresh = readFileSync(written);
          const committed = readFileSync(join(FIXTURE_DIR, fixture.name));
          if (!fresh.equals(committed)) {
            const where = firstDifference(
              JSON.parse(committed.toString("utf8")) as unknown,
              JSON.parse(fresh.toString("utf8")) as unknown,
            );
            expect.fail(
              `${fixture.name} differs from a rerun at ${where ?? "its formatting"}`,
            );
          }
        }
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it.skipIf(NEEDS_TREE)(
    "refuses a script whose hash differs from the pinned one",
    () => {
      const scratch = mkdtempSync(join(tmpdir(), "populator-pin-"));
      try {
        const script = readFileSync(join(OOLITE_SRC, POPULATOR_FILE));
        expect(
          // The pinned file itself must be accepted by the recorder.
          () => recordPopulation(OOLITE_SRC, "g0-s7", 1),
        ).not.toThrow();
        const changed = Buffer.from(script);
        const at = changed.indexOf("oolite-freighters");
        expect(at).toBeGreaterThan(0);
        // One byte changed: "oolite-freighters" becomes "oolite-freightert".
        changed[at + "oolite-freighter".length] = "t".charCodeAt(0);
        const target = join(scratch, POPULATOR_FILE);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, changed);
        let thrown: unknown;
        try {
          recordPopulation(scratch, "g0-s7", 1);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(PopulatorPinError);
        const pin = thrown as PopulatorPinError;
        expect(pin.expected).toBe(POPULATOR_SCRIPT_SHA256);
        expect(pin.actual).not.toBe(POPULATOR_SCRIPT_SHA256);
        expect(pin.message).toContain(POPULATOR_SCRIPT_SHA256);
        expect(pin.message).toContain(pin.actual);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
  );
});
