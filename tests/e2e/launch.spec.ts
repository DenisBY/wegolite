// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch in the browser (D-10, FLGT-01; the pre-roll, quick 261118-os8).
 *
 * A launch press first plays the presentation pre-roll inside the dock slot
 * while the simulation stays docked, then the simulated launch, then the
 * handover. The launch view's camera *pose* (from the inner end of the slot
 * out to the cockpit) is decided by `tests/render/launch-camera.test.ts`; a
 * pixel-free browser check cannot tell a camera in the slot from one at the
 * mouth. This spec therefore asserts only what the browser owns: the timeline
 * (pre-roll, launching, inFlight), the pre-launch autosave's moment, the
 * exactly-once +600 s adjustment, the hidden station shell, nav, hull, HUD and
 * overlay lines through the launch view, the HUD at handover, the skip and the
 * pause, and the absence of console/page errors.
 *
 * Headless Chromium renders the procedural planet on SwiftShader and the fixed
 * step loop advances slower than wall time, so every wait is on the probe and
 * every bound is generous (Pitfall 15).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getProbe, press, waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

test.setTimeout(120_000);

async function bootToDocked(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await expect(page.locator("#docked")).toBeVisible();
  expect((await getProbe(page)).mode).toBe("docked");
}

/** Wait until the launch pre-roll runs (the sim still docked). */
async function waitForPreRoll(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.mode === "docked" &&
        probe.launch.preRolling
      );
    },
    undefined,
    { timeout: 30_000 },
  );
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

test("the first launch plays the full launch view and hands over to the cockpit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  const before = await getProbe(page);
  const clockBefore = before.clock;
  expect(before.launch.count).toBe(0);
  expect(before.launch.seen).toBe(false);

  // The pre-launch autosave's counter: `attempts` is incremented synchronously
  // at every autosave call, before any skip guard, so it pins the call's
  // moment whether or not a write follows.
  const attemptsBefore = before.save?.attempts ?? 0;

  await page.click('button[data-action="launch"]');
  // The pre-roll (quick 261118-os8): the sim stays docked, no launch, no game
  // time and no autosave yet.
  await waitForPreRoll(page);
  const preRoll = await getProbe(page);
  expect(preRoll.mode).toBe("docked");
  expect(preRoll.launch.count).toBe(0);
  expect(preRoll.clock).toBe(clockBefore);
  expect(preRoll.save?.attempts ?? 0).toBe(attemptsBefore);
  expect(preRoll.shipVisible).toBe(false);
  // The station shell, its nav, the HUD and the overlay lines are hidden for
  // the whole launch view.
  await expect(page.locator("#docked")).toBeHidden();
  await expect(page.locator("#docked .station-nav")).toBeHidden();
  await expect(page.locator("#hud")).toBeHidden();
  await expect(page.locator("#overlay #title")).toBeHidden();
  await expect(page.locator("#overlay #status")).toBeHidden();

  await waitForMode(page, "launching");

  const during = await getProbe(page);
  expect(during.launch.count).toBe(1);
  expect(during.launch.preRolling).toBe(false);
  // The D-17 anchor was taken once, on the step that ended the pre-roll.
  expect(during.save?.attempts ?? 0).toBe(attemptsBefore + 1);
  // The launch view is a cockpit view: the hull and the HUD stay hidden
  // until handover (quick 261118-l26).
  expect(during.shipVisible).toBe(false);
  await expect(page.locator("#hud")).toBeHidden();
  // The page overlay's version and system lines stay hidden, as in flight.
  await expect(page.locator("#overlay #title")).toBeHidden();
  await expect(page.locator("#overlay #status")).toBeHidden();
  expect(during.clock - clockBefore).toBeGreaterThanOrEqual(600);
  expect(during.clock - clockBefore).toBeLessThan(602);

  await waitForMode(page, "inFlight");
  const after = await getProbe(page);
  expect(after.shipVisible).toBe(false);
  await expect(page.locator("#hud")).toBeVisible();
  // The HUD canvas is laid out and has a backing store at the handover, not
  // a visible but zero-sized element.
  const hudCanvas = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#hud");
    if (canvas === null) return null;
    const box = canvas.getBoundingClientRect();
    return {
      width: canvas.width,
      height: canvas.height,
      boxWidth: box.width,
      boxHeight: box.height,
    };
  });
  expect(hudCanvas).not.toBeNull();
  expect(hudCanvas?.width).toBeGreaterThan(0);
  expect(hudCanvas?.height).toBeGreaterThan(0);
  expect(hudCanvas?.boxWidth).toBeGreaterThan(0);
  expect(hudCanvas?.boxHeight).toBeGreaterThan(0);
  expect(after.launch.seen).toBe(true);
  expect(after.save?.attempts ?? 0).toBe(attemptsBefore + 1);
  // The +600 s adjustment happens exactly once; the two seconds of launching
  // add a little simulated flight time on top.
  expect(after.clock - clockBefore).toBeGreaterThanOrEqual(600);
  expect(after.clock - clockBefore).toBeLessThan(610);

  // The first viewing is never skippable: launchSeen was false at launch start.
  expect(errors).toEqual([]);
});

