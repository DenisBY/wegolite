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
 *
 * Plan 21-11 (D-07): with traffic on, the NPC hull GLBs of every catalogue record
 * are prefetched in the background from the first docked frame, at most
 * `NPC_PREFETCH_CONCURRENCY` requests at a time. That download sits outside the
 * first-load ceiling (the ceiling is measured on the transfer to the first
 * in-flight frame minus the bytes of the NPC asset set, identified by path), and
 * the "no NPC asset before the first in-flight frame" rule of plans 12-11 and
 * 16-09 became "no NPC asset before the prefetch trigger" for traffic on; it is
 * unchanged for traffic off (tests/e2e/budget.spec.ts).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { buildHudModel } from "../../src/app/hud-model.js";
import { NPC_PREFETCH_CONCURRENCY } from "../../src/app/npc-models.js";
import { hashFlight, initFlightState } from "../../src/sim/flight/state.js";
import { npcContacts } from "../../src/sim/world/contacts.js";
import { laveFixture } from "../helpers/lave.js";
import { runTickScript } from "../helpers/tick-script.js";
import {
  laveInertWorld,
  poseNearFirstShip,
} from "../helpers/traffic-fixture.js";
// The draw-call budget and the cold-start ceiling are the shared ones; the
// ceiling is unchanged by the owner decision of 2026-11-14 (option A): the same
// 9 MiB, measured here with traffic on.
import {
  DRAW_CALL_BUDGET,
  FIRST_LOAD_BYTES_CEILING,
} from "./helpers/budgets.js";
import { waitForReady } from "./helpers/probe.js";
import { inFlightSaveAt } from "./helpers/save-fixtures.js";
import { writeRaw } from "./helpers/save-store.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/**
 * The window, in loop frames (`probe.frames`) counted from the first in-flight
 * frame, within which the NPC models of the present keys and their textures
 * must have been requested and finished. At least 10 s at the 60 Hz
 * animation-frame cap, and chosen to absorb the slow SwiftShader loop and the
 * owner's slow host. The wait's timeout is a correctness bound, never an
 * assertion.
 */
const MODEL_LOAD_WINDOW_FRAMES = 600;
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

interface NpcAssetPaths {
  /** The nine GLB paths, sorted. */
  readonly glbs: readonly string[];
  /** Every texture path any GLB references, sorted. */
  readonly textures: readonly string[];
  /** Each GLB path to the texture paths its own JSON chunk references. */
  readonly texturesOf: ReadonlyMap<string, readonly string[]>;
}

/**
 * The URL paths of every NPC GLB and every texture those GLBs reference, from
 * the compiled records and each GLB's own JSON chunk (length at byte 12, text
 * from byte 20); image URIs resolve against the GLB's own path. Copied from
 * tests/e2e/budget.spec.ts `npcAssetPaths` (module-private there), extended to
 * keep each GLB's own texture paths.
 */
function npcAssetPaths(): NpcAssetPaths {
  const root = process.cwd();
  const glbs = new Set<string>();
  const textures = new Set<string>();
  const texturesOf = new Map<string, readonly string[]>();
  for (const record of npcRecords()) {
    const glbUrl = new URL(`/${record.glb}`, "http://localhost");
    glbs.add(glbUrl.pathname);
    const bytes = readFileSync(join(root, "public", record.glb));
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(
      bytes.subarray(20, 20 + jsonLength).toString("utf8"),
    ) as { readonly images?: readonly { readonly uri: string }[] };
    const own = (json.images ?? []).map(
      (image) => new URL(image.uri, glbUrl).pathname,
    );
    for (const path of own) textures.add(path);
    texturesOf.set(glbUrl.pathname, [...new Set(own)].sort());
  }
  return {
    glbs: [...glbs].sort(),
    textures: [...textures].sort(),
    texturesOf,
  };
}

/**
 * The URL paths of every texture the three first-load GLBs reference (the
 * player's Cobra Mk III, the Coriolis and the navigation buoy), read from each
 * GLB's JSON chunk. Plan 21-08: the Cobra Mk III NPC variants (`cobra3-trader`
 * and the like) and the Mamba, Moray and Viper variants reuse maps the player's
 * Cobra already loads, so those paths are first-load assets, not NPC-owned ones.
 */
