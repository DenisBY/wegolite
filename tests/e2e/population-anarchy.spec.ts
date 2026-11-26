// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * QUAL-09 on the real populator (plan 22-15; WORLD-08 success criterion 5, Phase
 * 21 D-05).
 *
 * `anarchy.spec.ts` measured a synthetic anarchy (one inert ship of every
 * catalogue key, spawned by the test hook). This spec boots the anarchy the
 * initial-population census found in galaxy 0 (`specSystems` of
 * `tests/golden/world/population-census.json`, plan 22-12) through the
 * production path: a docked save at that system is written with `writeRaw`,
 * Continue loads it, and the launch builds the world through
 * `createSystemPopulate` (plan 22-14). No hook spawns anything: the ships are the
 * populator's, as a player meets them.
 *
 * The system is chosen by ships and by distinct hull keys, because the two costs
 * scale differently (`threejs-performance`): the renderer draws one instanced
 * call per hull key and primitive, so calls follow the distinct keys, while an
 * instanced mesh is not frustum culled, so every instance's triangles count and
 * triangles follow the ships. The census names the galaxy-0 anarchy with the
 * most ships and the one with the most keys; when they are one system this spec
 * runs it once, when they differ it runs both.
 *
 * Node equals browser: after the launch the spec asserts the system, the world
 * epoch and the populated entity count equal the census golden's numbers. The
 * probe does not expose entity hull keys (the scanner contacts are just "ship"),
 * so the realised key set is the Node world's own (`censusWorld`, the production
 * path the golden was recorded with), its size is asserted equal to the golden's
 * `keys`, and the browser proves every one of those keys is drawn by the draw
 * calls (at least one per key) once each key's model and textures have arrived.
 *
 * Both counts are read through `withinBudget` (inclusive, zero fails) and only
 * after rendered frames (`renderer.info` resets at each `render()`): settled
 * reads, the counters holding across consecutive reads once every realised key's
 * GLB and NPC textures have finished downloading. A blank or stale frame cannot
 * pass. They are read before the fight and again 60 ticks after a kill, with the
 * explosion, pods, plates and wrecks live (the player's lasers on the `?test=1`
 * cargo shooter, as `anarchy.spec.ts` does).
 *
 * The 21-18 tripwire (Phase 21 D-05): the budget stays 50 calls while plan 21-18
 * (variant-family instancing) is deferred. A read above 50 brings todo
 * 2026-11-26-npc-variant-family-instancing back; it never raises the budget,
 * lowers traffic or culls ships. Readiness is by key, never a fixed sleep; every
 * wait timeout is a correctness bound and no millisecond is measured. The URL is
 * the traffic opt-in (`?test=1&traffic=1&clock=manual`); the hook taints the
 * session, so nothing is saved.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  censusSystems,
  censusWorld,
  catalogueHullTriangles,
} from "../helpers/population-census.js";
import type { SpecSystem, SpecSystems } from "../helpers/population-census.js";
import {
  DRAW_CALL_BUDGET,
  TRIANGLE_BUDGET,
  withinBudget,
} from "./helpers/budgets.js";
import { waitForReady } from "./helpers/probe.js";
import { dockedSaveAt } from "./helpers/save-fixtures.js";
import { writeRaw } from "./helpers/save-store.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** The bound on the realised hulls' download, a correctness bound. */
const DOWNLOAD_BOUND = 240_000;
/** The URL this spec boots: traffic on, manual clock (opt-in by URL only). */
const POPULATION_URL = "/?test=1&traffic=1&clock=manual";
/** The launch handover is 240 ticks (two seconds); this is comfortably past it. */
const LAUNCH_TICKS = 300;
/** Loop frames a settled read waits for, so the counters describe the scene. */
const SETTLE_FRAMES = 3;
/** Consecutive equal reads that count as settled. */
const STABLE_READS = 3;
/** The loop frames between two settle reads. */
const STABLE_READ_FRAMES = 10;
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

test.setTimeout(480_000);

