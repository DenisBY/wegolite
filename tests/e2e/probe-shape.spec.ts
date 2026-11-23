// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The frozen `window.__wegolite` shape (D-12 step 0, D-13, FOUND-10).
 *
 * 25 browser specs read the probe, and the Phase 8 session split must not move
 * a key or change a leaf type. This spec samples seven states (six recorded
 * from the unmodified monolith in plan 08-01, plus testHookManualDocked from
 * plan 08-16), reduces each live probe to a value-free shape in the page
 * (`probeShapeOf`), and compares it with tests/fixtures/probe-shape.json. Every
 * wait is `page.waitForFunction` on probe fields; no wall-time wait is used.
 *
 * Write mode: with WEGOLITE_PROBE_SHAPE_WRITE=1 the spec records the fixture
 * instead of asserting. Write mode runs only in plan 08-01 and in the one
 * deliberate post-split commit (D-13, plan 08-16). Split steps 1-9 and plans
 * 08-14 and 08-15 never run it; they gate on `git diff` of the fixture being
 * empty.
 *
 * Standing contract: every `probe.test` member except the boolean `tainted`
 * reads "function" in testHookDocked and testHookManualDocked. Plan 08-16 added
 * its hook members (worldHash, advanceTicks) as always-present functions, so the
 * contract survives the one deliberate probe commit (Round 4 review 6f4ae07
 * consensus 3). `probe.sim` is the third addition of that commit.
 *
 * Optional-key audit (Round 1 review 10b4108 L36; Round 2 review 820a435 L162).
 * Each optional WegoliteProbe key, the condition that publishes it, and where it
 * is expected. A key is STATE-DETERMINED when a condition of the sampled state
 * publishes it (the state's wait predicate also waits for it, so the sample is
 * never early) and TIMING-DEPENDENT when only a moment the sample cannot pin
 * does. Only timing-dependent keys enter PROBE_SHAPE_OPTIONAL_KEYS; the audit
 * confirms `hint` alone.
 *
 * | key | publishing condition | states where expected |
 * | --- | --- | --- |
 * | shipVisible | updateProbe once a layout and a system scene exist | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | dust | updateProbe once a layout and a system scene exist | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | hints | updateProbe on every call (empty list when no controller) | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | hint | the hint controller decides when to show the first hint: TIMING-DEPENDENT, optional | may appear in any session state; never pinned |
 * | world | updateProbe once a layout and a system scene exist | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | dock | updateProbe once a flight state exists | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | save | the session publishes its save probe when it starts | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | recovery | main.ts publishes it with the initial probe (QUAL-05) | every state |
 * | station | syncEconomyProbe once a market exists (docked render or flight start) | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | economy | syncEconomyProbe once a market exists | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | chart | updateProbe on every call | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | hyperspace | updateProbe on every call | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | restore | only after a Continue installs a saved pose (boot or in-session) | never: every sample is a fresh New game |
 * | death | updateProbe while the session is latched game over (Phase 20) | never: no sampled state is dead |
 * | saveScreen | updateProbe on every call | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | systemId | updateProbe on every call | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | quality | updateProbe on every call | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | atmosphere | updateProbe on every call | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | nebulae | updateProbe on every call | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | aspect | main.ts resize before a session, renderFrame once a scene exists | every state |
 * | sim | updateProbe once a flight state exists (plan 08-16): STATE-DETERMINED | docked, paused, chart, inFlight, testHookDocked, testHookManualDocked; absent in menu |
 * | test | createTestHook, only under ?test=1 | testHookDocked and testHookManualDocked |
 * | error | publishFailure only, on the failure surface | never |
 *
 * Nested optional keys are state-determined too: hud.hyperspaceTarget (set with
 * the live HUD), economy.marketSystemId (set with every market),
 * chart.targetId and hyperspace.targetId (only once a target exists; a New game
 * targets its start system since quick task 261117-pij, as Oolite's standard
 * scenario does, so every session sample here has both), chart.selectedId
 * (only once a selection exists; none in these New-game samples), save.notice
 * (only after an app-owned notice) and no other.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIRST_LAUNCH_WAIT_MS, waitForReady } from "./helpers/probe.js";
