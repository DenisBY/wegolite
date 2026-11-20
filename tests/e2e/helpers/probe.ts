// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The browser probe helper (Pattern: e2e probe).
 *
 * Every spec waits on the probe rather than on pixels (D-08 forbids screenshot
 * evidence). `getProbe` narrows the ready/failure union so a caller can read the
 * flight fields without a cast.
 */

import type { Page } from "@playwright/test";

import type { WegoliteProbe } from "../../../src/app/probe.js";

/**
 * The ceiling for an inner wait that spans a launch the test does not skip.
 *
 * The first launch of a fresh browser profile cannot be skipped (D-10:
 * `launchSeen` is false in fresh settings), so it plays the pre-roll and the
 * launch view in full. The wait is frame-bound: the session runs at most 5
 * fixed steps of 1/120 s per rendered frame, and GitHub's ubuntu-latest runner
 * renders on SwiftShader without a GPU. The full first launch took about 70 s
 * of real time on CI run 44796363344 (launch.spec.ts "the first launch plays
 * the full launch view" passed in 1.2 min); 180 s leaves margin over that.
 *
 * Budget rule: a test or file timeout that covers such a wait is its non-launch
 * budget plus one FIRST_LAUNCH_WAIT_MS per unskipped launch. The CI timeout
 * rule and its history live in
 * .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md (quick task
 * 261120-ryc). This is a correctness wait, not a performance claim (Pitfall 15).
 */
export const FIRST_LAUNCH_WAIT_MS = 180_000;

/** Wait until the app has published a ready probe. */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.ready === true;
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** Read the live probe, asserting it is the ready variant. */
export async function getProbe(page: Page): Promise<WegoliteProbe> {
  const probe = await page.evaluate(() => window.__wegolite);
  if (probe === undefined || probe.ready !== true) {
    throw new Error("Wegolite probe is not ready.");
  }
  return probe;
}

/** A single key press (edge actions only). */
export async function press(page: Page, code: string): Promise<void> {
  await page.keyboard.press(code);
}

/** Hold a key for `milliseconds`, then release it. */
export async function hold(
  page: Page,
  code: string,
  milliseconds: number,
): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(code);
}