/** The census golden's `specSystems` (plan 22-12). */
function specSystems(): SpecSystems {
  const golden = JSON.parse(
    readFileSync(
      join(process.cwd(), "tests", "golden", "world", "population-census.json"),
      "utf8",
    ),
  ) as { readonly specSystems: SpecSystems };
  return golden.specSystems;
}

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
 * not NPC-owned. Copied from tests/e2e/anarchy.spec.ts (module-private there).
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

/** What Node says the populated world holds: the realised hull keys and triangles. */
interface NodeWorld {
  readonly ships: number;
  readonly keys: readonly string[];
  readonly triangles: number;
}

/** The production-path world of the spec system at its recorded epoch (Node). */
function nodeWorld(spec: SpecSystem): NodeWorld {
  const entry = censusSystems(1).find(
    (candidate) => candidate.system.id === spec.id,
  );
  if (entry === undefined) throw new Error(`${spec.id} is not in galaxy 0`);
  const { world, row } = censusWorld(entry, spec.epoch);
  const keys = [
    ...new Set(world.store.live.map((ship) => ship.specKey)),
  ].sort();
  const hulls = catalogueHullTriangles();
  const triangles = world.store.live.reduce(
    (sum, ship) => sum + (hulls.get(ship.specKey) ?? 0),
    0,
  );
  // The golden's own row, recomputed: the browser is compared with numbers the
  // two sides agree on before it is compared with the page.
  expect([row.ships, row.keys, row.triangles]).toEqual([
    spec.ships,
    spec.keys,
    spec.triangles,
  ]);
  return { ships: world.store.live.length, keys, triangles };
}

/** The census systems this spec runs: the largest anarchy and, if different, the most-keys one. */
function systemsToRun(): readonly SpecSystem[] {
  const { largestAnarchy, mostKeysAnarchy } = specSystems();
  return largestAnarchy.id === mostKeysAnarchy.id
    ? [largestAnarchy]
    : [largestAnarchy, mostKeysAnarchy];
}