import {
  compareProbeShapes,
  PROBE_SHAPE_OPTIONAL_KEYS,
  PROBE_SHAPE_RECORD_PATHS,
  probeShapeOf,
} from "./helpers/probe-shape.js";
import { startNewGame } from "./helpers/title.js";

const FIXTURE_URL = new URL("../fixtures/probe-shape.json", import.meta.url);
const WRITE_MODE = process.env["WEGOLITE_PROBE_SHAPE_WRITE"] === "1";

const STATE_NAMES = [
  "menu",
  "docked",
  "paused",
  "chart",
  "inFlight",
  "testHookDocked",
  "testHookManualDocked",
] as const;
type StateName = (typeof STATE_NAMES)[number];

/** The probe keys every sampled session state publishes (state-determined). */
const SESSION_KEYS = [
  "shipVisible",
  "dust",
  "hints",
  "world",
  "dock",
  "sim",
  "save",
  "recovery",
  "station",
  "economy",
  "chart",
  "hyperspace",
  "saveScreen",
  "systemId",
  "quality",
  "atmosphere",
  "nebulae",
  "aspect",
  // Nested and list members a session publishes (a trailing [] means non-empty).
  "save.notice",
  "hud.hyperspaceTarget",
  "hud.elements[]",
  "economy.marketSystemId",
  "economy.market[]",
  "bodies[]",
] as const;

/**
 * In flight the scanner shows the station and the launch hint is dismissed
 * (`maybeShow` marks "launch" seen once the mode leaves docked), so the contacts
 * and seen-hints lists are populated; both are state-determined there.
 */
const IN_FLIGHT_KEYS = [...SESSION_KEYS, "hud.contacts[]", "hints[]"] as const;

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;

const recorded: Partial<Record<StateName, unknown>> = {};

/**
 * Wait until the probe is in `mode` and publishes every key in `keys` (a dotted
 * path; a trailing `[]` requires a non-empty list). `timeout` defaults to SLOW;
 * a wait that spans an unskipped launch passes FIRST_LAUNCH_WAIT_MS.
 */
async function waitForState(
  page: Page,
  mode: string,
  keys: readonly string[],
  committed = 0,
  timeout = SLOW,
): Promise<void> {
  await page.waitForFunction(
    (arg) => {
      const probe = window.__wegolite as unknown as
        Record<string, unknown> | undefined;
      if (probe === undefined || probe["ready"] !== true) return false;
      if (probe["mode"] !== arg.mode) return false;
      const published = (path: string): boolean => {
        const list = path.endsWith("[]");
        let node: unknown = probe;
        for (const part of (list ? path.slice(0, -2) : path).split(".")) {
          if (typeof node !== "object" || node === null) return false;
          node = (node as Record<string, unknown>)[part];
        }
        return list
          ? Array.isArray(node) && node.length > 0
          : node !== undefined;
      };
      if (!arg.keys.every(published)) return false;
      const save = probe["save"] as { committed?: number } | undefined;
      return arg.committed === 0 || (save?.committed ?? 0) >= arg.committed;
    },
    { mode, keys: [...keys], committed },
    { timeout },
  );
}

/** Wait until the session loop has run at least `count` more frames. */
async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__wegolite?.frames ?? 0);
  await page.waitForFunction(
    (target) => (window.__wegolite?.frames ?? 0) >= target,
    start + count,
    { timeout: SLOW },
  );
}

/** Start a New game and wait until the docked session has published its keys. */
async function bootDocked(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForReady(page);
  await startNewGame(page);
  await waitForState(page, "docked", SESSION_KEYS);
  await waitForFrames(page, 3);
}

/** The probe's shape, computed inside the page (functions cannot leave it). */
async function sampleShape(page: Page): Promise<unknown> {
  return page.evaluate(
    `(${probeShapeOf.toString()})(window.__wegolite, ${JSON.stringify(PROBE_SHAPE_RECORD_PATHS)})`,
  );
}

