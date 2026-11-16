// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one opt-in combat smoke of Phase 13 (plan 13-14; CBT-04 to CBT-07,
 * INPUT-01).
 *
 * The combat rules are proven by Vitest scenarios (ROADMAP criterion 5: at least
 * 90 % of the phase's behavioural assertions); this spec only shows that the
 * loop is wired in a real session: the fire key heats the laser, a scripted test
 * pilot placed ahead of the player takes its forward shield down, the ident
 * key locks it with a message, and a ship the player's laser brings to zero
 * energy is destroyed and leaves the scanner (FOUND-19, plan 15-04). Fire is
 * held from the moment the shooter appears, because the shooter fires back: the
 * player's energy bank must still pay for every pulse until the 14th hit kills
 * it (the budget and its Vitest twin are in tests/app/session/tick-parity.test.ts).
 * The explosion and the debris are Phase 16. It opts in by URL (`?test=1&traffic=1&clock=manual`,
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
/** The chunk of manual ticks the kill step advances between scanner reads. */
const KILL_CHUNK_TICKS = 60;
/**
 * A correctness bound for the kill step, never an assertion of time: the bank
 * refuses a shot from about 855 ticks after the spawn, so a kill cannot come
 * later (the twin measures it at 794).
 */
const KILL_BOUND_TICKS = 1500;

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

/** The ship contacts on the scanner, read from the probe. */
async function shipContacts(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window.__wegolite?.hud.contacts ?? []).filter(
        (contact) => contact === "ship",
      ).length,
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
  // The pulse laser's period is 61 ticks, so after 60 more ticks with the key
  // released the fore laser is ready when the shooter appears.
  await advance(page, 60);

  // 2. A test shooter 1,500 m ahead fires at the player; the forward shield falls.
  //    A is held from the spawn: the shooter fires back, and the bank must pay
  //    for every shot until the 14th hit destroys it.
  const full = await page.evaluate(() => window.__wegolite?.combat?.fwdShield);
  expect(full, "the shield before the shooter appears").toBe(128);
  await page.keyboard.down("KeyA");
  expect(
    await page.evaluate(() => window.__wegolite?.test?.spawnTestShooter()),
    "the hook spawned the shooter",
  ).toBe(true);
  const contactsWithShooter = await shipContacts(page);
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

  // 4. The held laser destroys the shooter: it leaves the scanner and the lock
  //    on it ends. Advance in chunks until the ship count is one lower; the
  //    bound only stops the loop (the vacuity guard below fails if it ended on
  //    the bound instead of the kill).
  let contacts = contactsWithShooter;
  let ticksSinceSpawn = SHOOTING_TICKS + 2;
  while (
    contacts >= contactsWithShooter &&
    ticksSinceSpawn < KILL_BOUND_TICKS
  ) {
    await advance(page, KILL_CHUNK_TICKS);
    ticksSinceSpawn += KILL_CHUNK_TICKS;
    contacts = await shipContacts(page);
  }
  await page.keyboard.up("KeyA");
  expect(contacts, "the scanner lost exactly the destroyed shooter").toBe(
    contactsWithShooter - 1,
  );
  // Ident stays engaged after a lost lock and re-scans, so another ship in the
  // sights is locked on the same tick; either outcome ends the lock on the
  // destroyed ship.
  await page.waitForFunction(
    () => {
      const message = window.__wegolite?.hud.message ?? "";
      const locked = window.__wegolite?.combat?.identLocked === true;
      return locked
        ? message.startsWith("Ident system locked onto")
        : message === "Target lost.";
    },
    undefined,
    { timeout: SLOW },
  );

  expect(errors).toEqual([]);
});
