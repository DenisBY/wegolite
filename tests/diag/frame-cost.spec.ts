// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The loaded per-frame render-cost diagnostic (quick task 261104-oif).
 *
 * This spec is NOT part of the default suite: it lives in `tests/diag`, which
 * `playwright.config.ts` (`testDir: "./tests/e2e"`) and `vitest.config.ts`
 * (which only includes `*.test.ts` files) never pick up. Run it explicitly:
 *
 *   DIAG_WORKERS=2 DIAG_ARM=A npx playwright test --config=playwright.diag.config.ts
 *
 * Each arm boots the app, clicks through the title screen to the docked panel,
 * reads the live WebGL2 context attributes, then installs a requestAnimationFrame
 * sampler and starts the first launch in the same `page.evaluate`. Sampling runs
 * through the launch cinematic into the cockpit until 40 in-flight frames have
 * been recorded (or a 120 s deadline), and the per-frame probe values are
 * written as JSON under `test-results/diag`.
 *
 * The only assertions are measurement-integrity assertions: the sampler must not
 * truncate, it must collect at least 40 in-flight frames, `probe.renders` must
 * advance once per frame, and the page must log no errors. There is deliberately
 * no target frame time: this harness measures, it does not gate.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForReady } from "../e2e/helpers/probe.js";

/** The single source edit for this arm is reported in the filename and JSON. */
const ARM = process.env["DIAG_ARM"] ?? "baseline";
const OUT_DIR = resolve(
  process.cwd(),
  process.env["DIAG_OUT_DIR"] ?? "test-results/diag",
);
const MIN_IN_FLIGHT_FRAMES = 40;
const SAMPLE_DEADLINE_MS = 120_000;
/** The message queue's drain in simulated seconds (baseline fact, 03-14). */
const DRAIN_SIM_SECONDS = 12.92;
/** Five 1/120 s steps per rendered frame: 24 frames per simulated second max. */
const FRAMES_PER_SIM_SECOND_CAP = 24;

interface FrameSample {
  /** `performance.now()` at the rAF callback. */
  t: number;
  mode: string;
  flightTime: number;
  renders: number;
  calls: number;
  triangles: number;
}

interface LaunchSampleResult {
  startedAt: number;
  endedAt: number;
  truncated: boolean;
  samples: FrameSample[];
}

interface GlReadout {
  /** DOM's `WebGLContextAttributes` marks every field optional; keep that. */
  contextAttributes: {
    alpha: boolean | undefined;
    antialias: boolean | undefined;
    depth: boolean | undefined;
    desynchronized: boolean | undefined;
    failIfMajorPerformanceCaveat: boolean | undefined;
    powerPreference: string | undefined;
    premultipliedAlpha: boolean | undefined;
    preserveDrawingBuffer: boolean | undefined;
    stencil: boolean | undefined;
  };
  samples: number;
  maxSamples: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  devicePixelRatio: number;
  cappedPixelRatio: number;
  unmaskedVendor: string | null;
  unmaskedRenderer: string | null;
}

interface FrameStats {
  frames: number;
  meanDeltaMs: number | null;
  medianDeltaMs: number | null;
  fps: number | null;
  firstT: number | null;
  lastT: number | null;
  firstFlightTime: number | null;
  lastFlightTime: number | null;
  simSeconds: number | null;
  simRate: number | null;
  framesPerSimSecond: number | null;
  /** 12.92 s of simulated time at the measured simRate. */
  impliedDrainSeconds: number | null;
  /** 12.92 s x 24 / fps: the plan's headline wall-time projection. */
  impliedDrainSecondsFromFps: number | null;
  /** simRate minus the max the 5-step cap allows (fps / 24). */
  loopCapDelta: number | null;
  meanCalls: number | null;
  meanTriangles: number | null;
  rendersAdvance: number | null;
}

function emptyStats(frames: number): FrameStats {
  return {
    frames,
    meanDeltaMs: null,
    medianDeltaMs: null,
    fps: null,
    firstT: null,
    lastT: null,
    firstFlightTime: null,
    lastFlightTime: null,
    simSeconds: null,
    simRate: null,
    framesPerSimSecond: null,
    impliedDrainSeconds: null,
    impliedDrainSecondsFromFps: null,
    loopCapDelta: null,
    meanCalls: null,
    meanTriangles: null,
    rendersAdvance: null,
  };
}

