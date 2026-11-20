// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static hulls in a traffic-on browser session (Phase 18, plan 18-22;
 * CBT-17, DATA-15).
 *
 * The static hulls (the Coriolis station, the buoys, the pod and the plate)
 * load only with NPC traffic on, and the browser-test bundle defaults traffic
 * off, so no other spec runs these paths (cross-AI review consensus item 4,
 * L37, L383, L731 and L795@b45e113). This spec opts in by URL
 * (`?test=1&traffic=1&clock=manual`, the opt-in of tests/e2e/combat.spec.ts
 * and tests/e2e/traffic.spec.ts) and shows that the player's lasers destroy the
 * Lave nav buoy, which then leaves the scanner's contacts (plan 18-08).
 *
 * Limitation (review L905@2e0bfb3): the probe has no static-health field, and
 * this plan adds none, so the dropped `navBuoy` contact is the only
 * destruction signal. Range cannot drop it: the player is parked at rest
 * 2,000 m from the buoy, far inside the 25,600 m scanner range, and the spec
 * reads the contact before it fires.
 *
 * The manual clock steps the simulation only when the spec asks, so the run is
 * deterministic and no seed is pinned (the URL has no seed flag; review
 * L906@2e0bfb3). Every assertion is a value read from the probe; the wait
 * timeouts are correctness bounds, never assertions of time.
 *
 * This is a new spec: it edits no existing browser spec (D-06), and it reads
 * only existing probe fields and test hooks (`setPosition`, `setOrientation`,
 * `setSpeed`, `advanceTicks`).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  add,
  length,
  normalizeVec,
  quatFromUnitVectors,
  scale,
  sub,
  vec,
} from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** Traffic on, manual clock: the static hulls load only with traffic on. */
const TRAFFIC_URL = "/?test=1&traffic=1&clock=manual";
/** The launch handover is 240 ticks (two seconds); this is comfortably past it. */
const LAUNCH_TICKS = 300;

/**
 * The Lave layout as plan 18-07 measured it (`deriveSystemLayout`): the nav
 * buoy sits 10,000 m from the station along the dock axis. The spec checks
 * these against the probe's published `world` positions before it uses them,
 * so a moved layout fails here instead of aiming at empty space.
 */
const LAVE_NAV_BUOY = vec(-43460.92, 53367.99, -430704.12);
const LAVE_STATION = vec(-49474.32, 60752.16, -427652.4);
/** How far the published positions may differ from the literals above, in m. */
const LAYOUT_TOLERANCE = 1;

/** The player's parking distance from the nav buoy, on the buoy-to-station line. */
const BUOY_STANDOFF = 2000;

/**
 * The bound on firing, derived rather than measured. The Cobra's fore pulse
 * laser fires every 61 ticks (`recharge_rate` 0.5 s at 120 ticks/s, a strict
 * gate) for 15 damage (`equipment.plist` `EQ_WEAPON_PULSE_LASER`). The nav
 * buoy has 250 energy and its frangible subentity 200; sticky routing can send
 * the hits to the subentity first (plan 18-15), so the kill needs at least
 * (250 + 200) / 15 = 30 hits. The factor 2 covers the buoy's 2/s and the
 * subentity's 1/s recharge and any beam that misses the tumbling hull. At that
 * bound the laser has not reached its heat cut-out (7 per shot, 6/s cooling,
 * cut-out at 217.6 is about 55 shots). The bound only stops the loop.
 */
const PULSE_PERIOD_TICKS = 61;
const PULSE_DAMAGE = 15;
const NAV_BUOY_ENERGY = 250;
const BUOY_SUBENTITY_ENERGY = 200;
const BUOY_KILL_BOUND_TICKS =
  2 *
  Math.ceil((NAV_BUOY_ENERGY + BUOY_SUBENTITY_ENERGY) / PULSE_DAMAGE) *
  PULSE_PERIOD_TICKS;
/** The chunk of manual ticks the firing loop advances between scanner reads. */
const FIRE_CHUNK_TICKS = 120;

test.setTimeout(240_000);

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
async function advance(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) => window.__wegolite?.test?.advanceTicks(count),
    n,
  );
  await waitForFrames(page, 2);
}

/** The scanner contacts by body id, read from the probe. */
async function contacts(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window.__wegolite?.hud.contacts ?? [])]);
}

