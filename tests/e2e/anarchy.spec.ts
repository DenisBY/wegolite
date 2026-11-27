// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The full-anarchy draw-call spike (plan 21-16; D-05, QUAL-09 staged, DATA-18).
 *
 * The NPC layer costs one draw call per (model, primitive) present, and the
 * 29-record catalogue carries about 55 primitives, so a scene with every hull at
 * once can pass the 50-call budget (RESEARCH 8.1 estimates about 73). This spec
 * measures it: it spawns one inert ship of every catalogue key around the player
 * (`test.spawnTestAnarchy()`), waits until every one of the 29 models has arrived
 * and drawn, reads `probe.calls` and `probe.triangles`, then runs a fight (the
 * player's lasers on the `?test=1` cargo shooter) and reads both again with the
 * kill's debris and explosion live.
 *
 * The four counts are attached to the report and printed, and compared with
 * the shared budgets of `helpers/budgets.ts` (plan 21-19): both triangle counts
 * must be within `TRIANGLE_BUDGET` (250,000; no authorisation covers a triangle
 * raise), and both call counts within `DRAW_CALL_BUDGET` (50, kept by D-05
 * after fix (1); raised to 80 by the owner on 2026-11-27, ROADMAP D14). `docs/PERFORMANCE.md`
 * "Full-anarchy draw-call spike" records them.
 *
 * Readiness is by key, never a fixed sleep: every catalogue key's GLB and the
 * textures it references (the NPC-owned ones) must have finished downloading,
 * and then the draw-call count must hold still across consecutive settled reads
 * (the manual clock freezes the sim, so only a model arriving can move it). The
 * spec asserts at least one call per key (29), the proof that every key's model
 * is drawn. Every wait timeout is a correctness bound, never an assertion; no
 * millisecond is measured (SwiftShader's speed says nothing about a player's GPU).
 *
 * The URL is the traffic opt-in of `traffic.spec.ts` (`?test=1&traffic=1&
 * clock=manual`); the hook members exist only under `?test=1` and taint the
 * session, so nothing here can be saved.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  DRAW_CALL_BUDGET,
  TRIANGLE_BUDGET,
  withinBudget,
} from "./helpers/budgets.js";
import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** The bound on the whole catalogue download, a correctness bound. */
const DOWNLOAD_BOUND = 240_000;
/** The URL this spec boots: traffic on, manual clock (opt-in by URL only). */
const ANARCHY_URL = "/?test=1&traffic=1&clock=manual";
/** The launch handover is 240 ticks (two seconds); this is comfortably past it. */
const LAUNCH_TICKS = 300;
/** Cargo capsules the shooter carries, as the combat spec's debris twin (D16-09). */
const SHOOTER_CARGO = 20;
/**
 * The chunk of manual ticks the kill step advances between scanner reads. The
 * explosion lives 1.5 s of flight time (180 ticks), so the read at the kill's
 * chunk end plus `AFTER_KILL_TICKS` is at most 90 ticks into it.
 */
const KILL_CHUNK_TICKS = 30;
/** A correctness bound for the kill step (the kill lands near 700 ticks). */
const KILL_BOUND_TICKS = 2_400;
/** Ticks after the kill at which the scene is read (the combat spec's 60). */
const AFTER_KILL_TICKS = 60;
/** Loop frames a settled read waits for, so the counters describe the scene. */
const SETTLE_FRAMES = 3;
/** Consecutive equal draw-call reads that count as settled. */
const STABLE_READS = 3;
/** The loop frames between two settle reads. */
const STABLE_READ_FRAMES = 10;

test.setTimeout(480_000);

/** One committed NPC record: the ship key and its model path. */
interface NpcRecord {
  readonly key: string;
  readonly glb: string;
}

/** The committed NPC records (src/content/generated/ships-npc.json). */
function npcRecords(): readonly NpcRecord[] {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "src", "content", "generated", "ships-npc.json"),
      "utf8",
    ),
  ) as readonly NpcRecord[];
}

/** The texture paths a GLB's own JSON chunk references (length at byte 12). */
function glbTextures(glbUrl: URL, file: string): readonly string[] {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as { readonly images?: readonly { readonly uri: string }[] };
  return (json.images ?? []).map(
    (image) => new URL(image.uri, glbUrl).pathname,
  );
}

/**
 * The URL paths of every texture the three first-load GLBs (the player's Cobra
 * Mk III, the Coriolis, the buoy) reference: shared by the Cobra variants, so
 * not NPC-owned. Copied from tests/e2e/traffic.spec.ts (module-private there).
 */
