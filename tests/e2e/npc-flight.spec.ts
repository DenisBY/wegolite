// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one opt-in NPC flight browser smoke of Phase 14 (plan 14-18; WORLD-07,
 * ROADMAP criteria 3 and 5).
 *
 * With traffic on, a `?test=1` session can put three scripted flying NPCs in the
 * world (`spawnTestFlyers`: a Shuttle flying to the station, a Viper
 * intercepting the player and an Adder fleeing it). This spec shows that they
 * are in the browser's world and on the scanner, that they are drawn within the
 * draw-call budget, and that the browser world replays the Node tick script
 * hash for hash. The flying rules themselves are the Vitest scenarios of plan
 * 14-16 and the 20-seed acceptance run of plan 14-17; this is the wiring smoke
 * (criterion 5: the browser spec is opt-in, traffic off by default).
 *
 * It opts in by URL (`?test=1&traffic=1&clock=manual`, as tests/e2e/traffic.spec.ts
 * does). Every assertion is a count, a distance comparison or a hash; none measures
 * milliseconds, and every wait timeout is a correctness bound, never an
 * assertion.
 *
 * The draw-call check is weak evidence on its own: the loaded scene already
 * uses about 17 calls and the instanced NPC layer adds at most one per ship
 * kind, so 50 is far above any plausible count. The hash equality and the
 * scanner count carry the proof; the draw-call check only guards the budget.
 */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { buildHudModel } from "../../src/app/hud-model.js";
import { scriptGoalMetric } from "../../src/sim/ai/pilots/flight-script.js";
import { FLYER_SCRIPT_RANGES } from "../../src/sim/ai/test-spawn.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../src/sim/npc/stats.js";
import { PLAYER_ID } from "../../src/sim/world/ids.js";
import type { EntityId } from "../../src/sim/world/ids.js";
import { npcContacts } from "../../src/sim/world/contacts.js";
import { createWorldView } from "../../src/sim/world/view-impl.js";
import type { World } from "../../src/sim/world/world.js";
import { laveFixture } from "../helpers/lave.js";
import { runTickScript } from "../helpers/tick-script.js";
import type { TickStep } from "../helpers/tick-script.js";
import { DRAW_CALL_BUDGET } from "./helpers/budgets.js";
import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** The URL this spec boots: traffic on, manual clock (opt-in by URL only). */
const FLIGHT_URL = "/?test=1&traffic=1&clock=manual";
/**
 * The ticks that follow the spawn: 10 simulated seconds. The bound keeps the
 * fleer on the scanner: at most 3,000 m + 240 m/s x 10 s = 5,400 m from the
 * player, far below the scanner range (25,600 m), so none of the three leaves
 * the scanner and the count is the one before plus three.
 */
const FLYER_SMOKE_TICKS = 1_200;
/** Ticks of the launch script: one for the launch command, then the handover. */
const LAUNCH_TICKS = 600;
/** The three flyers the hook spawns. */
const FLYERS = 3;

test.setTimeout(360_000);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
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

/** Step `n` manual ticks, then let a frame publish the probe. */
async function advance(page: Page, n: number): Promise<number> {
  const tick = await page.evaluate(
    (count) => window.__wegolite?.test?.advanceTicks(count),
    n,
  );
  await waitForFrames(page, 2);
  return tick ?? -1;
}

/** The ship contacts on the scanner the probe publishes (visible ones only). */
async function scannerShips(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window.__wegolite?.hud.contacts ?? []).filter((id) => id === "ship")
        .length,
  );
}

/** One committed NPC record: the ship key and its model path. */
interface NpcRecord {
  readonly key: string;
  readonly glb: string;
}

/** The URL path of a record's GLB, as the browser requests it. */
function glbPath(record: NpcRecord): string {
  return new URL(`/${record.glb}`, "http://localhost").pathname;
}

