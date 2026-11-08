# Performance

This document records the frame budget Wegolite is held to, what the container measures against it, and the manual reference-desktop run that is the only evidence for a frame rate. It answers QUAL-01 and follows decisions D-10 to D-14 in `.planning/phases/07-hardening-community-release/07-CONTEXT.md`.

## Budget

Each rendered frame must stay inside these limits. Each row names the gate that enforces it.

| Quantity                      | Budget          | Source                                   | Enforced by                                                 |
| ----------------------------- | --------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Draw calls per rendered frame | at most 50      | STACK.md lines 442-443 (research target) | `tests/e2e/budget.spec.ts` (`DRAW_CALL_BUDGET`)             |
| Triangles per rendered frame  | at most 250 000 | STACK.md lines 442-443 (research target) | `tests/e2e/budget.spec.ts` (`TRIANGLE_BUDGET`)              |
| Planet noise evaluations      | at most 9       | `BUDGET_CEILING` (D-12, unchanged)       | `tests/render/planet-budget.test.ts` (`BUDGET_CEILING = 9`) |

Both draw-call and triangle comparisons are inclusive: 50 calls and 250 000 triangles pass, while 51 calls and 250 001 triangles fail. A scene that reports zero calls or zero triangles also fails, so a blank frame cannot pass the budget.

## Container measurements

These are the per-scene counts from the `budget.spec.ts` annotations, recorded on 2026-11-08 in the containerised build. They are SwiftShader counts of draw calls and triangles per rendered frame. They are not frame rates, and they say nothing about how fast a player's GPU renders these scenes.

| Scene          | Draw calls | Triangles | Recorded   |
| -------------- | ---------- | --------- | ---------- |
| Lave docked    | 9          | 38714     | 2026-11-08 |
| Lave launching | 8          | 3302      | 2026-11-08 |
| Lave in flight | 6          | 38308     | 2026-11-08 |
| Diso docked    | 9          | 38714     | 2026-11-08 |
| Diso in flight | 6          | 38308     | 2026-11-08 |

The Diso scenes are reached through an IndexedDB save fixture (`tests/e2e/helpers/save-fixtures.ts`) and the spec asserts the live `systemId` is Diso's before reading the counts. Their counts match Lave's because the docked and in-flight scenes have the same structure.

## Load size

The first-load test in `tests/e2e/budget.spec.ts` records the same-origin response body bytes of every request from a cold start (a fresh browser context, no cache) to the first in-flight frame.

| Measure                                          | Value                        |
| ------------------------------------------------ | ---------------------------- |
| Cold-start transfer to the first in-flight frame | 20 996 848 bytes (20.03 MiB) |
| Regression ceiling (`FIRST_LOAD_BYTES_CEILING`)  | 22 020 096 bytes (21 MiB)    |
| Entry chunk `dist/assets/index-BzvG01ob.js`, raw | 1 582 446 bytes              |
| Entry chunk, gzip at level 9                     | 311 972 bytes                |
| STACK.md target for initial JavaScript           | 250 KB gzip                  |

The ceiling is the measured transfer rounded up to the next MiB, so it is a regression ceiling and not a load budget. The entry chunk was measured inside the container on 2026-11-08 with `node:zlib` `gzipSync`.

The entry chunk is over the STACK.md target of 250 KB gzip. That finding is recorded here and is not gated or fixed. It is outside QUAL-01's draw-call and triangle budget, and D-14 defers load optimisation until a stated load budget fails.

## Reference-desktop protocol

This protocol produces QUAL-01's only frame-rate evidence (D-10b). The container renders on SwiftShader, so a frame rate taken there is not evidence and must not be recorded as one. Run this protocol on the reference desktop, never in Docker.

### Setup

1. Start the production preview from this commit with `docker compose up preview` (Docker only; no host Node), then open http://localhost:4173.
2. Use current stable Chrome and current stable Firefox on the owner's desktop.
3. Set the window client area to 1920x1080, with OS scaling and browser zoom at 100 %.
4. Close every other tab. Open the console and confirm `window.devicePixelRatio` prints `1` before measuring.
5. Record the machine: GPU and driver version, CPU, RAM, OS and version, browser and exact version, and monitor refresh rate. Enter these in the Machine block below.

### Scenarios and sampler

Each row is sampled for 30 seconds. The row labels are exact.

| Row label          | How to reach it                    | Sampling                                                                                                                  |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Lave docked        | New game, the docked panel at Lave | Settle 5 s, then sample 30 s                                                                                              |
| Launch sequence    | Press the launch key (`Digit1`)    | Start the sampler with start delay 0 and press the launch key as it starts, so the animation falls inside the 30 s window |
| Lave in flight     | After launch, facing the planet    | Settle 5 s, then sample 30 s                                                                                              |
| Hyperspace arrival | In flight after a completed jump   | Settle 5 s, then sample 30 s                                                                                              |