for (const spec of systemsToRun()) {
  test(`the populated galaxy-0 anarchy ${spec.name} (${spec.id}, epoch ${String(spec.epoch)}, ${String(spec.ships)} ships, ${String(spec.keys)} hull keys) draws within the call and triangle budgets`, async ({
    page,
    baseURL,
  }) => {
    const errors = collectErrors(page);
    const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
    const node = nodeWorld(spec);
    expect(
      node.keys,
      "the Node world's distinct keys equal the golden",
    ).toHaveLength(spec.keys);
    const records = npcRecords();
    const shared = firstLoadTexturePaths();
    const realised = records.filter((record) => node.keys.includes(record.key));
    expect(realised, "every realised key is a catalogue record").toHaveLength(
      node.keys.length,
    );
    const assetsByKey = new Map(
      realised.map((record) => [record.key, recordAssets(record, shared)]),
    );
    const finished = new Set<string>();
    page.on("requestfinished", (request) => {
      const url = new URL(request.url());
      if (url.origin === origin) finished.add(url.pathname);
    });

    // 1. Boot the census system the way a player does: a saved docked game at
    //    that system, Continue, launch. The hook is only the manual clock.
    await page.goto(POPULATION_URL);
    await waitForReady(page);
    await writeRaw(page, dockedSaveAt(spec.name));
    await page.reload();
    await waitForReady(page);
    await expect(page.locator("#title-continue")).toBeVisible({
      timeout: SLOW,
    });
    await page.click("#title-continue");
    await page.waitForFunction(
      () =>
        window.__wegolite?.mode === "docked" &&
        window.__wegolite.sim !== undefined,
      undefined,
      { timeout: SLOW },
    );
    expect(
      await page.evaluate(() => window.__wegolite?.systemId),
      "the saved system booted",
    ).toBe(spec.id);

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
    await waitForFrames(page, SETTLE_FRAMES);

    // 2. Node equals browser: the epoch and the populated entity count are the
    //    census golden's.
    expect(
      await page.evaluate(() => window.__wegolite?.sim?.epoch),
      "the world epoch a docked-save launch builds",
    ).toBe(spec.epoch);
    expect(
      await page.evaluate(() => window.__wegolite?.sim?.entities ?? -1),
      "the populated entity count equals the census golden's ships",
    ).toBe(spec.ships);

    // 3. Every realised key's model has arrived (by key, never a fixed sleep):
    //    its GLB and its own textures finished downloading, then the counters
    //    settled after rendered frames.
    await expect
      .poll(
        () =>
          realised
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
    const before = await settledCounters(page);
    expect(
      before.calls,
      `at least one draw call per realised hull key: all ${String(spec.keys)} models are drawn`,
    ).toBeGreaterThanOrEqual(spec.keys);
    expect(
      before.triangles,
      "the realised ships' triangles are drawn on top of the scene",
    ).toBeGreaterThanOrEqual(node.triangles);

    // 4. The fight: the cargo shooter 1,500 m ahead, the fire key held, until
    //    the scanner loses it (one contact fewer: the populated ships stay).
    await page.keyboard.down("KeyA");
    expect(
      await page.evaluate(
        (cargo) => window.__wegolite?.test?.spawnTestShooter(cargo),
        SHOOTER_CARGO,
      ),
      "the hook spawned the cargo shooter",
    ).toBe(true);
    expect(
      await page.evaluate(() => window.__wegolite?.test?.tainted),
      "the hook taints the session so nothing is saved",
    ).toBe(true);
    await waitForFrames(page, SETTLE_FRAMES);
    const contactsWithShooter = await shipContacts(page);
    const entitiesWithShooter = await page.evaluate(
      () => window.__wegolite?.sim?.entities ?? -1,
    );
    expect(entitiesWithShooter, "the shooter joined the population").toBe(
      spec.ships + 1,
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
      `the scanner lost the destroyed shooter within ${String(KILL_BOUND_TICKS)} ticks`,
    ).toBeLessThan(contactsWithShooter);

    // 5. The kill's debris and explosion are live: step to the combat spec's
    //    kill + 60 ticks, let the particle assets arrive, and read again.
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
    ).toBeGreaterThan(before.calls);

    const report = {
      system: spec.id,
      name: spec.name,
      epoch: spec.epoch,
      ships: spec.ships,
      keys: spec.keys,
      npcTriangles: node.triangles,
      beforeCalls: before.calls,
      beforeTriangles: before.triangles,
      afterKillCalls: afterKill.calls,
      afterKillTriangles: afterKill.triangles,
      debrisEntities,
    };
    test.info().annotations.push(
      {
        type: "population-anarchy",
        description: `${spec.name} (${spec.id}) epoch ${String(spec.epoch)}: ${String(spec.ships)} ships, ${String(spec.keys)} keys`,
      },
      {
        type: "population-anarchy-before-kill",
        description: `${String(before.calls)} calls, ${String(before.triangles)} triangles`,
      },
      {
        type: "population-anarchy-after-kill",
        description: `${String(afterKill.calls)} calls, ${String(afterKill.triangles)} triangles (kill + ${String(AFTER_KILL_TICKS)} ticks)`,
      },
    );
    await test.info().attach("population-anarchy-counts", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log(`population-anarchy-counts: ${JSON.stringify(report)}`);

    // The 21-18 deferral tripwire (Phase 21 D-05): a call count above the
    // budget brings todo 2026-11-26-npc-variant-family-instancing back before
    // any raise; a triangle count above it has no authorisation at all.
    for (const [when, counters] of [
      ["before the kill", before],
      ["after the kill", afterKill],
    ] as const) {
      expect(
        withinBudget(counters.calls, DRAW_CALL_BUDGET),
        `${when}: calls ${String(counters.calls)} within the ${String(DRAW_CALL_BUDGET)}-call budget`,
      ).toBe(true);
      expect(
        withinBudget(counters.triangles, TRIANGLE_BUDGET),
        `${when}: triangles ${String(counters.triangles)} within the ${String(TRIANGLE_BUDGET)} triangle budget`,
      ).toBe(true);
    }

    expect(errors).toEqual([]);
  });
}