function firstLoadTexturePaths(): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const glb of ["cobra3.glb", "coriolis.glb", "buoy.glb"]) {
    const glbUrl = new URL(`/models/${glb}`, "http://localhost");
    const bytes = readFileSync(join(process.cwd(), "public", "models", glb));
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(
      bytes.subarray(20, 20 + jsonLength).toString("utf8"),
    ) as { readonly images?: readonly { readonly uri: string }[] };
    for (const image of json.images ?? []) {
      paths.add(new URL(image.uri, glbUrl).pathname);
    }
  }
  return paths;
}

/**
 * The debris model paths (`ships-debris.json`), every texture those GLBs
 * reference, and the two explosion particle textures (the cloud texture of
 * `explosions.json` and Oolite's flash, `/textures/oolite-particle-flash.png`):
 * the assets a kill makes the page request (Phase 16, plan 16-09). A cold
 * start has no kill, so it must request none of them.
 */
function killAssetPaths(): {
  readonly glbs: readonly string[];
  readonly textures: readonly string[];
  readonly particles: readonly string[];
} {
  const root = process.cwd();
  const records = JSON.parse(
    readFileSync(
      join(root, "src", "content", "generated", "ships-debris.json"),
      "utf8",
    ),
  ) as readonly { readonly glb: string }[];
  const glbs = new Set<string>();
  const textures = new Set<string>();
  for (const record of records) {
    const glbUrl = new URL(`/${record.glb}`, "http://localhost");
    glbs.add(glbUrl.pathname);
    const bytes = readFileSync(join(root, "public", record.glb));
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(
      bytes.subarray(20, 20 + jsonLength).toString("utf8"),
    ) as { readonly images?: readonly { readonly uri: string }[] };
    for (const image of json.images ?? []) {
      textures.add(new URL(image.uri, glbUrl).pathname);
    }
  }
  const explosions = JSON.parse(
    readFileSync(
      join(root, "src", "content", "generated", "explosions.json"),
      "utf8",
    ),
  ) as readonly { readonly texture: string }[];
  const particles = new Set<string>(["/textures/oolite-particle-flash.png"]);
  for (const explosion of explosions) {
    particles.add(`/textures/${explosion.texture}`);
  }
  return {
    glbs: [...glbs].sort(),
    textures: [...textures].sort(),
    particles: [...particles].sort(),
  };
}

/** The lazy debris and explosion catalogue chunks (plan 16-06). */
const DEBRIS_CHUNK = /\/assets\/ships-debris-[^/]+\.js$/;
const EXPLOSIONS_CHUNK = /\/assets\/explosions-[^/]+\.js$/;

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
  // Plan 21-04: follows the compiled records (29 today), floor above 0.
  expect(npcGlbs.size, "NPC GLB paths (vacuity guard)").toBeGreaterThan(0);
  expect(npcGlbs.size, "NPC GLB paths (vacuity guard)").toBe(records.length);
  // Plan 21-11 (D-07): the prefetch starts the first records of the catalogue,
  // in catalogue order. While every GLB request is held none of them settles,
  // so the prefetch stays at its concurrency bound and no later key is queued.
  const prefetchGlbs = records
    .slice(0, NPC_PREFETCH_CONCURRENCY)
    .map((record) => glbPath(record))
    .sort();
  expect(prefetchGlbs.length, "prefetch GLBs (vacuity guard)").toBe(
    NPC_PREFETCH_CONCURRENCY,
  );

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
    // Plan 21-11 (D-07): the docked session prefetches in the background, and
    // the held requests keep it at NPC_PREFETCH_CONCURRENCY GLBs.
    await expect
      .poll(() => [...new Set(requested)].sort(), { timeout: SLOW })
      .toEqual(prefetchGlbs);
    await page.click('button[data-action="launch"]');
    // One frame after the click, so the launch command is queued before stepping.
    await waitForFrames(page, 1);
    expect(
      await page.evaluate(() => window.__wegolite?.test?.advanceTicks(1)),
    ).toBe(1);
    await waitForFrames(page, 10);

    // The 12 ships exist from the launch tick, but the session is still
    // launching, so the only NPC models requested are the prefetch's first
    // ones, held (plan 12-11, plan 21-11).
    const launching = await page.evaluate(() => ({
      mode: window.__wegolite?.mode,
      entities: window.__wegolite?.sim?.entities,
    }));
    expect(launching.mode).toBe("launching");
    expect(launching.entities).toBe(12);
    expect(
      [...new Set(requested)].sort(),
      "NPC GLBs requested while launching (the held prefetch only)",
    ).toEqual(prefetchGlbs);

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

    // Models on demand: after the first in-flight frame the GLBs of the keys
    // present in the replay world are requested as well (and stay held), beside
    // the prefetch's held ones.
    const heldGlbs = [...new Set([...prefetchGlbs, ...expectedGlbs])].sort();
    await expect
      .poll(() => [...new Set(requested)].sort(), { timeout: SLOW })
      .toEqual(heldGlbs);

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

    // Release the models and wait until every held request has finished and
    // the prefetch has drained: every catalogue GLB is downloaded (D-07).
    release();
    await expect
      .poll(() => [...new Set(finished)].sort(), { timeout: 240_000 })
      .toEqual([...npcGlbs].sort());
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