/** The three scripts' flyers of a replayed world, by script, as entity ids. */
function flyerIds(
  world: World,
): Record<"station" | "intercept" | "flee", EntityId> {
  const found: Partial<Record<"station" | "intercept" | "flee", EntityId>> = {};
  for (const entity of world.store.live) {
    const script = entity.ai?.params["script"];
    if (script === "station" || script === "intercept" || script === "flee") {
      found[script] = entity.id;
    }
  }
  const { station, intercept, flee } = found;
  if (station === undefined || intercept === undefined || flee === undefined) {
    throw new Error("the replayed world holds no three flyers");
  }
  return { station, intercept, flee };
}

test("three scripted flyers are on the scanner, drawn within budget and replay the Node hash", async ({
  page,
}) => {
  const errors = collectErrors(page);
  const { layout, config } = laveFixture();

  const records = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as readonly NpcRecord[];
  const glbByKey = new Map(
    records.map((record): [string, string] => [record.key, glbPath(record)]),
  );
  const finishedGlbs = new Set<string>();
  const npcGlbPaths = new Set(glbByKey.values());
  page.on("requestfinished", (request) => {
    const path = new URL(request.url()).pathname;
    if (npcGlbPaths.has(path)) finishedGlbs.add(path);
  });

  // 1. Boot, launch and fly out: the script every replay below repeats.
  await page.goto(FLIGHT_URL);
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "docked" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );
  await page.click('button[data-action="launch"]');
  // One frame after the click, so the launch command is queued before stepping.
  await waitForFrames(page, 1);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.advanceTicks(1)),
  ).toBe(1);
  expect(await advance(page, LAUNCH_TICKS)).toBe(LAUNCH_TICKS + 1);
  await page.waitForFunction(() => window.__wegolite?.mode === "inFlight", {
    timeout: SLOW,
  });
  await waitForFrames(page, 2);

  // 2. The scanner count just before the spawn, then the spawn: three more.
  const before = await scannerShips(page);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.spawnTestFlyers()),
    "the hook spawned the flyers",
  ).toBe(true);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.tainted),
    "the session is tainted so nothing is saved (advanceTicks already tainted it; the hook's own taint order is a unit test)",
  ).toBe(true);
  // One tick so the probe publishes the world with the flyers in it.
  expect(await advance(page, 1)).toBe(LAUNCH_TICKS + 2);
  expect(await scannerShips(page), "scanner ships right after the spawn").toBe(
    before + FLYERS,
  );

  // 3. The remaining ticks: exactly FLYER_SMOKE_TICKS follow the spawn.
  expect(await advance(page, FLYER_SMOKE_TICKS - 1)).toBe(
    LAUNCH_TICKS + 1 + FLYER_SMOKE_TICKS,
  );

  // 4. The Node replay of the same script, once ending at the spawn step and
  // once after the ticks (`runTickScript` returns only the final world).
  const launchSteps: readonly TickStep[] = [
    { commands: [{ kind: "launch" }], ticks: 1 },
    { commands: [], ticks: LAUNCH_TICKS },
  ];
  const atSpawn = runTickScript(
    [...launchSteps, { commands: [], ticks: 0, spawnFlyers: true }],
    { traffic: true },
  );
  const afterTicks = runTickScript(
    [
      ...launchSteps,
      { commands: [], ticks: FLYER_SMOKE_TICKS, spawnFlyers: true },
    ],
    { traffic: true },
  );
  if (atSpawn.world === undefined || afterTicks.world === undefined) {
    throw new Error("a replay ended without a world");
  }
  expect(afterTicks.state.tick).toBe(LAUNCH_TICKS + 1 + FLYER_SMOKE_TICKS);

  // The scanner shows what the Node HUD model shows for the replayed world and
  // pose (it also covers an inert lane ship crossing the scanner edge).
  const model = buildHudModel(
    afterTicks.state,
    layout,
    config,
    "",
    70,
    0,
    "",
    npcContacts(afterTicks.world),
  );
  const expectedShips = model.contacts.filter(
    (contact) => contact.visible && contact.id === "ship",
  ).length;
  expect(
    expectedShips,
    "the Node scanner count (vacuity guard)",
  ).toBeGreaterThan(0);
  expect(
    await scannerShips(page),
    "scanner ships after the flyers' ticks",
  ).toBe(expectedShips);

  // 5. The browser world is the Node world, hash for hash.
  const browser = await page.evaluate(() => ({
    tick: window.__wegolite?.sim?.tick,
    entities: window.__wegolite?.sim?.entities,
    hash: window.__wegolite?.test?.worldHash(),
  }));
  expect(browser.tick).toBe(afterTicks.state.tick);
  // Plan 22-14 (owner-sanctioned, Phase 21 D-04): the 28 populated Lave ships
  // (census epoch 1, plan 22-13) replace the 12 inert ones: 28 + FLYERS.
  expect(browser.entities).toBe(28 + FLYERS);
  expect(browser.hash, "the browser world hash is the Node replay's").toBe(
    afterTicks.hash,
  );
  expect(afterTicks.hash, "the replay moved on from the spawn").not.toBe(
    atSpawn.hash,
  );

  // 6. The flyers flew their scripts: measured by the one goal metric, from the
  // spawn to the end of the ticks.
  const metricsOf = (replay: typeof atSpawn) => {
    const world = replay.world as World;
    const ids = flyerIds(world);
    const view = createWorldView(
      world,
      replay.state,
      layout,
      PLAYER_COLLISION_RADIUS_M,
    );
    const read = (
      script: "station" | "intercept" | "flee",
      id: EntityId,
    ): number => {
      const metric = scriptGoalMetric(
        view,
        id,
        script,
        script === "station" ? 0 : PLAYER_ID,
      );
      if (metric === undefined) throw new Error(`no metric for ${script}`);
      return metric;
    };
    return {
      station: read("station", ids.station),
      intercept: read("intercept", ids.intercept),
      flee: read("flee", ids.flee),
    };
  };
  const start = metricsOf(atSpawn);
  const end = metricsOf(afterTicks);
  test.info().annotations.push({
    type: "npc-flight-metrics",
    description: `station ${start.station.toFixed(0)} to ${end.station.toFixed(0)} m, intercept ${start.intercept.toFixed(0)} to ${end.intercept.toFixed(0)} m, flee ${start.flee.toFixed(0)} to ${end.flee.toFixed(0)} m`,
  });
  // The station script holds a range from the station rather than closing in:
  // since quick task 261117-k1l the goal (3,500 m) lies beyond the spawn
  // (about 3,300 m from the station), so the flyer backs out to it. Either way
  // it ends nearer its goal range than it started.
  const stationGoal = FLYER_SCRIPT_RANGES.station;
  expect(
    Math.abs(end.station - stationGoal),
    "the station flyer is nearer its goal range from the station",
  ).toBeLessThan(Math.abs(start.station - stationGoal));
  expect(end.intercept, "the interceptor is closer to the player").toBeLessThan(
    start.intercept,
  );
  expect(end.flee, "the fleer is farther from the player").toBeGreaterThan(
    start.flee,
  );

  // 7. Draw calls within the budget once the models of the present keys loaded.
  const present = new Set(
    npcContacts(afterTicks.world).map((contact) => contact.specKey),
  );
  const expectedGlbs = [...present]
    .map((key) => glbByKey.get(key))
    .filter((path): path is string => path !== undefined)
    .sort();
  expect(expectedGlbs.length, "ship keys present (vacuity guard)").toBe(
    present.size,
  );
  await expect
    .poll(() => expectedGlbs.filter((path) => finishedGlbs.has(path)).sort(), {
      timeout: 240_000,
    })
    .toEqual(expectedGlbs);
  await waitForFrames(page, 10);
  const calls = await page.evaluate(() => window.__wegolite?.calls ?? -1);
  test.info().annotations.push({
    type: "npc-flight-calls",
    description: `${calls} draw calls with the flyers loaded`,
  });
  expect(calls, "draw calls with the flyers loaded").toBeGreaterThan(0);
  expect(calls, "draw-call budget").toBeLessThanOrEqual(DRAW_CALL_BUDGET);

  expect(errors).toEqual([]);
});
