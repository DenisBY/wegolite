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

/** The independent dock frame derived from the published probe positions. */
function dockFrame(
  station: readonly [number, number, number],
  planet: readonly [number, number, number],
): {
  mouth: ReturnType<typeof vec>;
  k: ReturnType<typeof vec>;
  qPort: ReturnType<typeof quatFromUnitVectors>;
} {
  const stationVec = vec(station[0], station[1], station[2]);
  const planetVec = vec(planet[0], planet[1], planet[2]);
  const stationToPlanet = normalizeVec(sub(planetVec, stationVec));
  const mouth = add(stationVec, scale(stationToPlanet, DOCK_OFFSET));
  const qPort = quatFromUnitVectors(vec(0, 0, -1), stationToPlanet);
  return { mouth, k: rotate(qPort, vec(0, 0, -1)), qPort };
}

async function readDockFrame(page: Page): Promise<{
  mouth: ReturnType<typeof vec>;
  k: ReturnType<typeof vec>;
  qPort: ReturnType<typeof quatFromUnitVectors>;
}> {
  const probe = await getProbe(page);
  const station = probe.world?.station;
  const planet = probe.world?.planet;
  if (station === undefined || planet === undefined) {
    throw new Error("the probe has no station/planet world positions");
  }
  return dockFrame(station, planet);
}

/** Place a pose through the hook; stationAngle 0 keeps the frame deterministic. */
async function placePose(
  page: Page,
  position: ReturnType<typeof vec>,
  orientation: { w: number; x: number; y: number; z: number },
  speed: number,
): Promise<void> {
  await page.evaluate(
    (payload: { position: number[]; orientation: number[]; speed: number }) => {
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
      hook.setSpeed(payload.speed);
    },
    {
      position: [position.x, position.y, position.z],
      orientation: [orientation.w, orientation.x, orientation.y, orientation.z],
      speed,
    },
  );
}

test("a bounce shakes, flashes and messages, and a retry is immediate", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "inFlight");

  // The departure phase is response-free before any hook placement: the
  // browser counterpart of the integrated sim test.
  const inFlight = await getProbe(page);
  await page.waitForFunction(
    (start) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.mode === "inFlight" &&
        probe.flightTime >= start + 2 &&
        (probe.dock?.bounceCount ?? -1) === 0
      );
    },
    inFlight.flightTime,
    { timeout: 60_000 },
  );
  expect((await getProbe(page)).dock?.bounceCount).toBe(0);

  const frame = await readDockFrame(page);
  const matched = normalize(axisAngle(1, 1, 0, Math.PI));
  const wingsAcross = normalize(
    mul(frame.qPort, mul(matched, axisAngle(0, 0, 1, Math.PI / 2))),
  );
  const aligned = normalize(mul(frame.qPort, matched));

  // Wings across, nose 10 m past the plane, moving inward: the straddle.
  await placePose(
    page,
    add(frame.mouth, scale(frame.k, -COBRA_NOSE_Z - 10)),
    wingsAcross,
    60,
  );

  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      const dock = probe?.dock;
      return (
        dock !== undefined &&
        dock.bounceCount >= 1 &&
        dock.shake > 0 &&
        dock.flash > 0
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  const afterBounce = await getProbe(page);
  const triggerTime = afterBounce.flightTime;
  expect(afterBounce.dock?.bounceCount).toBeGreaterThanOrEqual(1);
  expect(afterBounce.dock?.shake).toBeGreaterThan(0);
  expect(afterBounce.dock?.flash).toBeGreaterThan(0);
  expect(afterBounce.mode).toBe("inFlight");

  await page.waitForFunction(
    () =>
      window.__wegolite?.hud?.message.includes("Too wide for the slot") ===
      true,
    undefined,
    { timeout: 30_000 },
  );

  // Both envelopes expire inside D-08's 0.3-0.5 s window.
  await page.waitForFunction(
    (trigger) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.flightTime >= trigger + 0.6 &&
        (probe.dock?.shake ?? 1) === 0 &&
        (probe.dock?.flash ?? 1) === 0
      );
    },
    triggerTime,
    { timeout: 30_000 },
  );
  const settled = await getProbe(page);
  expect(settled.mode).toBe("inFlight");
  expect(settled.dock?.shake).toBe(0);
  expect(settled.dock?.flash).toBe(0);

  // A second approach can bounce again: recovery is immediate.
  await placePose(
    page,
    add(frame.mouth, scale(frame.k, -COBRA_NOSE_Z - 10)),
    wingsAcross,
    60,
  );
  await page.waitForFunction(
    () => {
      const dock = window.__wegolite?.dock;
      return (
        dock !== undefined &&
        dock.bounceCount >= 2 &&
        dock.shake > 0 &&
        dock.flash > 0
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  // Retry with an aligned pose and dock.
  await placePose(
    page,
    add(frame.mouth, scale(frame.k, -COBRA_NOSE_Z - 90)),
    aligned,
    0,
  );
  await waitForMode(page, "docked");
  const docked = await getProbe(page);
  expect(docked.dock?.dockCount).toBe(1);
  expect(docked.dock?.bounceCount).toBeGreaterThanOrEqual(2);

  // Relaunch and skip: the arming tick must not produce a contact response.
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  await page.keyboard.press("x");
  await waitForMode(page, "inFlight");

  const skip = await getProbe(page);
  expect(skip.dock?.bounceCount).toBe(0);
  await page.waitForFunction(
    (start) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.flightTime >= start + 0.6 &&
        (probe.dock?.bounceCount ?? -1) === 0
      );
    },
    skip.flightTime,
    { timeout: 30_000 },
  );
  const afterSkip = await getProbe(page);
  expect(afterSkip.mode).toBe("inFlight");
  expect(afterSkip.dock?.bounceCount).toBe(0);
  expect(errors).toEqual([]);
});

