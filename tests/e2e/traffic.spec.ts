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
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { buildHudModel } from "../../src/app/hud-model.js";
import { hashFlight, initFlightState } from "../../src/sim/flight/state.js";
import { npcContacts } from "../../src/sim/world/contacts.js";
import { laveFixture } from "../helpers/lave.js";
import { runTickScript } from "../helpers/tick-script.js";
import {
  laveInertWorld,
  poseNearFirstShip,
} from "../helpers/traffic-fixture.js";
import { waitForReady } from "./helpers/probe.js";
import { inFlightSaveAt } from "./helpers/save-fixtures.js";
import { writeRaw } from "./helpers/save-store.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/**
 * The draw-call budget per rendered frame (the same limit as
 * tests/e2e/budget.spec.ts `DRAW_CALL_BUDGET`, unchanged).
 */
const DRAW_CALL_BUDGET = 50;
/** One MiB, the rounding unit of the first-load ceiling. */
const MIB = 1_048_576;
/**
 * The cold-start ceiling of tests/e2e/budget.spec.ts, unchanged by the owner
 * decision of 2026-11-14 (option A): the same 9 MiB, now measured with traffic on.
 */
const FIRST_LOAD_BYTES_CEILING = 9 * MIB;
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

/** One same-origin fetch as the page saw it: the path and the session mode at the call. */
interface FetchStamp {
  readonly path: string;
  readonly mode: string;
}

test("a traffic-on cold start requests no NPC model before the first in-flight frame, stays under the first-load ceiling and loads the present models within a fixed frame window", async ({
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
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) requested.push(url.pathname);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) failed.push(url.pathname);
  });
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) return;
    finished.push({
      path: url.pathname,
      bytes: request.sizes().then((sizes) => sizes.responseBodySize),
    });
  });

  const npc = npcAssetPaths();
  const npcPaths = new Set([...npc.glbs, ...npc.textures]);
  expect(npc.glbs, "NPC GLB paths (vacuity guard)").toHaveLength(9);
  expect(npc.textures, "NPC texture paths (vacuity guard)").toHaveLength(43);

  await bootDocked(page, TRAFFIC_URL);
  expect(
    await page.evaluate(() => window.__wegolite?.sim?.traffic),
    "traffic is on",
  ).toBe(true);

  // Launch frames: the ships exist, the session is launching, and the request
  // log holds no NPC GLB or texture across many real loop frames.
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
    requested.filter((path) => npcPaths.has(path)),
    "NPC paths requested during the launch frames",
  ).toEqual([]);

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

  // Bytes to the first in-flight frame, the same measure as budget.spec.ts,
  // excluding the NPC paths (none may be requested before this frame; any
  // requested after it are not part of the cold start).
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

  // Models on demand: exactly the present keys' GLBs were requested.
  const requestedGlbs = [
    ...new Set(requested.filter((path) => npc.glbs.includes(path))),
  ].sort();
  expect(requestedGlbs, "NPC GLBs requested").toEqual(presentGlbs);
  const finishedPaths = new Set(finished.map((entry) => entry.path));
  for (const path of [...presentGlbs, ...presentTextures]) {
    expect(finishedPaths.has(path), `finished: ${path}`).toBe(true);
  }
  expect(
    failed.filter((path) => npcPaths.has(path)),
    "failed NPC requests",
  ).toEqual([]);

  // Ordering: every NPC request in the Playwright log has a page-side stamp,
  // and every such stamp reads inFlight (none before the first in-flight frame).
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
    stampedNpc.filter((stamp) => stamp.mode !== "inFlight"),
    "NPC requests made before the first in-flight frame",
  ).toEqual([]);

  const loadedCalls = await page.evaluate(() => window.__wegolite?.calls ?? -1);
  test.info().annotations.push(
    {
      type: "traffic-npc-requests",
      description: `${requestedGlbs.length} GLBs, ${presentTextures.length} textures`,
    },
    {
      type: "traffic-cold-start-calls",
      description: `${firstInFlight.calls} calls at the first in-flight frame, ${loadedCalls} after the window`,
    },
  );
  expect(loadedCalls, "draw calls after the models load").toBeGreaterThan(
    firstInFlight.calls,
  );
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