test("a launch after the first viewing skips the pre-roll and the launch on any key", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  // First viewing: play in full so `launchSeen` is persisted at handover.
  await bootToDocked(page);
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "inFlight");

  // Reload: the new game is docked again, but `launchSeen` survived in settings.
  await page.reload();
  await waitForReady(page);
  await startNewGame(page);
  await expect(page.locator("#docked")).toBeVisible();
  const reloaded = await getProbe(page);
  expect(reloaded.mode).toBe("docked");
  expect(reloaded.launch.seen).toBe(true);
  const clockBefore = reloaded.clock;

  await page.click('button[data-action="launch"]');
  // The key lands during the pre-roll (quick 261118-os8): the next fixed step
  // launches and the frame after skips, with the +600 s applied once.
  await waitForPreRoll(page);
  await press(page, "Space");

  await waitForMode(page, "inFlight");
  const after = await getProbe(page);
  expect(after.launch.count).toBe(1);
  expect(after.launch.preRolling).toBe(false);
  expect(after.clock - clockBefore).toBeGreaterThanOrEqual(600);
  // A skip must not replay the two scripted seconds; a small number of steps
  // before the key landed is expected.
  expect(after.clock - clockBefore).toBeLessThan(604);
  expect(errors).toEqual([]);
});

/**
 * The same mass-lock-free point as `tests/sim/torus.test.ts` and
 * `tests/e2e/flight.spec.ts`: `station - stationToPlanet * 120,000`.
 */
const TORUS_TEST_POINT = [
  -121_635.102_366_311_97, 149_362.238_845_820_7, -391_031.703_458_028_1,
] as const;

test("hints stay on the message line, dismiss on first use and persist", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  // D-11: the launch hint is in the docked panel's message line, using the
  // current binding label (not a hard-coded key).
  const dockedMessage = page.locator('#docked [data-field="message"]');
  await expect(dockedMessage).toContainText("to launch");
  await expect(dockedMessage).toContainText("1");

  await page.click('button[data-action="launch"]');
  await waitForMode(page, "inFlight");

  // D-04: the camera-local dust field is live in flight.
  const flight = await getProbe(page);
  expect(flight.dust?.active).toBe(true);
  expect(flight.dust?.count ?? 0).toBeGreaterThanOrEqual(600);

  // Clear the station lock so the torus hint is legitimate.
  await page.evaluate((point: readonly number[]) => {
    const probe = window.__wegolite;
    if (probe?.test === undefined) throw new Error("the ?test hook is missing");
    probe.test.setPosition(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0);
    probe.test.setSpeed(350);
  }, TORUS_TEST_POINT);
  await page.waitForFunction(
    () => window.__wegolite?.torus.massLocked === false,
    undefined,
    { timeout: 20_000 },
  );

  // The torus hint appears once clear of mass lock. The probe publishes the
  // controller's decision (the message line itself expires on the simulation
  // clock, which runs far slower than wall time under SwiftShader).
  await page.waitForFunction(
    () => (window.__wegolite?.hint ?? "").includes("Torus drive"),
    undefined,
    { timeout: 30_000 },
  );

  await press(page, "j");
  await page.waitForFunction(
    () => window.__wegolite?.torus.engaged === true,
    undefined,
    { timeout: 10_000 },
  );
  // First engagement dismisses the torus hint and advances to the disengage
  // hint, which is the "used" proof on the message line.
  await page.waitForFunction(
    () => window.__wegolite?.hints?.includes("torus") === true,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () => (window.__wegolite?.hint ?? "").includes("disengage"),
    undefined,
    { timeout: 15_000 },
  );
  expect((await getProbe(page)).dust?.active).toBe(true);

  // The dismissal is persisted in the versioned settings blob.
  const stored = await page.evaluate(() =>
    localStorage.getItem("wegolite.settings"),
  );
  expect(stored).not.toBeNull();
  expect(stored).toContain('"torus"');

  // Reload: the launch hint does not reappear because `hintsSeen` survived.
  await page.reload();
  await waitForReady(page);
  await startNewGame(page);
  await expect(page.locator("#docked")).toBeVisible();
  await expect(page.locator('#docked [data-field="message"]')).toHaveText("");
  const reloaded = await getProbe(page);
  expect(reloaded.hints).toContain("launch");
  expect(reloaded.hints).toContain("torus");
  expect(errors).toEqual([]);
});

test("the pre-roll and the launch view freeze with pause", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  await page.click('button[data-action="launch"]');

  // The pre-roll advances on fixed steps only (quick 261118-os8): pause
  // holds its elapsed time and the docked sim.
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.launch.preRolling &&
        probe.launch.preRollElapsed > 0
      );
    },
    undefined,
    { timeout: 30_000 },
  );
  await press(page, "p");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    { timeout: 10_000 },
  );
  const held = await getProbe(page);
  expect(held.launch.preRolling).toBe(true);
  expect(held.mode).toBe("docked");
  await page.waitForTimeout(750);
  const stillHeld = await getProbe(page);
  expect(stillHeld.launch.preRollElapsed).toBe(held.launch.preRollElapsed);
  expect(stillHeld.mode).toBe("docked");
  expect(stillHeld.launch.count).toBe(0);
  await press(page, "p");

  await waitForMode(page, "launching");

  // The tunnel overlay is gone: the HUD canvas stays hidden while launching.
  await expect(page.locator("#hud")).toBeHidden();

  // The launch timer advances on fixed steps, not wall time.
  const first = (await getProbe(page)).launch.elapsed;
  await page.waitForFunction(
    (start) => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.launch.elapsed > start;
    },
    first,
    { timeout: 20_000 },
  );

  // Pause freezes the same timer: no step runs, so no hidden time is replayed.
  await press(page, "p");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    { timeout: 10_000 },
  );
  const frozen = (await getProbe(page)).launch.elapsed;
  await page.waitForTimeout(750);
  expect((await getProbe(page)).launch.elapsed).toBe(frozen);

  await press(page, "p");
  await waitForMode(page, "inFlight");
  expect(errors).toEqual([]);
});