Paste this sampler into the console for each row. Set `START_DELAY_MS` to `5000` for the settled rows and to `0` for `Launch sequence`.

```javascript
(async () => {
  const START_DELAY_MS = 5000; // use 0 for the Launch sequence row
  const WINDOW_MS = 30000;
  const FLOOR_MS = 1000 / 24; // below 24 fps the fixed step runs slow (research Pitfall 2)
  await new Promise((resolve) => setTimeout(resolve, START_DELAY_MS));
  const intervals = [];
  await new Promise((resolve) => {
    let last;
    const started = performance.now();
    const tick = (now) => {
      if (last !== undefined) intervals.push(now - last);
      last = now;
      if (now - started < WINDOW_MS) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const sorted = intervals.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const pct = (p) =>
    sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))];
  const sharePercent = (limit) =>
    (100 * sorted.filter((ms) => ms > limit).length) / n;
  console.log(
    JSON.stringify({
      count: n,
      p50: pct(50),
      p95: pct(95),
      p99: pct(99),
      max: sorted[n - 1],
      shareAbove16_7Percent: sharePercent(16.7),
      shareAbove33_3Percent: sharePercent(33.3),
    }),
  );
  console.log(
    `simulation-rate note: share of frames slower than ${FLOOR_MS.toFixed(1)} ms (below 24 fps): ${sharePercent(FLOOR_MS).toFixed(2)} %`,
  );
})();
```

The percentiles are nearest-rank values from the sorted frame intervals. A mean is never recorded in place of them.

### Pass criterion

The criterion below is a proposal. The owner confirms it or replaces it at the Task 3 checkpoint, and the confirmed criterion is recorded with its date. Each scenario in each browser passes when:

- p95 is at or below 17.5 ms, and
- p99 is at or below 33.3 ms.

### Missed criterion (D-13)

If a scenario misses the criterion, measure further and record the result. Further measurement means repeating that scenario's 30 s sample twice, and recording one 10 s DevTools Performance capture with a note on whether the long frames are main-thread or GPU time. Antialiasing, the pixel ratio, the resolution and the planet shader are not changed without a new owner decision (D-12, D-13). A miss is answered by measurement, never by a change to the look.

### First load

Record the DevTools Network "Load" time of a cold start, with the cache disabled, on the reference desktop. The load-time budget is for the owner to state, and none is set here. Texture compression stays deferred unless that stated budget fails (D-14).

Cold-start Load time, cache disabled: not supplied by the owner, who skipped this measurement.

### Results

Status: measured 2026-11-08 on the machine below; criterion confirmed by the owner; first-load time not supplied (owner skipped).

| Scenario           | Browser | Count | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Share above 16.7 ms | Share above 33.3 ms | Pass |
| ------------------ | ------- | ----- | -------- | -------- | -------- | -------- | ------------------- | ------------------- | ---- |
| Lave docked        | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 18.20    | 21.61 %             | 0 %                 | pass |
| Lave docked        | Firefox | 1800  | 16.66    | 16.68    | 16.68    | 16.68    | 0 %                 | 0 %                 | pass |
| Launch sequence    | Chrome  | 1795  | 16.70    | 16.80    | 16.80    | 66.50    | 40.11 %             | 0.11 %              | pass |
| Launch sequence    | Firefox | 1798  | 16.66    | 16.68    | 16.68    | 50.00    | 0.11 %              | 0.11 %              | pass |
| Lave in flight     | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 18.10    | 39.28 %             | 0 %                 | pass |
| Lave in flight     | Firefox | 1790  | 16.66    | 16.68    | 16.68    | 183.32   | 0.06 %              | 0.06 %              | pass |
| Hyperspace arrival | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 16.90    | 50.89 %             | 0 %                 | pass |
| Hyperspace arrival | Firefox | 1798  | 16.66    | 16.68    | 16.68    | 33.34    | 0.11 %              | 0.11 %              | pass |

The four Firefox rows are the owner's readings, taken in Firefox 159.0.1 at 100 % display scaling and `devicePixelRatio` 1, with the Launch sequence sampled at start delay 0. The Pass column is judged against the proposed criterion (p95 at or below 17.5 ms and p99 at or below 33.3 ms). The owner confirmed that criterion on 2026-11-08, so the Pass column is confirmed. The max column is recorded as given and is not part of the criterion.

The simulation-rate note (share of frames slower than 41.7 ms, that is below 24 fps) was 0.00 %, 0.06 %, 0.06 % and 0.00 % for Lave docked, Launch sequence, Lave in flight and Hyperspace arrival respectively.