/** One same-origin fetch as the page saw it: the path and the session mode at the call. */
interface FetchStamp {
  readonly path: string;
  readonly mode: string;
}

test("a traffic-on cold start requests no NPC model before the prefetch trigger, stays under the first-load ceiling without the prefetch and downloads the whole catalogue in the background", async ({
  page,
  baseURL,
}) => {
  const errors = collectErrors(page);
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;

  // The ordering proof is made in the page: every same-origin fetch records its
  // path and the session mode at the moment of the call. three's GLTFLoader
  // fetches GLBs (FileLoader) and, in Chromium, images (ImageBitmapLoader)
  // through `fetch`; the Playwright request log below is the complete list, and
  // the test requires every NPC path in it to carry a stamp, so a request made
  // some other way fails the test instead of passing unseen.
  await page.addInitScript(() => {
    const stamps: { path: string; mode: string }[] = [];
    Object.assign(window, { __npcFetchStamps: stamps });
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try {
        const raw =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const url = new URL(raw, window.location.href);
        if (url.origin === window.location.origin) {
          stamps.push({
            path: url.pathname,
            mode: String(window.__wegolite?.mode),
          });
        }
      } catch {
        // Recording must never block the page's own request.
      }
      return original(input, init);
    };
  });

  const requested: string[] = [];
  const failed: string[] = [];
  const finished: { readonly path: string; readonly bytes: Promise<number> }[] =
    [];
  // Plan 21-11: the request and finish events of one page in arrival order, with
  // the wall-clock time of each, so the prefetch trigger can be placed after the
  // first-load assets and the prefetch's duration can be recorded.
  const events: {
    readonly kind: "request" | "finished";
    readonly path: string;
    readonly at: number;
  }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) {
      requested.push(url.pathname);
      events.push({ kind: "request", path: url.pathname, at: Date.now() });
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) failed.push(url.pathname);
  });
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) return;
    events.push({ kind: "finished", path: url.pathname, at: Date.now() });
    finished.push({
      path: url.pathname,
      bytes: request.sizes().then((sizes) => sizes.responseBodySize),
    });
  });

  const npc = npcAssetPaths();
  // A texture the first-load models (the player's Cobra, the Coriolis, the buoy)
  // already reference is not NPC-owned: the Cobra variants share its maps.
  const firstLoadTextures = firstLoadTexturePaths();
  const npcPaths = new Set(
    [...npc.glbs, ...npc.textures].filter(
      (path) => !firstLoadTextures.has(path),
    ),
  );
  // Plan 21-04: the counts follow the catalogue (29 GLBs today), with a floor:
  // some GLB, and at least one texture per GLB.
  expect(npc.glbs.length, "NPC GLB paths (vacuity guard)").toBeGreaterThan(0);
  expect(npc.glbs, "NPC GLB paths (vacuity guard)").toHaveLength(
    npcRecords().length,
  );
  expect(
    npc.textures.length,
    "NPC texture paths (vacuity guard)",
  ).toBeGreaterThanOrEqual(npc.glbs.length);
  const kill = killAssetPaths();
  const killPaths = new Set([
    ...kill.glbs,
    ...kill.textures,
    ...kill.particles,
  ]);
  expect(kill.glbs, "debris GLB paths (vacuity guard)").toHaveLength(7);
  expect(kill.textures, "debris texture paths (vacuity guard)").toHaveLength(6);
  expect(kill.particles, "particle texture paths (vacuity guard)").toEqual([
    "/textures/oolite-particle-cloud2.png",
    "/textures/oolite-particle-flash.png",
  ]);

  await bootDocked(page, TRAFFIC_URL);
  expect(
    await page.evaluate(() => window.__wegolite?.sim?.traffic),
    "traffic is on",
  ).toBe(true);

  // Plan 21-11 (D-07): the docked session has started the background prefetch.
  await expect
    .poll(() => requested.some((path) => npcPaths.has(path)), {
      timeout: SLOW,
    })
    .toBe(true);

  // Launch frames: the ships exist and the session is launching while the
  // prefetch runs on across many real loop frames.
  await page.click('button[data-action="launch"]');
  await waitForFrames(page, 1);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.advanceTicks(1)),
  ).toBe(1);
  await waitForFrames(page, 30);
  const launching = await page.evaluate(() => ({
    mode: window.__wegolite?.mode,
    entities: window.__wegolite?.sim?.entities,
  }));
  expect(launching.mode).toBe("launching");
  expect(launching.entities).toBe(12);

  expect(
    await page.evaluate(() => window.__wegolite?.test?.advanceTicks(600)),
  ).toBe(601);
  // The first in-flight frame: read in the page, in the first animation frame
  // that sees the published mode, so `calls` is the in-flight base with no NPC
  // model drawn (a model fetched in that frame cannot also be loaded and drawn
  // in it).
  const firstInFlightRead = await (
    await page.waitForFunction(
      () => {
        const probe = window.__wegolite;
        return probe?.mode === "inFlight"
          ? { frames: probe.frames, calls: probe.calls }
          : false;
      },
      undefined,
      { timeout: SLOW },
    )
  ).jsonValue();
  if (firstInFlightRead === false) {
    throw new Error("the first in-flight frame was not observed");
  }
  const firstInFlight = firstInFlightRead;

  // Plan 21-11 (D-07): no NPC asset is requested before the prefetch trigger,
  // the first docked frame with traffic content. That frame draws the scene, so
  // the first-load models (the player's Cobra, the Coriolis, the buoy) and the
  // hull chunk were requested before it: no NPC request precedes any of them.
  const firstNpcRequest = events.findIndex(
    (event) => event.kind === "request" && npcPaths.has(event.path),
  );
  expect(firstNpcRequest, "the prefetch trigger was observed").toBeGreaterThan(
    -1,
  );
  for (const glb of ["cobra3.glb", "coriolis.glb", "buoy.glb"]) {
    const index = events.findIndex(
      (event) =>
        event.kind === "request" && event.path.endsWith(`/models/${glb}`),
    );
    expect(index, `first-load model requested: ${glb}`).toBeGreaterThan(-1);
    expect(
      index,
      `${glb} is requested before the first NPC asset (the prefetch trigger)`,
    ).toBeLessThan(firstNpcRequest);
  }
  const hullChunk = events.findIndex(
    (event) =>
      event.kind === "request" &&
      /\/assets\/ships-hulls-[^/]+\.js$/.test(event.path),
  );
  expect(hullChunk, "the hull chunk was requested").toBeGreaterThan(-1);
  expect(
    hullChunk,
    "the hull chunk is requested before the first NPC asset",
  ).toBeLessThan(firstNpcRequest);

  // Bytes to the first in-flight frame, the same measure as budget.spec.ts,
  // minus the bytes of the NPC asset set, identified by path: the background
  // prefetch is outside the ceiling (D-07), whether or not it has finished.
  const coldStart = finished.filter((entry) => !npcPaths.has(entry.path));
  const total = (
    await Promise.all(coldStart.map((entry) => entry.bytes))
  ).reduce((sum, bytes) => sum + bytes, 0);
  test.info().annotations.push({
    type: "first-load-bytes-traffic-on",
    description: `${total} bytes (ceiling ${FIRST_LOAD_BYTES_CEILING})`,
  });
  expect(
    requested.some((path) => path.endsWith("/models/cobra3.glb")),
    "the request log is live (the Cobra model was requested)",
  ).toBe(true);
  // The hull chunk (plan 13-11, D-01) loads with the NPC catalogue at boot with
  // traffic on, so the measured total includes it: the request log must show it.
  expect(
    requested.some((path) => /\/assets\/ships-hulls-[^/]+\.js$/.test(path)),
    "the lazy hull chunk was fetched at boot (counted in the cold start)",
  ).toBe(true);
  // Phase 16 (success criterion 4): the debris and explosion catalogues load
  // at boot with traffic on, inside the measured total, while no debris model,
  // debris texture or particle texture is requested before this frame.
  const chunkBytes = async (pattern: RegExp): Promise<number> =>
    (
      await Promise.all(
        coldStart
          .filter((entry) => pattern.test(entry.path))
          .map((entry) => entry.bytes),
      )
    ).reduce((sum, bytes) => sum + bytes, 0);
  expect(
    requested.some((path) => DEBRIS_CHUNK.test(path)),
    "the lazy debris chunk was fetched at boot (counted in the cold start)",
  ).toBe(true);
  expect(
    requested.some((path) => EXPLOSIONS_CHUNK.test(path)),
    "the lazy explosions chunk was fetched at boot (counted in the cold start)",
  ).toBe(true);
  test.info().annotations.push({
    type: "traffic-on-debris-chunks",
    description: `ships-debris ${await chunkBytes(DEBRIS_CHUNK)} bytes, explosions ${await chunkBytes(EXPLOSIONS_CHUNK)} bytes`,
  });
  expect(
    requested.filter((path) => killPaths.has(path)),
    "debris models, debris textures and particle textures (oolite-particle-*) requested before the first in-flight frame",
  ).toEqual([]);
  expect(total, "first-load bytes (traffic on)").toBeGreaterThan(0);
  expect(total, "first-load bytes ceiling (traffic on)").toBeLessThanOrEqual(
    FIRST_LOAD_BYTES_CEILING,
  );

  // The window: loop frames counted from the first in-flight observation.
  await page.waitForFunction(
    (target) => (window.__wegolite?.frames ?? 0) >= target,
    firstInFlight.frames + MODEL_LOAD_WINDOW_FRAMES,
    { timeout: 240_000 },
  );
  // Plan 21-11 (D-07): the prefetch downloads every catalogue GLB and the
  // textures they reference, a long background transfer on a loaded loop; the
  // wait is a correctness bound, never an assertion on time.
  await expect
    .poll(
      () => {
        const done = new Set(finished.map((entry) => entry.path));
        return [...npcPaths].filter((path) => !done.has(path));
      },
      { timeout: 240_000 },
    )
    .toEqual([]);

  const replay = runTickScript(LAUNCH_AND_FLY, { traffic: true });
  const glbByKey = new Map(npcRecords().map((r) => [r.key, glbPath(r)]));
  const presentGlbs = [
    ...new Set(
      npcContacts(replay.world).map((contact) => glbByKey.get(contact.specKey)),
    ),
  ]
    .filter((path): path is string => path !== undefined)
    .sort();
  expect(presentGlbs.length, "GLBs of the present keys").toBeGreaterThan(0);
  const presentTextures = [
    ...new Set(presentGlbs.flatMap((glb) => npc.texturesOf.get(glb) ?? [])),
  ].sort();
  expect(
    presentTextures.length,
    "textures of the present GLBs (vacuity guard)",
  ).toBeGreaterThan(0);

  // The prefetch: every catalogue GLB was requested once (a key the flight
  // also asked for is not fetched twice), and the present keys' GLBs and
  // textures finished.
  const requestedGlbs = [
    ...new Set(requested.filter((path) => npc.glbs.includes(path))),
  ].sort();
  expect(requestedGlbs, "NPC GLBs requested").toEqual([...npc.glbs].sort());
  for (const glb of npc.glbs) {
    expect(
      requested.filter((path) => path === glb),
      `${glb} requested once`,
    ).toHaveLength(1);
  }
  const finishedPaths = new Set(finished.map((entry) => entry.path));
  for (const path of [...presentGlbs, ...presentTextures]) {
    expect(finishedPaths.has(path), `finished: ${path}`).toBe(true);
  }
  // The prefetch's volume and duration, measured on the NPC asset set.
  const npcFinished = finished.filter((entry) => npcPaths.has(entry.path));
  const prefetchBytes = (
    await Promise.all(npcFinished.map((entry) => entry.bytes))
  ).reduce((sum, bytes) => sum + bytes, 0);
  const npcEvents = events.filter((event) => npcPaths.has(event.path));
  const prefetchMs =
    Math.max(...npcEvents.map((event) => event.at)) -
    Math.min(...npcEvents.map((event) => event.at));
  expect(
    failed.filter((path) => npcPaths.has(path)),
    "failed NPC requests",
  ).toEqual([]);

  // Ordering: every NPC request in the Playwright log has a page-side stamp,
  // and the first stamp is the prefetch trigger, made from a docked frame (the
  // probe's mode lags the frame by one, so it still reads menu then).
  const stamps = await page.evaluate(
    () =>
      (window as unknown as { __npcFetchStamps: FetchStamp[] })
        .__npcFetchStamps,
  );
  const stampedNpc = stamps.filter((stamp) => npcPaths.has(stamp.path));
  const requestedNpc = [
    ...new Set(requested.filter((path) => npcPaths.has(path))),
  ];
  for (const path of requestedNpc) {
    expect(
      stampedNpc.some((stamp) => stamp.path === path),
      `a page-side fetch stamp exists for ${path}`,
    ).toBe(true);
  }
  expect(
    ["menu", "docked"],
    "the prefetch trigger's session mode (plan 21-11)",
  ).toContain(stampedNpc[0]?.mode);

  const loadedCalls = await page.evaluate(() => window.__wegolite?.calls ?? -1);
  test.info().annotations.push(
    {
      type: "traffic-npc-requests",
      description: `${requestedGlbs.length} GLBs, ${npcFinished.length - requestedGlbs.length} texture responses`,
    },
    {
      type: "traffic-prefetch",
      description: `${prefetchBytes} bytes in ${prefetchMs} ms (concurrency ${NPC_PREFETCH_CONCURRENCY})`,
    },
    {
      type: "traffic-cold-start-calls",
      description: `${firstInFlight.calls} calls at the first in-flight frame, ${loadedCalls} after the window`,
    },
  );
  // Plan 21-11: the prefetched models may already be drawn at the first
  // in-flight read, so the count is not compared with it any more (the held
  // test above proves a loaded model is drawn on arrival).
  expect(loadedCalls, "draw calls after the models load").toBeGreaterThan(0);
  expect(loadedCalls, "draw-call budget").toBeLessThanOrEqual(DRAW_CALL_BUDGET);
  expect(errors).toEqual([]);
});

