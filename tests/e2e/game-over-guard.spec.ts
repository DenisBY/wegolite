// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The game-over guard in a real, untainted session (plan 20-09; DEATH-06, D-07,
 * ROADMAP Phase 20 criterion 2, browser half).
 *
 * Nothing the player or the browser does after the death saves, pauses,
 * reopens or revives anything. The seed is the same ram as
 * `tests/e2e/death-and-reload.spec.ts` (`DEATH_RAM_POSE`, a damaged item, a
 * committed target of Diso), written with `writeRaw` before the first load and
 * continued under `?test=1&traffic=1`, WITHOUT the manual clock, and no member
 * of the in-page test hook is ever called. The one access to the hook is the
 * read-only `tainted` flag, so the session stays untainted: every save path
 * stays live, and the write count, the byte-equal blob and the blob after the
 * reload FAIL if any path saves the dead player. A hooked session never writes,
 * so it could not fail them (T-20-34). The real-time frame loop flies the ram
 * and the player dies with the cause its Node twin pins
 * (`tests/app/session/death-twin.test.ts`).
 *
 * The unit-level proofs of the same refusals are `tests/app/session/
 * save-controller.test.ts` (a dead state never queues a write, through autosave
 * or the manual save) and `tests/app/session/death-flow.test.ts` (the latch and
 * the refusals); this spec shows the whole chain in a real browser. Races and
 * edge cases stay in Vitest (D-16).
 *
 * No wall-clock race (T-20-39): the seed is 5 km out, about 14 s of sim time,
 * so Continue, the baselines and the held Space happen long before the contact.
 * A named pre-death checkpoint asserts it: if the run-up were lost, the test
 * fails as a checkpoint, never as a guard failure. Every wait reads a probe
 * field; no pixel is read and no wall time is asserted.
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

/** The URL: the hook, traffic on, the real-time clock (no manual clock). */
const GUARD_URL = "/?test=1&traffic=1";

/**
 * The Node twin's pins (tests/app/session/death-twin.test.ts, plan 20-09): the
 * death tick relative to the restored tick and the cause with its culprit.
 * Never edit these to make the browser pass: a difference is a divergence to
 * report.
 */
const TWIN_DEATH_TICK_OFFSET = 1682;
const TWIN_DEATH_CAUSE = { damage: "scrape", culprit: "buoy" };
/** The sim ticks per simulated second. */
const TICKS_PER_SECOND = 120;

/** A correctness bound for a probe wait (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** Animation frames the dead page must run with every key and event applied. */
const DEAD_FRAMES = 30;
/** The seed: the production writer's blob, a damaged item and a target. */
const SEED = inFlightSaveAt(
  "Lave",
  DEATH_RAM_POSE,
  DEATH_TARGET,
  DEATH_SEED_ITEMS,
);

/**
 * The real-time run to the death, as an expression of the twin's sim time: the
 * ram is `TWIN_DEATH_TICK_OFFSET / TICKS_PER_SECOND` simulated seconds out, and
 * the loop runs at least one tenth of real time on the slowest runner (it steps
 * up to five fixed ticks per frame; SwiftShader frames are slow, not that slow).
 */
const DEATH_WAIT_MS = (TWIN_DEATH_TICK_OFFSET / TICKS_PER_SECOND) * 1000 * 10;
/**
 * The non-launch budget of the test: no launch is played (the test starts in
 * flight from a seeded save), so it is three page loads, the real-time run to
 * the death, the dead page's keys and a final reload. Measured on the remote
 * machine: 20.7 s, so 3 x that (the CI slowdown) is 62 s, 19 % of the 320 s
 * this evaluates to, below the 60 % rule of
 * .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md.
 */
const NON_LAUNCH_BUDGET_MS = 3 * SLOW + DEATH_WAIT_MS + 3 * SLOW;
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

/** The probe fields the guard compares, read in one evaluate. */
interface GuardSnapshot {
  readonly alive: unknown;
  readonly mode: string | undefined;
  readonly paused: boolean | undefined;
  readonly chartOpen: boolean | undefined;
  readonly saveScreenOpen: boolean | undefined;
  readonly countdown: number | undefined;
  readonly lastRefusal: unknown;
  readonly tick: number | undefined;
  readonly writes: number | undefined;
  readonly tainted: boolean | undefined;
  readonly frames: number | undefined;
}

async function guardSnapshot(page: Page): Promise<GuardSnapshot> {
  return page.evaluate(() => {
    const probe = window.__wegolite;
    return {
      alive: Reflect.get(window, "__guardMarker") as unknown,
      mode: probe?.mode,
      paused: probe?.paused,
      chartOpen: probe?.chart?.open,
      saveScreenOpen: probe?.saveScreen?.open,
      countdown: probe?.hyperspace?.countdown,
      lastRefusal: probe?.hyperspace?.lastRefusal ?? null,
      tick: probe?.sim?.tick,
      writes: probe?.save?.writes,
      tainted: probe?.test?.tainted,
      frames: probe?.frames,
    };
  });
}

