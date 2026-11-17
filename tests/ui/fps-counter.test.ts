// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Settings "Show FPS counter" readout (quick task 261117-fpp).
 *
 * The meter is pure arithmetic over the frame loop's `now` timestamps, and the
 * counter only touches `hidden` and `textContent`, so a plain object with a
 * write-counting accessor stands in for the `<span id="fps">` element in Node.
 */

import { describe, expect, it } from "vitest";

import {
  FPS_MAX_GAP_MS,
  FPS_PLACEHOLDER,
  FPS_WINDOW_MS,
  createFpsCounter,
  createFpsMeter,
  formatFps,
} from "../../src/ui/fps-counter.js";
import type { FpsElement } from "../../src/ui/fps-counter.js";

interface RecordingElement extends FpsElement {
  readonly writes: () => number;
}

function recordingElement(): RecordingElement {
  let text = "";
  let writes = 0;
  return {
    hidden: false,
    get textContent(): string {
      return text;
    },
    set textContent(value: string | null) {
      writes += 1;
      text = value ?? "";
    },
    writes: () => writes,
  };
}

/** Tick `meter` every `stepMs` from `from` through `to` inclusive. */
function ticks(
  tick: (now: number) => unknown,
  from: number,
  to: number,
  stepMs: number,
): unknown[] {
  const results: unknown[] = [];
  for (let now = from; now <= to + 1e-9; now += stepMs) results.push(tick(now));
  return results;
}

describe("createFpsMeter", () => {
  it("uses a 500 ms window and a 1000 ms gap limit by default", () => {
    expect(FPS_WINDOW_MS).toBe(500);
    expect(FPS_MAX_GAP_MS).toBe(1000);
  });

  it("returns null until a full window has elapsed, then the frame rate", () => {
    const meter = createFpsMeter();
    expect(meter.tick(0)).toBeNull();
    for (let now = 20; now < 500; now += 20) expect(meter.tick(now)).toBeNull();
    expect(meter.tick(500)).toBe(50);
  });

  it("restarts the window at the readout frame", () => {
    const meter = createFpsMeter();
    ticks((now) => meter.tick(now), 0, 500, 20);
    // The next window starts at 500, so 10 ms frames read 100 at 1000.
    for (let now = 510; now < 1000; now += 10) {
      expect(meter.tick(now)).toBeNull();
    }
    expect(meter.tick(1000)).toBe(100);
  });

  it("reads 100 for 10 ms frames and about 60 for 60 Hz frames", () => {
    const fast = createFpsMeter();
    const fastResults = ticks((now) => fast.tick(now), 0, 500, 10);
    expect(fastResults.at(-1)).toBe(100);

    const sixty = createFpsMeter();
    let reading: number | null = null;
    for (let frame = 0; reading === null; frame += 1) {
      reading = sixty.tick((frame * 1000) / 60);
    }
    expect(reading).toBeCloseTo(60);
  });

  it("restarts the window after a gap over the limit", () => {
    const meter = createFpsMeter();
    expect(meter.tick(0)).toBeNull();
    expect(meter.tick(20)).toBeNull();
    expect(meter.tick(5000)).toBeNull();
    // Only frames after 5000 count: 25 intervals of 20 ms.
    for (let now = 5020; now < 5500; now += 20) {
      expect(meter.tick(now)).toBeNull();
    }
    expect(meter.tick(5500)).toBe(50);
  });

  it("restarts the window when the timestamp goes backwards", () => {
    const meter = createFpsMeter();
    ticks((now) => meter.tick(now), 0, 400, 20);
    expect(meter.tick(100)).toBeNull();
    for (let now = 120; now < 600; now += 20) {
      expect(meter.tick(now)).toBeNull();
    }
    expect(meter.tick(600)).toBe(50);
  });

  it("reset() makes the next tick start a fresh window", () => {
    const meter = createFpsMeter();
    ticks((now) => meter.tick(now), 0, 480, 20);
    meter.reset();
    expect(meter.tick(500)).toBeNull();
    for (let now = 520; now < 1000; now += 20) {
      expect(meter.tick(now)).toBeNull();
    }
    expect(meter.tick(1000)).toBe(50);
  });
});

describe("formatFps", () => {
  it("rounds to a whole number after the FPS label", () => {
    expect(formatFps(59.6)).toBe("FPS: 60");
    expect(formatFps(0.4)).toBe("FPS: 0");
    expect(formatFps(144)).toBe("FPS: 144");
  });
});

describe("createFpsCounter", () => {
  it("starts hidden and disabled, and never writes text while disabled", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    expect(element.hidden).toBe(true);
    expect(counter.isEnabled()).toBe(false);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      2000,
      10,
    );
    expect(element.writes()).toBe(0);
    expect(element.hidden).toBe(true);
  });

  it("shows the placeholder when enabled, then the measured rate", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    counter.setEnabled(true);
    expect(counter.isEnabled()).toBe(true);
    expect(element.hidden).toBe(false);
    expect(element.textContent).toBe(FPS_PLACEHOLDER);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      500,
      20,
    );
    expect(element.textContent).toBe("FPS: 50");
  });

  it("writes at most once per window, not once per frame", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    counter.setEnabled(true);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      2000,
      10,
    );
    // 200 frames: the placeholder plus at most one write per 500 ms window.
    expect(element.writes()).toBeLessThanOrEqual(5);
    expect(element.textContent).toBe("FPS: 100");
  });

  it("does not rewrite an unchanged rounded value", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    counter.setEnabled(true);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      500,
      10,
    );
    const afterFirst = element.writes();
    expect(afterFirst).toBe(2);
    ticks(
      (now) => {
        counter.frame(now);
      },
      510,
      2000,
      10,
    );
    expect(element.writes()).toBe(afterFirst);
  });

  it("setEnabled(false) hides at once and stops writes", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    counter.setEnabled(true);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      500,
      20,
    );
    counter.setEnabled(false);
    counter.setEnabled(false);
    expect(element.hidden).toBe(true);
    expect(counter.isEnabled()).toBe(false);
    const writes = element.writes();
    ticks(
      (now) => {
        counter.frame(now);
      },
      520,
      2000,
      10,
    );
    expect(element.writes()).toBe(writes);
  });

  it("re-enabling restarts the window, so frames from before do not count", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    counter.setEnabled(true);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      300,
      20,
    );
    counter.setEnabled(false);
    counter.setEnabled(true);
    expect(element.textContent).toBe(FPS_PLACEHOLDER);
    // Without the restart the window from t=0 would close at 500.
    ticks(
      (now) => {
        counter.frame(now);
      },
      400,
      890,
      10,
    );
    expect(element.textContent).toBe(FPS_PLACEHOLDER);
    counter.frame(900);
    expect(element.textContent).toBe("FPS: 100");
  });

  it("setEnabled(true) twice does not reset a running window", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    counter.setEnabled(true);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      480,
      20,
    );
    counter.setEnabled(true);
    expect(element.writes()).toBe(1);
    counter.frame(500);
    expect(element.textContent).toBe("FPS: 50");
  });

  it("dispose() hides, clears the text and silences later frames", () => {
    const element = recordingElement();
    const counter = createFpsCounter(element);
    counter.setEnabled(true);
    ticks(
      (now) => {
        counter.frame(now);
      },
      0,
      500,
      20,
    );
    counter.dispose();
    expect(element.hidden).toBe(true);
    expect(element.textContent).toBe("");
    expect(counter.isEnabled()).toBe(false);
    const writes = element.writes();
    ticks(
      (now) => {
        counter.frame(now);
      },
      520,
      2000,
      10,
    );
    expect(element.writes()).toBe(writes);
  });
});
