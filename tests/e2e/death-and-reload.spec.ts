// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The death-and-reload browser journey (plan 20-09; DEATH-01, DEATH-06, D-12,
 * D-13, D-14, D-16).
 *
 * One death route, the full-speed ram into the Lave nav buoy (RESEARCH Open
 * Question 5, resolved): the seed is `inFlightSaveAt("Lave", DEATH_RAM_POSE,
 * "Diso", ...)` written with `writeRaw` before the first load, so the fixture is
 * the production writer's blob and passes the strict boot reader on Continue.
 * The session runs under `?test=1&traffic=1&clock=manual` and steps the ram
 * through the manual-clock hook, so the player dies at the tick its Node twin
 * pins (`tests/app/session/death-twin.test.ts`, which restores the same blob
 * through the production path): the browser death is a determinism check, not a
 * timing guess. This session is tainted (the hook moved the clock), which is
 * harmless here: the subject is the page the death leaves behind, and the
 * stored blob is compared byte for byte before the death and after the reload.
 * `tests/e2e/game-over-guard.spec.ts` flies the same seed in an untainted
 * session, so its save checks can fail.
 *
 * `traffic=1` is required twice over: the collision stage needs the hull table
 * that only loads with traffic (without it the ram touches nothing, so the
 * browser-test bundle's default traffic-off session never dies), and the cause
 * line names the buoy ("Collided with Navigation Buoy") only because the
 * static names load with traffic.
 *
 * The D-14 docked half (Continue of a docked save with damaged equipment after
 * a reload) is the ordinary boot path and is proven by
 * `tests/e2e/save-load.spec.ts` ("a damaged item stays damaged after Continue
 * and after an in-session Load"); the two D-16 specs carry only the in-flight
 * case.
 *
 * Every wait reads a probe field and the dead page is read from the DOM
 * (computed styles and the line texts): no pixel is read and no wall time is
 * asserted. Each checkpoint is one snapshot asserted with one `expect` (D-16:
 * at least 90 % of the phase's new behavioural assertions are Vitest).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";
import {
  DEATH_RAM_POSE,
  DEATH_SEED_ITEMS,
  DEATH_TARGET,
  inFlightSaveAt,
} from "./helpers/save-fixtures.js";
import { readRaw, writeRaw } from "./helpers/save-store.js";

/** The URL this spec boots: the hook, traffic on, manual clock. */
const DEATH_URL = "/?test=1&traffic=1&clock=manual";

/**
 * The Node twin's pins (tests/app/session/death-twin.test.ts, plan 20-09): the
 * death tick relative to the restored tick and the cause with its culprit.
 * Never edit these to make the browser pass: a difference is a divergence to
 * report.
 */
const TWIN_DEATH_TICK_OFFSET = 1682;
const TWIN_DEATH_CAUSE = { damage: "scrape", culprit: "buoy" };

/** A correctness bound for a probe wait (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** The seed: the production writer's blob, a damaged item and a target. */
const SEED = inFlightSaveAt(
  "Lave",
  DEATH_RAM_POSE,
  DEATH_TARGET,
  DEATH_SEED_ITEMS,
);

/**
 * The non-launch budget of one test: no launch is played (both specs start in
 * flight from a seeded save), so the budget is three page loads, the 1,682
 * manual ticks and a reload, each bounded by `SLOW`. The CI margin rule is
 * 3 x the measured remote time below 60 % of this
 * (.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md).
 */
const NON_LAUNCH_BUDGET_MS = 120_000;
test.setTimeout(NON_LAUNCH_BUDGET_MS);

/** Collect console errors and uncaught page errors. */
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

/** Step `n` manual ticks, return the tick afterwards and let a frame publish. */
async function advance(page: Page, n: number): Promise<number> {
  const tick = await page.evaluate(
    (count) => window.__wegolite?.test?.advanceTicks(count) ?? -1,
    n,
  );
  await waitForFrames(page, 2);
  return tick;
}

/**
 * Write the seed before the first load, reload so the boot reader sees it, and
 * Continue into the in-flight session.
 */
async function continueSeed(page: Page): Promise<void> {
  await page.goto(DEATH_URL);
  await waitForReady(page);
  await writeRaw(page, SEED);
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible({ timeout: SLOW });
  await page.click("#title-continue");
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "inFlight" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );
}

/** What the restored session shows: the pose, the damaged list and the tick. */
async function restoredSnapshot(page: Page): Promise<{
  readonly mode: string | undefined;
  readonly restore: unknown;
  readonly damaged: readonly string[] | undefined;
  readonly tainted: boolean | undefined;
}> {
  return page.evaluate(() => {
    const probe = window.__wegolite;
    const restore = probe?.restore;
    return {
      mode: probe?.mode,
      restore:
        restore === undefined
          ? undefined
          : {
              mode: restore.mode,
              position: restore.position,
              orientation: restore.orientation,
              speed: restore.speed,
            },
      damaged: probe?.economy?.damagedEquipment,
      tainted: probe?.test?.tainted,
    };
  });
}

/**
 * Step the manual clock to the tick before the twin's death tick, then one more
 * tick, and return the two snapshots and the tick a further `advanceTicks(10)`
 * returns (20-06's refusal). The ram is `TWIN_DEATH_TICK_OFFSET` ticks out.
 */
async function dieAtTwinTick(page: Page): Promise<{
  readonly before: {
    readonly mode: string | undefined;
    readonly tick: number | undefined;
  };
  readonly dead: {
    readonly mode: string | undefined;
    readonly tick: number | undefined;
    readonly cause: unknown;
  };
  readonly refusedTick: number;
}> {
  await advance(page, TWIN_DEATH_TICK_OFFSET - 1);
  const before = await page.evaluate(() => ({
    mode: window.__wegolite?.mode,
    tick: window.__wegolite?.sim?.tick,
  }));

  await advance(page, 1);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "dead",
    undefined,
    {
      timeout: SLOW,
    },
  );
  const dead = await page.evaluate(() => ({
    mode: window.__wegolite?.mode,
    tick: window.__wegolite?.sim?.tick,
    cause: window.__wegolite?.death?.cause,
  }));
  // A dead world is frozen: a further advanceTicks returns the death tick.
  const refusedTick = await advance(page, 10);
  return { before, dead, refusedTick };
}

/** The dead page in the real markup: DOM reads only, no pixel. */
async function deadPageSnapshot(page: Page): Promise<{
  readonly gameOverShown: boolean;
  readonly lines: Record<string, string | undefined>;
  readonly titleVisibility: string | undefined;
  readonly statusVisibility: string | undefined;
  readonly viewFilterHasSaturate: boolean;
}> {
  // The saturate fade is written by the render driver on the first dead frame.
  await page.waitForFunction(
    () => {
      const view = document.getElementById("view");
      return (
        view !== null && getComputedStyle(view).filter.includes("saturate(")
      );
    },
    undefined,
    { timeout: SLOW },
  );
  return page.evaluate(() => {
    const read = (id: string): HTMLElement | null =>
      document.getElementById(id);
    const line = (name: string): string | undefined =>
      document.querySelector(`#game-over [data-game-over-line="${name}"]`)
        ?.textContent ?? undefined;
    const visibility = (id: string): string | undefined => {
      const element = read(id);
      return element === null
        ? undefined
        : getComputedStyle(element).visibility;
    };
    const view = read("view");
    return {
      gameOverShown: read("game-over")?.hidden === false,
      lines: {
        title: line("title"),
        cause: line("cause"),
        score: line("score"),
        prompt: line("prompt"),
      },
      titleVisibility: visibility("title"),
      statusVisibility: visibility("status"),
      viewFilterHasSaturate:
        view !== null && getComputedStyle(view).filter.includes("saturate("),
    };
  });
}

/** What a reloaded title shows: Continue and the page marker. */
async function reloadedTitle(page: Page): Promise<{
  readonly ready: boolean | undefined;
  readonly continueVisible: boolean | undefined;
  readonly marker: unknown;
}> {
  return page.evaluate(() => ({
    ready: window.__wegolite?.ready,
    continueVisible: window.__wegolite?.save?.continueVisible,
    marker: Reflect.get(window, "__deathMarker") as unknown,
  }));
}

/** Wait until the page has reloaded: the marker is gone and the probe is ready. */
async function waitForReload(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Reflect.get(window, "__deathMarker") === undefined &&
      window.__wegolite?.ready === true,
    undefined,
    { timeout: SLOW },
  );
}

