// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one opt-in traffic browser spec of Phase 12 (plan 12-12; WORLD-15,
 * WORLD-16, SAVE-08, DATA-13).
 *
 * The browser-test bundle defaults NPC traffic off (Key Decisions row "Browser
 * test builds default traffic off"), so every plain browser spec runs an empty
 * world. This spec is the only browser measurement of a populated scene and of
 * the traffic-on cold start; it opts in by URL (`?test=1&traffic=1&clock=manual`)
 * and runs unchanged against the browser-test bundle and the production bundle.
 * `verify-full` runs it in the full Chromium suite (it is not part of `verify`).
 *
 * Every assertion counts (entities, contacts, draw calls, requests, bytes,
 * loop frames); none measures milliseconds, because SwiftShader's speed says
 * nothing about a player's GPU (PITFALLS 11 and 28). Every wait timeout below is
 * a correctness bound, never an assertion. The probe shape is frozen: this spec
 * adds no probe key.
 */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { hashFlight } from "../../src/sim/flight/state.js";
import { npcContacts } from "../../src/sim/world/contacts.js";
import { runTickScript } from "../helpers/tick-script.js";
import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/**
 * The draw-call budget per rendered frame (the same limit as
 * tests/e2e/budget.spec.ts `DRAW_CALL_BUDGET`, unchanged).
 */
const DRAW_CALL_BUDGET = 50;
/** The URL every test here boots: traffic on, manual clock (opt-in by URL only). */
const TRAFFIC_URL = "/?test=1&traffic=1&clock=manual";

test.setTimeout(360_000);

// Copied from tests/e2e/tick-hook.spec.ts (module-private there; a spec module
// is never imported, which would register its tests a second time).

/** Wait until the session loop has run at least `count` more frames. */
async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__wegolite?.frames ?? 0);
  await page.waitForFunction(
    (target) => (window.__wegolite?.frames ?? 0) >= target,
    start + count,
    { timeout: SLOW },
  );
}

/** Start a New game at `url` and wait for the docked session to publish `sim`. */
async function bootDocked(page: Page, url: string): Promise<void> {
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
}

/** One committed NPC record: the ship key and its model path. */
interface NpcRecord {
  readonly key: string;
  readonly glb: string;
}

/** The nine committed NPC records (src/content/generated/ships-npc.json). */
function npcRecords(): readonly NpcRecord[] {
  return JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as readonly NpcRecord[];
}

