// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Manual docking in the browser (DOCK-01, DOCK-02, DOCK-04).
 *
 * The pose is derived **independently** of `placeShipInPortFrame`: the mouth is
 * `station + stationToPlanet * dockOffset` using the probe's published station
 * and planet positions, and the matched orientation is rebuilt from the same
 * quaternion vocabulary. A helper bug therefore cannot make the unit tests and
 * the browser proof wrong in the same way.
 *
 * Headless Chromium runs on SwiftShader, so every wait is on the probe and the
 * timeouts are generous. No screenshots, no pixel reads (D-08).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  add,
  axisAngle,
  mul,
  normalize,
  normalizeVec,
  quatFromUnitVectors,
  rotate,
  scale,
  sub,
  vec,
} from "../../src/sim/math.js";
import { getProbe, waitForReady } from "./helpers/probe.js";

test.setTimeout(120_000);

/** The authored Coriolis dock subentity offset (`shipdata.plist`). */
const DOCK_OFFSET = 500.2561;
/** The committed Cobra's forward-most local Z (min.z). */
const COBRA_NOSE_Z = -43.4655;

async function bootToDocked(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await expect(page.locator("#docked")).toBeVisible();
  expect((await getProbe(page)).mode).toBe("docked");
}

async function waitForMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === expected
      );
    },
    mode,
    { timeout: 30_000 },
  );
}

test("an independently derived aligned pose docks through the visible opening", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "inFlight");

  const probe = await getProbe(page);
  const station = probe.world?.station;
  const planet = probe.world?.planet;
  expect(station).toBeDefined();
  expect(planet).toBeDefined();
  if (station === undefined || planet === undefined) return;

  // Same arithmetic as `dockMouthPosition`: station centre + dock offset along
  // the station-to-planet direction. The planet is published, so this does not
  // trust any hidden `stationToPlanet` field.
  const stationVec = vec(station[0], station[1], station[2]);
  const planetVec = vec(planet[0], planet[1], planet[2]);
  const stationToPlanet = normalizeVec(sub(planetVec, stationVec));
  const mouth = add(stationVec, scale(stationToPlanet, DOCK_OFFSET));

  // The matched pose: local -Z points inward, local X runs along the tall
  // slot. The half turn about local (1,1,0) flips the ship to face the station;
  // the nose then sits at min.z, so the centre is (nose - min.z) along k.
  const qPort = quatFromUnitVectors(vec(0, 0, -1), stationToPlanet);
  const matched = normalize(axisAngle(1, 1, 0, Math.PI));
  const orientation = normalize(mul(qPort, matched));
  const k = rotate(qPort, vec(0, 0, -1));
  const nosePastPlane = 90;
  const position = add(mouth, scale(k, -COBRA_NOSE_Z - nosePastPlane));

  await page.evaluate(
    (payload: { position: number[]; orientation: number[] }) => {
      const hook = window.__wegolite?.test;
      if (hook === undefined) throw new Error("the ?test=1 hook is missing");
      hook.setStationAngle(0);
      hook.setOrientation(
        payload.orientation[0] ?? 0,
        payload.orientation[1] ?? 0,
        payload.orientation[2] ?? 0,
        payload.orientation[3] ?? 0,
      );
      hook.setPosition(
        payload.position[0] ?? 0,
        payload.position[1] ?? 0,
        payload.position[2] ?? 0,
      );
      hook.setSpeed(0);
    },
    {
      position: [position.x, position.y, position.z],
      orientation: [orientation.w, orientation.x, orientation.y, orientation.z],
    },
  );

  // The mutation marks the profile; 04-05 refuses to autosave it.
  await page.waitForFunction(
    () => window.__wegolite?.test?.tainted === true,
    undefined,
    { timeout: 10_000 },
  );

  await waitForMode(page, "docked");
  await expect(page.locator("#docked")).toBeVisible();
  const docked = await getProbe(page);
  expect(docked.dock?.dockCount).toBe(1);
  expect(docked.dock?.outcome).toBe("docked");
  expect(docked.test?.tainted).toBe(true);
  expect(errors).toEqual([]);
});

test("the ?test hook is absent unless the query is exactly test=1", async ({
  page,
}) => {
  await page.goto("/");
  await waitForReady(page);
  const hasHook = await page.evaluate(
    () => window.__wegolite?.test !== undefined,
  );
  expect(hasHook).toBe(false);
});