/**
 * Summarise one mode's samples. Deltas are computed between consecutive samples
 * **within** the mode, so a mode transition does not contribute one long frame.
 * Every derived value is null when the samples cannot support it; nothing is
 * extrapolated.
 */
function statsFor(samples: readonly FrameSample[]): FrameStats {
  const stats = emptyStats(samples.length);
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined || samples.length < 2) {
    return stats;
  }

  const deltas: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous !== undefined && current !== undefined) {
      deltas.push(current.t - previous.t);
    }
  }
  if (deltas.length === 0) {
    return stats;
  }

  const meanDelta =
    deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
  const sorted = [...deltas].sort((a, b) => a - b);
  const medianDelta = sorted[Math.floor(sorted.length / 2)] ?? meanDelta;
  const fps = 1000 / meanDelta;
  const simSeconds = last.flightTime - first.flightTime;
  const wallSeconds = (last.t - first.t) / 1000;
  const simRate = wallSeconds > 0 ? simSeconds / wallSeconds : null;
  const framesPerSimSecond =
    simSeconds > 0 ? samples.length / simSeconds : null;
  const meanCalls =
    samples.reduce((sum, sample) => sum + sample.calls, 0) / samples.length;
  const meanTriangles =
    samples.reduce((sum, sample) => sum + sample.triangles, 0) / samples.length;

  return {
    frames: samples.length,
    meanDeltaMs: meanDelta,
    medianDeltaMs: medianDelta,
    fps,
    firstT: first.t,
    lastT: last.t,
    firstFlightTime: first.flightTime,
    lastFlightTime: last.flightTime,
    simSeconds,
    simRate,
    framesPerSimSecond,
    impliedDrainSeconds:
      simRate !== null && simRate > 0 ? DRAIN_SIM_SECONDS / simRate : null,
    impliedDrainSecondsFromFps:
      (DRAIN_SIM_SECONDS * FRAMES_PER_SIM_SECOND_CAP) / fps,
    loopCapDelta:
      simRate === null ? null : simRate - fps / FRAMES_PER_SIM_SECOND_CAP,
    meanCalls,
    meanTriangles,
    rendersAdvance: last.renders - first.renders,
  };
}

/** Read the live GL environment once, from the canvas the app already owns. */
async function readGl(page: Page): Promise<GlReadout> {
  return page.evaluate(() => {
    const canvas = document.getElementById("view");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("DIAG: the #view canvas is missing");
    }
    const gl = canvas.getContext("webgl2");
    if (gl === null) {
      throw new Error("DIAG: the #view canvas has no WebGL2 context");
    }
    const attributes = gl.getContextAttributes();
    if (attributes === null) {
      throw new Error("DIAG: getContextAttributes() returned null");
    }
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      contextAttributes: {
        alpha: attributes.alpha,
        antialias: attributes.antialias,
        depth: attributes.depth,
        desynchronized: attributes.desynchronized,
        failIfMajorPerformanceCaveat: attributes.failIfMajorPerformanceCaveat,
        powerPreference: attributes.powerPreference,
        premultipliedAlpha: attributes.premultipliedAlpha,
        preserveDrawingBuffer: attributes.preserveDrawingBuffer,
        stencil: attributes.stencil,
      },
      samples: gl.getParameter(gl.SAMPLES) as number,
      maxSamples: gl.getParameter(gl.MAX_SAMPLES) as number,
      drawingBufferWidth: gl.drawingBufferWidth,
      drawingBufferHeight: gl.drawingBufferHeight,
      devicePixelRatio: window.devicePixelRatio,
      cappedPixelRatio: Math.min(window.devicePixelRatio, 2),
      unmaskedVendor:
        debugInfo === null
          ? null
          : (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string),
      unmaskedRenderer:
        debugInfo === null
          ? null
          : (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string),
    };
  });
}