/** The URL path of a record's GLB, as the browser requests it. */
function glbPath(record: NpcRecord): string {
  return new URL(`/${record.glb}`, "http://localhost").pathname;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** The launch-and-600-ticks script every populated replay here compares to. */
const LAUNCH_AND_FLY = [
  { commands: [{ kind: "launch" as const }], ticks: 1 },
  { commands: [], ticks: 600 },
];

test("a launch populates the world, draws the ships within budget and matches the Node replay", async ({
  page,
  baseURL,
}) => {
  const errors = collectErrors(page);
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
  const records = npcRecords();
  const glbByKey = new Map(records.map((r) => [r.key, glbPath(r)]));
  const npcGlbs = new Set(glbByKey.values());
  expect(npcGlbs.size, "NPC GLB paths (vacuity guard)").toBe(9);

  // Hold every NPC GLB request until released, so the "models held" counts are
  // read with no NPC model drawn. The release sits in a `finally` (T-12-34).
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.origin === origin && npcGlbs.has(url.pathname),
    async (route) => {
      await released;
      try {
        await route.continue();
      } catch {
        // The page closed while the request was held (a failing run).
      }
    },
  );
  const requested: string[] = [];
  const finished: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin && npcGlbs.has(url.pathname))
      requested.push(url.pathname);
  });
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin && npcGlbs.has(url.pathname))
      finished.push(url.pathname);
  });

  try {
    await bootDocked(page, TRAFFIC_URL);
    await page.click('button[data-action="launch"]');
    // One frame after the click, so the launch command is queued before stepping.
    await waitForFrames(page, 1);
    expect(
      await page.evaluate(() => window.__wegolite?.test?.advanceTicks(1)),
    ).toBe(1);
    await waitForFrames(page, 10);

    // The 12 ships exist from the launch tick, but the session is still
    // launching, so no NPC model has been requested (plan 12-11).
    const launching = await page.evaluate(() => ({
      mode: window.__wegolite?.mode,
      entities: window.__wegolite?.sim?.entities,
    }));
    expect(launching.mode).toBe("launching");
    expect(launching.entities).toBe(12);
    expect(requested, "NPC GLBs requested while launching").toEqual([]);

    expect(
      await page.evaluate(() => window.__wegolite?.test?.advanceTicks(600)),
    ).toBe(601);
    await page.waitForFunction(() => window.__wegolite?.mode === "inFlight", {
      timeout: SLOW,
    });
    await waitForFrames(page, 10);

    const replay = runTickScript(LAUNCH_AND_FLY, { traffic: true });
    const present = new Set(
      npcContacts(replay.world).map((contact) => contact.specKey),
    );
    const expectedGlbs = [...present]
      .map((key) => glbByKey.get(key))
      .filter((path): path is string => path !== undefined)
      .sort();
    expect(expectedGlbs.length, "ship keys present (vacuity guard)").toBe(
      present.size,
    );
    expect(expectedGlbs.length).toBeGreaterThan(0);

    // Models on demand: after the first in-flight frame exactly the GLBs of the
    // keys present in the replay world are requested (and stay held).
    await expect
      .poll(() => [...new Set(requested)].sort(), { timeout: SLOW })
      .toEqual(expectedGlbs);

    const held = await page.evaluate(() => {
      const probe = window.__wegolite;
      return {
        tick: probe?.sim?.tick,
        mode: probe?.mode,
        traffic: probe?.sim?.traffic,
        entities: probe?.sim?.entities,
        hash: probe?.test?.worldHash(),
        calls: probe?.calls ?? -1,
        triangles: probe?.triangles ?? -1,
        ships: (probe?.hud.contacts ?? []).filter((id) => id === "ship").length,
      };
    });
    expect(held.mode).toBe("inFlight");
    expect(held.traffic).toBe(true);
    expect(held.entities).toBe(12);
    expect(held.tick).toBe(replay.state.tick);
    expect(held.hash).toBe(replay.hash);
    // A populated world hashes differently from its flight state alone, so the
    // browser and Node cannot agree on the flight hash by accident.
    expect(replay.hash).not.toBe(hashFlight(replay.state));
    expect(held.calls, "draw calls with the models held").toBeGreaterThan(0);

    // Release the models and wait until every held request has finished.
    release();
    await expect
      .poll(() => [...new Set(finished)].sort(), { timeout: 240_000 })
      .toEqual(expectedGlbs);
    // The loaded models are drawn from the first frame that sees them; the wait
    // is a correctness bound, the assertion below is a count.
    await page.waitForFunction(
      (base) => (window.__wegolite?.calls ?? 0) > base,
      held.calls,
      { timeout: 240_000 },
    );
    await waitForFrames(page, 10);

    const loaded = await page.evaluate(() => {
      const probe = window.__wegolite;
      return {
        calls: probe?.calls ?? -1,
        triangles: probe?.triangles ?? -1,
        ships: (probe?.hud.contacts ?? []).filter((id) => id === "ship").length,
      };
    });
    test.info().annotations.push(
      {
        type: "traffic-calls-models-held",
        description: `${held.calls} calls, ${held.triangles} triangles`,
      },
      {
        type: "traffic-calls-models-loaded",
        description: `${loaded.calls} calls, ${loaded.triangles} triangles`,
      },
    );
    expect(loaded.calls, "draw calls with the models loaded").toBeGreaterThan(
      held.calls,
    );
    expect(loaded.calls, "draw-call budget").toBeLessThanOrEqual(
      DRAW_CALL_BUDGET,
    );
    // The scanner is fed by simulation data, not by models, and the manual
    // clock holds the pose: the count is the same with the models held and loaded.
    expect(loaded.ships, "scanner ship count, models loaded").toBe(held.ships);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