function firstLoadTexturePaths(): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const glb of ["cobra3.glb", "coriolis.glb", "buoy.glb"]) {
    const glbUrl = new URL(`/models/${glb}`, "http://localhost");
    for (const path of glbTextures(
      glbUrl,
      join(process.cwd(), "public", "models", glb),
    )) {
      paths.add(path);
    }
  }
  return paths;
}

/** The NPC-owned asset paths of one record: its GLB and its own textures. */
function recordAssets(
  record: NpcRecord,
  shared: ReadonlySet<string>,
): string[] {
  const glbUrl = new URL(`/${record.glb}`, "http://localhost");
  const textures = glbTextures(
    glbUrl,
    join(process.cwd(), "public", record.glb),
  );
  return [glbUrl.pathname, ...textures.filter((path) => !shared.has(path))];
}

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

/** The draw calls and triangles of the last rendered frame. */
async function drawCounters(
  page: Page,
): Promise<{ readonly calls: number; readonly triangles: number }> {
  return page.evaluate(() => ({
    calls: window.__wegolite?.calls ?? -1,
    triangles: window.__wegolite?.triangles ?? -1,
  }));
}

/**
 * The counters once the scene holds still: `STABLE_READS` consecutive reads,
 * `STABLE_READ_FRAMES` loop frames apart, agree on both counts. With the manual
 * clock only a model arriving (or a layer loading) can change them, so this is
 * the "every model has been built and drawn" wait, bounded by a timeout.
 */