/** Boot `url`, start a new game, launch and fly the launch handover out. */
async function launchInto(page: Page, url: string): Promise<void> {
  await page.goto(url);
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
  await advance(page, 1);
  await advance(page, LAUNCH_TICKS);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: SLOW },
  );
}

/** Check the layout literals against the probe's published world positions. */
async function expectLaveLayout(page: Page): Promise<void> {
  const world = await page.evaluate(() => window.__wegolite?.world);
  expect(world, "the probe publishes the world positions").toBeDefined();
  const published = (point: [number, number, number] | undefined): Vec3 =>
    vec(
      point?.[0] ?? Number.NaN,
      point?.[1] ?? Number.NaN,
      point?.[2] ?? Number.NaN,
    );
  expect(
    length(sub(published(world?.navBuoy), LAVE_NAV_BUOY)),
    "the published nav buoy is plan 18-07's Lave nav buoy",
  ).toBeLessThan(LAYOUT_TOLERANCE);
  expect(
    length(sub(published(world?.station), LAVE_STATION)),
    "the published station is plan 18-07's Lave station",
  ).toBeLessThan(LAYOUT_TOLERANCE);
}

/**
 * Park the player at `position`, at rest, with its forward (local -Z) pointing
 * at `target`.
 */
async function park(page: Page, position: Vec3, target: Vec3): Promise<void> {
  const orientation = quatFromUnitVectors(
    vec(0, 0, -1),
    normalizeVec(sub(target, position)),
  );
  await page.evaluate(
    (pose: { position: number[]; orientation: number[] }) => {
      const hook = window.__wegolite?.test;
      if (hook === undefined) throw new Error("the ?test=1 hook is missing");
      hook.setOrientation(
        pose.orientation[0] ?? 0,
        pose.orientation[1] ?? 0,
        pose.orientation[2] ?? 0,
        pose.orientation[3] ?? 0,
      );
      hook.setPosition(
        pose.position[0] ?? 0,
        pose.position[1] ?? 0,
        pose.position[2] ?? 0,
      );
      hook.setSpeed(0);
    },
    {
      position: [position.x, position.y, position.z],
      orientation: [orientation.w, orientation.x, orientation.y, orientation.z],
    },
  );
}

test("the player's lasers destroy the nav buoy and it leaves the scanner", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchInto(page, TRAFFIC_URL);
  await expectLaveLayout(page);

  // 2,000 m from the buoy towards the station, facing the buoy: the station is
  // 8,000 m behind, and nothing is close enough to collide or catch a blast.
  const towardStation = normalizeVec(sub(LAVE_STATION, LAVE_NAV_BUOY));
  const parked = add(LAVE_NAV_BUOY, scale(towardStation, BUOY_STANDOFF));
  await park(page, parked, LAVE_NAV_BUOY);
  await advance(page, 1);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.tainted),
    "the hooks taint the session so nothing is saved",
  ).toBe(true);
  expect(
    await contacts(page),
    "the nav buoy is on the scanner before the first shot",
  ).toContain("navBuoy");

  // Hold the fore laser and step the clock in chunks until the buoy leaves the
  // scanner or the derived bound passes.
  await page.keyboard.down("KeyA");
  let ticks = 0;
  let seen = await contacts(page);
  while (seen.includes("navBuoy") && ticks < BUOY_KILL_BOUND_TICKS) {
    await advance(page, FIRE_CHUNK_TICKS);
    ticks += FIRE_CHUNK_TICKS;
    seen = await contacts(page);
  }
  await page.keyboard.up("KeyA");
  test.info().annotations.push({
    type: "nav-buoy-kill",
    description: `navBuoy left the scanner after ${ticks - FIRE_CHUNK_TICKS} < t <= ${ticks} manual ticks of fire (chunks of ${FIRE_CHUNK_TICKS}, bound ${BUOY_KILL_BOUND_TICKS})`,
  });
  console.log(
    `nav-buoy-kill: navBuoy left the scanner after ${ticks - FIRE_CHUNK_TICKS} < t <= ${ticks} ticks of fire (bound ${BUOY_KILL_BOUND_TICKS})`,
  );
  expect(
    seen,
    `the nav buoy left the scanner (last contacts ${JSON.stringify(seen)} after ${ticks} ticks, bound ${BUOY_KILL_BOUND_TICKS})`,
  ).not.toContain("navBuoy");
  // The other static contacts stay: only the destroyed buoy left.
  expect(seen, "the station is still on the scanner").toContain("station");
  expect(errors).toEqual([]);
});