The four Chrome rows are the owner's readings, taken in Chrome 157.0.8103.39 at 100 % display scaling and `devicePixelRatio` 1, with the Launch sequence sampled at start delay 0. The Chrome version is the one recorded in the owner's machine record in `07-CONTEXT.md`; it was not separately verified in this run. The Pass column is confirmed, as for Firefox, by the owner's criterion confirmation on 2026-11-08.

The simulation-rate shares (frames slower than 41.7 ms, below 24 fps) were 0.00 %, 0.11 %, 0.00 % and 0.00 % for Lave docked, Launch sequence, Lave in flight and Hyperspace arrival respectively.

Chrome's share of frames above 16.7 ms is 21 to 51 % while p50 is 16.70 ms and p95 is 16.80 ms. The proposed criterion does not gate on the 16.7 ms share, so those rows pass the criterion, but the owner should decide whether the 16.7 ms share is acceptable. Firefox's share above 16.7 ms is 0 to 0.11 %. The criterion has not been changed.

### Preliminary runs (not official)

Recorded 2026-11-07, 20:48 to 21:00, from the owner's session 9675446a. These readings are informational only. They were taken at display scaling 175 % (`devicePixelRatio` 1.7647058823529411), not at 100 % scaling with a 1920x1080 client area (DPR 1), so they do not fill the Results rows above and are not evidence for QUAL-01. The official 1920x1080 DPR 1 run is still pending.

Machine: the owner's reference desktop named in `.planning/phases/07-hardening-community-release/07-CONTEXT.md` (open item, line 67). CPU Intel Core i5-13400F 2.50 GHz; RAM 32 GB; GPU NVIDIA GeForce RTX 4060 8 GB, driver 32.0.16.1088; OS Windows 10 Pro 22H2; display 3840x2160 at 60 Hz; Chrome 157.0.8103.39 and Firefox 159.0.1. The owner's pastes do not record which browser each reading came from.

Labelled readings, with the owner's label as written:

| Owner label                                                                        | Count | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Over 16.7 ms | Over 33.3 ms |
| ---------------------------------------------------------------------------------- | ----- | -------- | -------- | -------- | -------- | ------------ | ------------ |
| "в меню на станции" (station menu, docked)                                         | 1800  | 16.66    | 16.68    | 16.68    | 16.68    | 0.0%         | 0.0%         |
| "вылет со станции, лицом к планете" (launch out of the station, facing the planet) | 1797  | 16.66    | 16.68    | 16.68    | 33.34    | 0.2%         | 0.2%         |
| "lave in flight" (the owner notes it is not clearly different from the launch row) | 1800  | 16.66    | 16.68    | 16.68    | 16.68    | 0.0%         | 0.0%         |
| "прибытие к leetsi" (arrival at leetsi after a jump)                               | 1799  | 16.66    | 16.68    | 16.68    | 33.32    | 0.1%         | 0.1%         |

Unlabelled readings, with timing uncertain. The owner wrote that it is unclear when the sampler script was started, so these readings may be inaccurate. They are not assigned to any scenario, and fields the paste did not include are marked as not recorded.

| Reading | Count | p50 (ms)     | p95 (ms) | p99 (ms)     | max (ms) | Over 16.7 ms | Over 33.3 ms |
| ------- | ----- | ------------ | -------- | ------------ | -------- | ------------ | ------------ |
| A       | 1800  | not recorded | 16.68    | not recorded | 16.68    | not recorded | not recorded |
| B       | 1774  | not recorded | 16.68    | not recorded | 450      | 0.1%         | 0.1%         |

These readings are not evaluated against the proposed pass criterion. The official run at 1920x1080 and DPR 1, per the protocol above, is still required.

### Machine

The owner's desktop, from the reference machine named in `07-CONTEXT.md` line 67. The values below are for the Firefox and Chrome runs. Display scaling was 100 % and `devicePixelRatio` 1, per the owner. The preview was served from Docker on an Intel N150 host over the LAN, as the owner confirmed for this setup. That location is not otherwise recorded.

- GPU and driver version: NVIDIA GeForce RTX 4060 8 GB, driver 32.0.16.1088
- CPU: Intel Core i5-13400F 2.50 GHz
- RAM: 32 GB
- OS and version: Windows 10 Pro 22H2, build 19045.6466
- Browser and exact version (Chrome): Chrome 157.0.8103.39 (recorded from the owner's machine record in `07-CONTEXT.md`; not separately verified in this run)
- Browser and exact version (Firefox): Firefox 159.0.1
- Monitor refresh rate: 60 Hz (display 3840x2160 at 60 Hz)