test("the docked home shows real credits, ship, fuel and the four screen entries", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);

  const dockedPanel = page.locator("#docked");
  await expect(dockedPanel.locator('[data-field="credits"]')).toHaveText(
    "100.0 Cr",
  );
  await expect(dockedPanel.locator('[data-field="ship"]')).toHaveText(
    "Cobra Mk III",
  );
  await expect(dockedPanel.locator('[data-field="fuel"]')).toHaveText("7.0 LY");

  // The four screens are advertised on the home panel; only F8 is wired in
  // wave 1, and the F3 TL-9 refusal moves to plan 05-05's station spec.
  await expect(dockedPanel).toContainText("Market (F8)");
  await expect(dockedPanel).toContainText("Outfitting (F3)");
  await expect(dockedPanel).toContainText("Status (F5)");
  await expect(dockedPanel).toContainText("System data (F7)");
  await expect(page.locator('button[data-action="launch"]')).toBeVisible();

  // The station footer is a div, never a second footer: the document
  // disclaimer stays the only element `locator("footer")` resolves to, and
  // the two boxes must not overlap.
  await expect(page.locator("footer")).toHaveCount(1);
  const stationFooter = dockedPanel.locator(".station-footer");
  await expect(stationFooter).toBeVisible();
  const footerBox = await page.locator("footer").boundingBox();
  const stationBox = await stationFooter.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(stationBox).not.toBeNull();
  if (footerBox !== null && stationBox !== null) {
    const overlaps =
      stationBox.y < footerBox.y + footerBox.height &&
      footerBox.y < stationBox.y + stationBox.height;
    expect(overlaps).toBe(false);
  }

  expect(errors).toEqual([]);
});

test("docked Controls rebind keeps probe.mode docked and no pause", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);

  // The same shift metadata drives the Controls row and the rebind feedback.
  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeVisible();
  await page.click('#pause button[data-pause-action="controls"]');
  await expect(page.locator("#controls")).toBeVisible();

  const dockComputerRow = page.locator(
    '.controls-row:has([data-rebind="dockingComputer"])',
  );
  await expect(dockComputerRow.locator(".controls-label")).toHaveText(
    "Docking computer",
  );
  await expect(dockComputerRow.locator(".controls-codes")).toHaveText(
    "Shift+C",
  );

  await page.click('button[data-rebind="dockingComputer"]');
  await page.keyboard.press("KeyK");
  await expect(page.locator("#controls-status")).toHaveText(
    "Docking computer bound to Shift+K.",
  );

  const probe = await getProbe(page);
  expect(probe.mode).toBe("docked");
  // Rebinding a key never toggles the paused flag; only Resume may.
  expect(probe.paused).toBe(true);
  expect(errors).toEqual([]);
});