/** Assert a state's shape against the fixture, or record it in write mode. */
async function checkState(
  page: Page,
  name: StateName,
  testInfo: { annotations: { type: string; description?: string }[] },
): Promise<void> {
  const actual = await sampleShape(page);
  if (WRITE_MODE) {
    recorded[name] = actual;
    testInfo.annotations.push({
      type: "probe-shape",
      description: `recorded ${name}`,
    });
    return;
  }
  const fixture = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as Record<
    string,
    unknown
  >;
  const differences = compareProbeShapes(
    actual,
    fixture[name],
    PROBE_SHAPE_OPTIONAL_KEYS,
  );
  expect(differences, `${name}: ${differences.join("\n")}`).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  if (!WRITE_MODE) return;
  const ordered: Record<string, unknown> = {};
  for (const name of STATE_NAMES) ordered[name] = recorded[name];
  writeFileSync(FIXTURE_URL, `${JSON.stringify(ordered, null, 2)}\n`);
});

test("menu probe shape", async ({ page }, testInfo) => {
  await page.goto("/");
  await waitForReady(page);
  await waitForState(page, "menu", ["recovery", "aspect"]);
  await checkState(page, "menu", testInfo);
});

test("docked probe shape", async ({ page }, testInfo) => {
  await bootDocked(page, "/");
  await checkState(page, "docked", testInfo);
});

test("paused probe shape", async ({ page }, testInfo) => {
  await bootDocked(page, "/");
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    {
      timeout: SLOW,
    },
  );
  await checkState(page, "paused", testInfo);
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    {
      timeout: SLOW,
    },
  );
});

test("chart probe shape", async ({ page }, testInfo) => {
  await bootDocked(page, "/");
  await page.keyboard.press("F6");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.open === true,
    undefined,
    {
      timeout: SLOW,
    },
  );
  await checkState(page, "chart", testInfo);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.open === false,
    undefined,
    {
      timeout: SLOW,
    },
  );
});

test("in-flight probe shape", async ({ page }, testInfo) => {
  // CI measured 23.8 s of the 30 s default (79 %), above the owner's 60 % rule.
  // The budget is the old 30 s non-launch budget plus the first-launch wait
  // (quick 261120-ryc).
  test.setTimeout(30_000 + FIRST_LAUNCH_WAIT_MS);
  await bootDocked(page, "/");
  await page.click('button[data-action="launch"]');
  // The launch autosave must be committed so `save.lastClock` is a number.
  await waitForState(page, "inFlight", IN_FLIGHT_KEYS, 1, FIRST_LAUNCH_WAIT_MS);
  await waitForFrames(page, 3);
  await checkState(page, "inFlight", testInfo);
});

test("docked probe shape under ?test=1", async ({ page }, testInfo) => {
  await bootDocked(page, "/?test=1");
  await waitForState(page, "docked", [...SESSION_KEYS, "test"]);
  const members = await page.evaluate(() => {
    const hook = window.__wegolite?.test as unknown as
      Record<string, unknown> | undefined;
    return hook === undefined
      ? {}
      : Object.fromEntries(
          Object.entries(hook).map(([key, value]) => [key, typeof value]),
        );
  });
  for (const [key, kind] of Object.entries(members)) {
    expect(kind, `probe.test.${key}`).toBe(
      key === "tainted" ? "boolean" : "function",
    );
  }
  expect(Object.keys(members).length).toBeGreaterThan(1);
  await checkState(page, "testHookDocked", testInfo);
});

test("docked probe shape under ?test=1&clock=manual", async ({
  page,
}, testInfo) => {
  await bootDocked(page, "/?test=1&clock=manual");
  await waitForState(page, "docked", [...SESSION_KEYS, "test"]);
  const members = await page.evaluate(() => {
    const hook = window.__wegolite?.test as unknown as
      Record<string, unknown> | undefined;
    return hook === undefined
      ? {}
      : Object.fromEntries(
          Object.entries(hook).map(([key, value]) => [key, typeof value]),
        );
  });
  for (const [key, kind] of Object.entries(members)) {
    expect(kind, `probe.test.${key}`).toBe(
      key === "tainted" ? "boolean" : "function",
    );
  }
  // advanceTicks is always present, so the manual clock adds no new member.
  expect(members["advanceTicks"]).toBe("function");
  expect(members["worldHash"]).toBe("function");
  await checkState(page, "testHookManualDocked", testInfo);
});