async function settledCounters(
  page: Page,
): Promise<{ readonly calls: number; readonly triangles: number }> {
  let last = await drawCounters(page);
  let agreeing = 1;
  const deadline = Date.now() + DOWNLOAD_BOUND;
  while (agreeing < STABLE_READS && Date.now() < deadline) {
    await waitForFrames(page, STABLE_READ_FRAMES);
    const next = await drawCounters(page);
    agreeing =
      next.calls === last.calls && next.triangles === last.triangles
        ? agreeing + 1
        : 1;
    last = next;
  }
  expect(agreeing, "the draw counters settled").toBe(STABLE_READS);
  return last;
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

test("a full anarchy of the 29 hulls and a fight with its debris and explosion: draw calls and triangles measured", async ({
  page,
  baseURL,
}) => {
  const errors = collectErrors(page);
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
  const records = npcRecords();
  expect(records, "the catalogue (vacuity guard)").toHaveLength(29);
  expect(
    new Set(records.map((record) => record.key)).size,
    "distinct catalogue keys (vacuity guard)",
  ).toBe(29);
  const shared = firstLoadTexturePaths();
  const assetsByKey = new Map(
    records.map((record) => [record.key, recordAssets(record, shared)]),
  );
  const finished = new Set<string>();
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) finished.add(url.pathname);
  });

  await page.goto(ANARCHY_URL);
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "docked" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );

  // Launch and fly the scripted exit out, then park the ship so the geometry of
  // the ring and the shooter's line stays put.
  await page.click('button[data-action="launch"]');
  await waitForFrames(page, 1);
  await advance(page, 1);
  await advance(page, LAUNCH_TICKS);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: SLOW },
  );
  await page.evaluate(() => window.__wegolite?.test?.setSpeed(0));

  // 1. The anarchy: one inert ship of every key on a ring ahead of the player.
  // Since plan 22-14 the Lave is populated before the anarchy joins it; every
  // count below is relative to `entitiesBefore`, so none follows the population
  // (no re-pin), and the budgets are measured with the population present.
  const entitiesBefore = await page.evaluate(
    () => window.__wegolite?.sim?.entities ?? -1,
  );
  expect(
    await page.evaluate(() => window.__wegolite?.test?.spawnTestAnarchy()),
    "the hook spawned the anarchy",
  ).toBe(true);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.tainted),
    "the hook taints the session so nothing is saved",
  ).toBe(true);
  await waitForFrames(page, SETTLE_FRAMES);
  expect(
    await page.evaluate(() => window.__wegolite?.sim?.entities ?? -1),
    "the anarchy added one ship per key",
  ).toBe(entitiesBefore + records.length);

  // 2. Every key's model has arrived (by key, never a fixed sleep): its GLB and
  //    its own textures finished downloading, then the counters settled.
  await expect
    .poll(
      () =>
        records
          .filter((record) =>
            (assetsByKey.get(record.key) ?? []).some(
              (path) => !finished.has(path),
            ),
          )
          .map((record) => record.key),
      { timeout: DOWNLOAD_BOUND },
    )
    .toEqual([]);
  await waitForFrames(page, SETTLE_FRAMES);
  const worst = await settledCounters(page);
  expect(
    worst.calls,
    "at least one draw call per catalogue key: all 29 models are drawn",
  ).toBeGreaterThanOrEqual(records.length);
  expect(worst.triangles, "triangles with the anarchy drawn").toBeGreaterThan(
    0,
  );

  // 3. The fight: the cargo shooter 1,500 m ahead, the fire key held, until the
  //    scanner loses it. The ring clears the nose axis, so the anarchy never
  //    stands in the line of fire.
  await page.keyboard.down("KeyA");
  expect(
    await page.evaluate(
      (cargo) => window.__wegolite?.test?.spawnTestShooter(cargo),
      SHOOTER_CARGO,
    ),
    "the hook spawned the cargo shooter",
  ).toBe(true);
  await waitForFrames(page, SETTLE_FRAMES);
  const contactsWithShooter = await shipContacts(page);
  const entitiesWithShooter = await page.evaluate(
    () => window.__wegolite?.sim?.entities ?? -1,
  );
  let contacts = contactsWithShooter;
  let ticks = 0;
  while (contacts >= contactsWithShooter && ticks < KILL_BOUND_TICKS) {
    await advance(page, KILL_CHUNK_TICKS);
    ticks += KILL_CHUNK_TICKS;
    contacts = await shipContacts(page);
  }
  await page.keyboard.up("KeyA");
  expect(
    contacts,
    `the scanner lost the destroyed shooter within ${KILL_BOUND_TICKS} ticks`,
  ).toBeLessThan(contactsWithShooter);

  // 4. The kill's debris and explosion are live: step to the combat spec's
  //    kill + 60 ticks, let the pod, wreck and particle assets arrive, and read.
  await page.evaluate(
    (n) => window.__wegolite?.test?.advanceTicks(n),
    AFTER_KILL_TICKS,
  );
  await waitForFrames(page, SETTLE_FRAMES);
  const debrisEntities =
    (await page.evaluate(() => window.__wegolite?.sim?.entities ?? -1)) -
    (entitiesWithShooter - 1);
  expect(
    debrisEntities,
    "the kill left debris entities (pods, plate, wrecks) beside the anarchy",
  ).toBeGreaterThan(0);
  const particleTextures = [
    "/textures/oolite-particle-cloud2.png",
    "/textures/oolite-particle-flash.png",
  ];
  await expect
    .poll(() => particleTextures.filter((path) => !finished.has(path)), {
      timeout: SLOW,
    })
    .toEqual([]);
  await waitForFrames(page, SETTLE_FRAMES);
  const afterKill = await settledCounters(page);
  expect(
    afterKill.calls,
    "the debris and the explosion add draw calls to the anarchy",
  ).toBeGreaterThan(worst.calls);

  const report = {
    worstCaseCalls: worst.calls,
    worstCaseTriangles: worst.triangles,
    afterKillCalls: afterKill.calls,
    afterKillTriangles: afterKill.triangles,
    keys: records.length,
    debrisEntities,
  };
  test.info().annotations.push(
    {
      type: "anarchy-worst-case",
      description: `${worst.calls} calls, ${worst.triangles} triangles (29 keys drawn, before the kill)`,
    },
    {
      type: "anarchy-after-kill",
      description: `${afterKill.calls} calls, ${afterKill.triangles} triangles (debris and explosion live, kill + ${AFTER_KILL_TICKS} ticks)`,
    },
    {
      type: "anarchy-calls-within-budget",
      description: `worst case ${withinBudget(worst.calls, DRAW_CALL_BUDGET)}, after kill ${withinBudget(afterKill.calls, DRAW_CALL_BUDGET)} (budget ${DRAW_CALL_BUDGET})`,
    },
  );
  await test.info().attach("anarchy-counts", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  console.log(`anarchy-counts: ${JSON.stringify(report)}`);

  // The 21-18 deferral tripwire (orchestrator decision 2026-11-26): fix (2) of
  // D-05 is deferred because fix (1) put the anarchy within the budget, so a
  // call count above it brings todo 2026-11-26-npc-variant-family-instancing
  // back before any raise.
  expect(
    withinBudget(worst.calls, DRAW_CALL_BUDGET),
    `worst-case calls ${worst.calls} within the ${DRAW_CALL_BUDGET}-call budget`,
  ).toBe(true);
  expect(
    withinBudget(afterKill.calls, DRAW_CALL_BUDGET),
    `after-kill calls ${afterKill.calls} within the ${DRAW_CALL_BUDGET}-call budget`,
  ).toBe(true);
  expect(
    withinBudget(worst.triangles, TRIANGLE_BUDGET),
    `worst-case triangles ${worst.triangles} within the ${TRIANGLE_BUDGET} triangle budget`,
  ).toBe(true);
  expect(
    withinBudget(afterKill.triangles, TRIANGLE_BUDGET),
    `after-kill triangles ${afterKill.triangles} within the ${TRIANGLE_BUDGET} triangle budget`,
  ).toBe(true);

  expect(errors).toEqual([]);
});