test("a ram death at the twin's tick, one fresh Space, and Continue resumes the seeded save with its damaged item", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await continueSeed(page);

  // The Continue installed the seed: the pose, the damaged item, untainted so
  // far (the hook has not been called).
  const restored = await restoredSnapshot(page);
  expect(restored, "the restored session").toEqual({
    mode: "inFlight",
    restore: {
      mode: "inFlight",
      position: DEATH_RAM_POSE.position,
      orientation: DEATH_RAM_POSE.orientation,
      speed: DEATH_RAM_POSE.speed,
    },
    damaged: DEATH_SEED_ITEMS.damagedEquipment,
    tainted: false,
  });
  const blobBefore = await readRaw(page);
  expect(blobBefore, "the seed is in the store").toBe(SEED);
  const restoredTick = await page.evaluate(
    () => window.__wegolite?.sim?.tick ?? -1,
  );
  expect(restoredTick).toBe(0);

  // The ram, stepped to the twin's tick, with the twin's cause.
  const death = await dieAtTwinTick(page);
  expect(death, "the death at the twin's tick").toEqual({
    before: {
      mode: "inFlight",
      tick: restoredTick + TWIN_DEATH_TICK_OFFSET - 1,
    },
    dead: {
      mode: "dead",
      tick: restoredTick + TWIN_DEATH_TICK_OFFSET,
      cause: TWIN_DEATH_CAUSE,
    },
    refusedTick: restoredTick + TWIN_DEATH_TICK_OFFSET,
  });

  // The dead page in the real markup (the cause line needs traffic=1).
  const dead = await deadPageSnapshot(page);
  expect(dead, "the game-over view").toEqual({
    gameOverShown: true,
    lines: {
      title: "Game Over",
      cause: "Collided with Navigation Buoy",
      score: expect.stringMatching(/^Score: .+₢$/) as unknown as string,
      prompt: "Press Space",
    },
    titleVisibility: "hidden",
    statusVisibility: "hidden",
    viewFilterHasSaturate: true,
  });

  // One fresh Space reloads the page (D-07, D-12): the marker is gone, the
  // probe is ready again, the title offers Continue and the blob is untouched.
  await page.evaluate(() => {
    Reflect.set(window, "__deathMarker", "alive");
  });
  await page.keyboard.press("Space");
  await waitForReload(page);
  await expect(page.locator("#title-continue")).toBeVisible({ timeout: SLOW });
  const afterReload = {
    title: await reloadedTitle(page),
    blob: (await readRaw(page)) === blobBefore,
  };
  expect(afterReload, "the reloaded title").toEqual({
    title: { ready: true, continueVisible: true, marker: undefined },
    blob: true,
  });

  // Continue resumes that save in flight, the damaged item still damaged.
  await page.click("#title-continue");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: SLOW },
  );
  expect(await restoredSnapshot(page), "the resumed save").toEqual({
    mode: "inFlight",
    restore: {
      mode: "inFlight",
      position: DEATH_RAM_POSE.position,
      orientation: DEATH_RAM_POSE.orientation,
      speed: DEATH_RAM_POSE.speed,
    },
    damaged: DEATH_SEED_ITEMS.damagedEquipment,
    tainted: false,
  });
  expect(errors).toEqual([]);
});