test("Shift+C with the computer granted docks instantly with exactly 1200 s", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  // Launch from the home screen with the advertised Digit1 key.
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");

  // D-10 test seam: the equipment is granted, never persisted (04-05 refuses a
  // tainted profile).
  const granted = await page.evaluate(() => {
    const hook = window.__wegolite?.test;
    if (hook === undefined) throw new Error("the ?test=1 hook is missing");
    return hook.grantEquipment("EQ_DOCK_COMP");
  });
  expect(granted).toBe(true);
  await page.waitForFunction(
    () => window.__wegolite?.test?.tainted === true,
    undefined,
    { timeout: 10_000 },
  );

  const before = await getProbe(page);
  expect(before.dock?.lastClockDelta).toBe(0);

  // Plain C is Oolite's autopilot key, not the computer: it must not dock.
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(400);
  expect((await getProbe(page)).mode).toBe("inFlight");

  // Shift+C is the fast autopilot (n_key_autodock). Hold Shift explicitly so
  // the chord's modifier state is unambiguous.
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyC");
  await page.keyboard.up("Shift");

  await waitForMode(page, "docked");
  const docked = await getProbe(page);
  expect(docked.dock?.lastClockDelta).toBe(1200);
  expect(docked.dock?.dockCount).toBe(1);
  // WR-03: the computer dock is not an autosave trigger either. `attempts`
  // counts the launch write only, even though the profile is tainted.
  expect(docked.save?.attempts).toBe(1);
  await expect(page.locator("#docked")).toBeVisible();
  await expect(page.locator("#hud")).toBeHidden();
  expect(docked.test?.tainted).toBe(true);
  expect(errors).toEqual([]);
});

test("Shift+C beyond the station aegis stays in flight and says why", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "inFlight");

  await page.evaluate(() => {
    const hook = window.__wegolite?.test;
    if (hook === undefined) throw new Error("the ?test=1 hook is missing");
    hook.grantEquipment("EQ_DOCK_COMP");
  });

  const probe = await getProbe(page);
  const station = probe.world?.station;
  const planet = probe.world?.planet;
  if (station === undefined || planet === undefined) {
    throw new Error("the probe has no station/planet world positions");
  }

  // One metre beyond the 51,200 m aegis, away from the planet so the planetary
  // aegis is left too (the same geometry the aegis unit test pins).
  const dx = station[0] - planet[0];
  const dy = station[1] - planet[1];
  const dz = station[2] - planet[2];
  const distance = Math.hypot(dx, dy, dz);
  const target: [number, number, number] = [
    station[0] + (dx / distance) * 51_201,
    station[1] + (dy / distance) * 51_201,
    station[2] + (dz / distance) * 51_201,
  ];
  await page.evaluate((point: [number, number, number]) => {
    const hook = window.__wegolite?.test;
    if (hook === undefined) throw new Error("the ?test=1 hook is missing");
    hook.setPosition(point[0], point[1], point[2]);
    // No drift between the placement and the key press.
    hook.setSpeed(0);
  }, target);

  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyC");
  await page.keyboard.up("Shift");

  await page.waitForFunction(
    () =>
      (window.__wegolite?.hud?.message ?? "").includes(
        "Too far from the station",
      ) === true,
    undefined,
    { timeout: 30_000 },
  );

  const after = await getProbe(page);
  expect(after.mode).toBe("inFlight");
  expect(after.dock?.dockCount).toBe(0);
  expect(after.dock?.lastClockDelta).toBe(0);
  expect(errors).toEqual([]);
});