/** Wait until `count` animation frames have run inside the page. */
async function animationFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = (): void => {
          seen += 1;
          if (seen >= frames) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

test("in an untainted session nothing after the death saves, pauses, reopens or revives the dead player", async ({
  page,
}) => {
  const errors = collectErrors(page);

  // Seed and Continue. No hook call from here to the end: only reads.
  await page.goto(GUARD_URL);
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
  await page.evaluate(() => {
    Reflect.set(window, "__guardMarker", "alive");
  });

  // The baselines right after Continue: untainted, in flight, nothing counting.
  const baseline = await guardSnapshot(page);
  expect(baseline, "the baselines after Continue").toMatchObject({
    alive: "alive",
    mode: "inFlight",
    paused: false,
    chartOpen: false,
    saveScreenOpen: false,
    countdown: 0,
    lastRefusal: null,
    tainted: false,
  });
  const writesBaseline = baseline.writes;

  // Space is pressed and held in flight (no flight action uses it); its
  // auto-repeat after the death must not end the view (D-07).
  await page.keyboard.down("Space");

  // The pre-death checkpoint: the restored pose and speed equal the seed's, the
  // session is untainted and still in flight, and the tick is below the twin's
  // death tick. A miss here is a lost run-up, never a guard failure.
  const checkpoint = await page.evaluate(() => ({
    restore: window.__wegolite?.restore,
    tainted: window.__wegolite?.test?.tainted,
    mode: window.__wegolite?.mode,
    tick: window.__wegolite?.sim?.tick,
  }));
  expect(
    {
      restore: {
        position: checkpoint.restore?.position,
        orientation: checkpoint.restore?.orientation,
        speed: checkpoint.restore?.speed,
      },
      tainted: checkpoint.tainted,
      mode: checkpoint.mode,
      belowTwinTick:
        checkpoint.tick !== undefined &&
        checkpoint.tick < TWIN_DEATH_TICK_OFFSET,
    },
    "PRE-DEATH CHECKPOINT: the seed is restored, untainted, in flight and short of the twin's death tick",
  ).toEqual({
    restore: {
      position: DEATH_RAM_POSE.position,
      orientation: DEATH_RAM_POSE.orientation,
      speed: DEATH_RAM_POSE.speed,
    },
    tainted: false,
    mode: "inFlight",
    belowTwinTick: true,
  });

  // The real-time frame loop flies the ram; the wait's timeout is an
  // expression of the twin's sim time.
  await page.waitForFunction(
    () => window.__wegolite?.mode === "dead",
    undefined,
    { timeout: DEATH_WAIT_MS },
  );
  const death = await page.evaluate(() => ({
    mode: window.__wegolite?.mode,
    tick: window.__wegolite?.sim?.tick,
    cause: window.__wegolite?.death?.cause,
  }));
  expect(death, "the real-time death at the twin's tick and cause").toEqual({
    mode: "dead",
    tick: TWIN_DEATH_TICK_OFFSET,
    cause: TWIN_DEATH_CAUSE,
  });
  const atDeath = await guardSnapshot(page);

  // After the death: the held Space's auto-repeat, H (the in-flight autosave
  // trigger: with the committed target a working H starts the countdown whose
  // arrival autosaves), F2, P, Escape, F5 (swallowed on the game-over view,
  // D-07), F6, a held flight key, a window blur and a hidden-tab
  // visibilitychange.
  await page.keyboard.down("Space");
  await page.keyboard.press("KeyH");
  await page.keyboard.press("F2");
  await page.keyboard.press("KeyP");
  await page.keyboard.press("Escape");
  await page.keyboard.press("F5");
  await page.keyboard.press("F6");
  await page.keyboard.down("KeyW");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await animationFrames(page, DEAD_FRAMES);
  await page.keyboard.up("KeyW");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });

  // One snapshot after all the keys and events: the page did not reload (the
  // marker survived), the player is still dead, nothing paused, opened,
  // counted down or stepped, nothing was written and the session is untainted.
  const afterKeys = await guardSnapshot(page);
  expect(
    {
      alive: afterKeys.alive,
      mode: afterKeys.mode,
      paused: afterKeys.paused,
      chartOpen: afterKeys.chartOpen,
      saveScreenOpen: afterKeys.saveScreenOpen,
      countdown: afterKeys.countdown,
      lastRefusal: afterKeys.lastRefusal,
      tick: afterKeys.tick,
      writes: afterKeys.writes,
      tainted: afterKeys.tainted,
      framesRan: (afterKeys.frames ?? 0) - (atDeath.frames ?? 0) >= DEAD_FRAMES,
    },
    "the dead page after every key and event",
  ).toEqual({
    alive: "alive",
    mode: "dead",
    paused: false,
    chartOpen: false,
    saveScreenOpen: false,
    countdown: 0,
    lastRefusal: baseline.lastRefusal,
    tick: atDeath.tick,
    writes: writesBaseline,
    tainted: false,
    framesRan: true,
  });
  // A save of the dead player would change the stored blob.
  expect(await readRaw(page), "the stored blob after the keys").toBe(SEED);

  // A fresh Space (released, then pressed again) reloads the page (D-07, D-12);
  // a write on the way out of an untainted session would show in the blob.
  await page.keyboard.up("Space");
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () =>
      Reflect.get(window, "__guardMarker") === undefined &&
      window.__wegolite?.ready === true,
    undefined,
    { timeout: SLOW },
  );
  await expect(page.locator("#title-continue")).toBeVisible({ timeout: SLOW });
  expect(await readRaw(page), "the stored blob after the reload").toBe(SEED);
  expect(errors).toEqual([]);
});