test("a reload next to a regenerated ship shows it on the scanner", async ({
  page,
}) => {
  const errors = collectErrors(page);

  // The pose lies 5 km from the first ship of the regenerated Lave world
  // (epoch 0, as a cold Continue restores it), so the scanner check is never
  // vacuous: a world whose ships were all out of range would pass "every
  // contact is visible" for no reason. The same pose drives the Node count.
  const pose = poseNearFirstShip(0, 5_000);
  const { layout, config } = laveFixture();
  const model = buildHudModel(
    {
      ...initFlightState(layout),
      mode: "inFlight" as const,
      position: pose.position,
      orientation: pose.orientation,
      speed: pose.speed,
    },
    layout,
    config,
    "",
    70,
    0,
    "",
    npcContacts(laveInertWorld(0)),
  );
  const expectedShips = model.contacts.filter(
    (contact) => contact.visible && contact.id === "ship",
  ).length;
  expect(
    expectedShips,
    "the Node scanner count (vacuity guard)",
  ).toBeGreaterThan(0);

  await page.goto(TRAFFIC_URL);
  await waitForReady(page);
  await writeRaw(
    page,
    inFlightSaveAt("Lave", {
      position: [pose.position.x, pose.position.y, pose.position.z],
      orientation: [
        pose.orientation.w,
        pose.orientation.x,
        pose.orientation.y,
        pose.orientation.z,
      ],
      speed: pose.speed,
    }),
  );
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible({
    timeout: SLOW,
  });
  await page.click("#title-continue");
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "inFlight" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );
  // The save never holds a ship: the reload regenerates the inert world, whose
  // id counter (113) differs from the fixture's (101), and the load succeeds
  // (SAVE-08 mismatch policy).
  await page.evaluate(() => window.__wegolite?.test?.advanceTicks(1));
  await waitForFrames(page, 2);
  const browser = await page.evaluate(() => ({
    entities: window.__wegolite?.sim?.entities,
    traffic: window.__wegolite?.sim?.traffic,
    ships: (window.__wegolite?.hud.contacts ?? []).filter((id) => id === "ship")
      .length,
  }));
  expect(browser.traffic).toBe(true);
  expect(browser.entities).toBe(12);
  expect(browser.ships, "ship contacts on the scanner").toBe(expectedShips);
  expect(errors).toEqual([]);
});
