// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one opt-in combat smoke of Phase 13 (plan 13-14; CBT-04 to CBT-07,
 * INPUT-01).
 *
 * The combat rules are proven by Vitest scenarios (ROADMAP criterion 5: at least
 * 90 % of the phase's behavioural assertions); this spec only shows that the
 * loop is wired in a real session: the fire key heats the laser, a scripted test
 * pilot placed ahead of the player takes its forward shield down, and the ident
 * key locks it with a message. It opts in by URL (`?test=1&traffic=1&clock=manual`,
 * the same opt-in as tests/e2e/traffic.spec.ts), because the browser-test bundle
 * defaults NPC traffic off and the hull and weapon tables load only with traffic
 * on. Every assertion is a count or a value read from the probe; none measures
 * time. The wait timeouts are correctness bounds, never assertions.
 *
 * The visuals (the four views, the laser lines, the ident frame) are not asserted
 * here: they are covered by unit tests and need a human look.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** The URL this spec boots: traffic on, manual clock (opt-in by URL only). */
const COMBAT_URL = "/?test=1&traffic=1&clock=manual";
/** The launch handover is 240 ticks (two seconds); this is comfortably past it. */
const LAUNCH_TICKS = 300;
/** A beam-armed Viper thinks every 15 ticks; this is 24 thinks. */
const SHOOTING_TICKS = 360;

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

test("the fire key heats the laser, a test shooter drains the shield and R locks it", async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto(COMBAT_URL);
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "docked" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );

  // Launch and fly the scripted exit out, then park the ship so the geometry
  // of the shooter's line stays put.
  await page.click('button[data-action="launch"]');
  await waitForFrames(page, 1);
  await advance(page, 1);
  await advance(page, LAUNCH_TICKS);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    {
      timeout: SLOW,
    },
  );
  await page.evaluate(() => window.__wegolite?.test?.setSpeed(0));

  // 1. Holding A for 30 ticks fires the fore laser, which is then warm.
  await page.keyboard.down("KeyA");
  await advance(page, 30);
  await page.keyboard.up("KeyA");
  await waitForFrames(page, 1);
  expect(
    await page.evaluate(() => window.__wegolite?.combat?.laserTemp),
    "LT after holding A",
  ).toBeGreaterThan(0);

  // 2. A test shooter 1,500 m ahead fires at the player; the forward shield falls.
  const full = await page.evaluate(() => window.__wegolite?.combat?.fwdShield);
  expect(full, "the shield before the shooter appears").toBe(128);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.spawnTestShooter()),
    "the hook spawned the shooter",
  ).toBe(true);
  await advance(page, SHOOTING_TICKS);
  expect(
    await page.evaluate(() => window.__wegolite?.combat?.fwdShield),
    "forward shield after the shooter's fire",
  ).toBeLessThan(128);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.tainted),
    "the hook taints the session so nothing is saved",
  ).toBe(true);

  // 3. R engages the ident system and locks the ship in the sights.
  await page.keyboard.press("KeyR");
  await advance(page, 2);
  await page.waitForFunction(
    () =>
      (window.__wegolite?.hud.message ?? "").startsWith(
        "Ident system locked onto",
      ),
    undefined,
    { timeout: SLOW },
  );
  expect(
    await page.evaluate(() => window.__wegolite?.combat?.identLocked),
    "an ident lock exists",
  ).toBe(true);

  expect(errors).toEqual([]);
});