/**
 * Install the frame sampler and start the launch in the SAME evaluate, so the
 * launching phase is sampled from its first frame. Resolves once at least 40
 * in-flight frames exist, or on the deadline (reported as `truncated`).
 */
async function sampleLaunch(page: Page): Promise<LaunchSampleResult> {
  return page.evaluate(
    ({ deadlineMs, minInFlight }) => {
      const launch = document.querySelector('button[data-action="launch"]');
      if (!(launch instanceof HTMLButtonElement)) {
        throw new Error('DIAG: button[data-action="launch"] is missing');
      }

      const samples: FrameSample[] = [];
      const startedAt = performance.now();

      return new Promise<LaunchSampleResult>((finish) => {
        const tick = (): void => {
          const probe = window.__wegolite;
          if (probe !== undefined) {
            samples.push({
              t: performance.now(),
              mode: probe.mode,
              flightTime: probe.flightTime,
              renders: probe.renders,
              calls: probe.calls,
              triangles: probe.triangles,
            });
            const inFlight = samples.filter(
              (sample) => sample.mode === "inFlight",
            ).length;
            if (inFlight >= minInFlight) {
              finish({
                startedAt,
                endedAt: performance.now(),
                truncated: false,
                samples,
              });
              return;
            }
          }
          if (performance.now() - startedAt >= deadlineMs) {
            finish({
              startedAt,
              endedAt: performance.now(),
              truncated: true,
              samples,
            });
            return;
          }
          requestAnimationFrame(tick);
        };

        launch.click();
        requestAnimationFrame(tick);
      });
    },
    { deadlineMs: SAMPLE_DEADLINE_MS, minInFlight: MIN_IN_FLIGHT_FRAMES },
  );
}

// Two pages: with DIAG_WORKERS=2 they run concurrently (the loaded arm); with
// DIAG_WORKERS=1 the same two tests run sequentially (the solo reference).
for (const label of ["page-1", "page-2"] as const) {
  test(`${ARM} ${label}: loaded per-frame render cost`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/");
    await waitForReady(page);
    await page.click("#title-start");
    await expect(page.locator("#docked")).toBeVisible();

    const gl = await readGl(page);
    const result = await sampleLaunch(page);

    const docked = result.samples.filter((sample) => sample.mode === "docked");
    const launching = result.samples.filter(
      (sample) => sample.mode === "launching",
    );
    const inFlight = result.samples.filter(
      (sample) => sample.mode === "inFlight",
    );

    const dockedStats = statsFor(docked);
    const launchedStats = statsFor(launching);
    const inFlightStats = statsFor(inFlight);

    expect(
      result.truncated,
      "the sampler reached its 120 s deadline before 40 in-flight frames",
    ).toBe(false);
    expect(inFlight.length).toBeGreaterThanOrEqual(MIN_IN_FLIGHT_FRAMES);
    expect(
      inFlightStats.rendersAdvance,
      "the probe must publish a render count for the in-flight window",
    ).not.toBeNull();
    expect(
      inFlightStats.rendersAdvance ?? Number.NEGATIVE_INFINITY,
      "probe.renders must advance once per rendered frame",
    ).toBeGreaterThanOrEqual(inFlight.length - 2);

    const record = {
      arm: ARM,
      label,
      workerIndex: testInfo.workerIndex,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      wallMs: result.endedAt - result.startedAt,
      gl,
      docked: dockedStats,
      launched: launchedStats,
      inFlight: inFlightStats,
      samples: result.samples,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    const file = resolve(
      OUT_DIR,
      `frame-cost-${ARM}-${label}-w${testInfo.workerIndex}-${Math.round(
        result.startedAt,
      )}.json`,
    );
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);

    // One log line with the headline numbers, no raw samples.
    console.log(
      `DIAG_RESULT ${JSON.stringify({
        arm: record.arm,
        label: record.label,
        workerIndex: record.workerIndex,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        wallMs: record.wallMs,
        gl: record.gl,
        docked: record.docked,
        launched: record.launched,
        inFlight: record.inFlight,
      })}`,
    );

    expect(errors, "console/page errors during the run").toEqual([]);
  });
}
