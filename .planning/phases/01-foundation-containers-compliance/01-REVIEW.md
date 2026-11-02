---
phase: "01"
status: issues_found
findings:
  total: 23
  critical: 0
  warning: 11
  info: 12
created: "2026-11-02"
---

# Phase 01 — Code Review

Scope: every source, config, test and script file this phase added or changed (Dockerfile/compose/scripts,
`src/sim`, `src/render`, `src/main.ts`, `tests/**`, the TS/ESLint/Vitest/Playwright configs, `index.html`,
and the licensing/attribution artifacts). Documentation prose is out of scope.

Baseline: `docker compose run --rm verify` is green (lint → typecheck → 35 unit tests → build → 1 e2e) at
`1e1e124`. Every finding below was verified against the working tree; the runtime findings were reproduced
inside the `wegolite-ci` image with Playwright probes and temporary, self-cleaning files (no source left
modified). Because the committed gate is green, none of these is caught by the current suite. CR-01 was
fixed in `01-07` (`406d74c`), verified by `tests/e2e/resize.spec.ts`.

## Warnings

### WR-01: The documented `VITE_USE_POLLING` opt-in never reaches the container

**Files:** `compose.yaml:18-26`, `.env.example:6-10`, `vite.config.ts:16-19`

**Evidence:** The `x-workspace` anchor defines only `build`, `image`, `init` and `volumes`; no service has
`environment:` or `env_file:`. Compose's `.env` is used for interpolation only and host environment
variables are not inherited by containers, so `VITE_USE_POLLING` never enters the container's process
environment. I verified `docker compose --env-file <file with VITE_USE_POLLING=1> config` still emits no
`environment`/`env_file` and no polling variable. Independently, `vite.config.ts` reads
`process.env.VITE_USE_POLLING` while the config file is evaluated, and Vite's `loadEnv` (verified at
`node_modules/vite/dist/node/chunks/node.js:6103-6130`) returns the parsed `.env` map without writing it into
`process.env`; even a bind-mounted `/app/.env` cannot make this option work. The documented WSL2/macOS
escape hatch (and `01-VALIDATION.md` Manual-Only row 1) is therefore inert. `tests/contract/...:193-204`
only greps for the literal strings, which is why the suite is green.

**Fix:** forward the variable explicitly on the shared anchor (Compose then interpolates it from `.env`):

```yaml
x-workspace: &workspace
  ...
  environment:
    VITE_USE_POLLING: ${VITE_USE_POLLING:-}
```

and make the config test the value instead of truthiness, so `VITE_USE_POLLING=0` does not enable polling:

```ts
usePolling: process.env.VITE_USE_POLLING === "1",
```

Add a contract assertion for the `environment:` wiring rather than the string's presence.

### WR-02: `.env*` files are neither git-ignored nor docker-ignored, so `COPY . .` can bake local secrets into the image

**Files:** `.gitignore:5`, `.dockerignore:1-7`, `Dockerfile:31`

**Evidence:** `.gitignore` excludes only the exact name `.env`; Vite's conventional `.env.local` /
`.env.<mode>.local` files are not ignored and can be committed by `git add -A`. `.dockerignore` excludes no
`.env` variant at all, and the `ci` stage runs `COPY . .` (after `npm ci`, so the file lands in an image
layer even though it is not needed for the build). The phase's own `01-SECURITY.md` records the `.env` half
as a non-blocking observation, but the `.env.local` variant and the image-layer persistence remain. No such
file exists today, so this is latent, not active.

**Fix:** in `.dockerignore`:

```
.env
.env.*
!.env.example
.gsd
```

and in `.gitignore`:

```
.env
.env.*
!.env.example
```

Add a compliance/contract assertion that no `.env*.local` file is tracked or copied.

### WR-03: `Date()` bypasses the "no wall clock in `src/sim`" gate

**Files:** `eslint.config.js:93-117`, `tsconfig.sim.json:12-13`

**Evidence:** The sim zone bans `Date.now` (`no-restricted-properties`) and `new Date`
(`no-restricted-syntax` `NewExpression[callee.name="Date"]`), but a plain `Date()` call is neither a
`NewExpression` nor a restricted global, and `Date` is part of the ES2022 lib that `tsconfig.sim.json`
keeps. I verified this with a temporary probe in the `ci` image:

```ts
export const now = Date();
export const parsed = Date.parse("2026-01-01T00:00:00Z");
```

`node .../tsc -p tsconfig.sim.json --noEmit` exited **0** and `node .../eslint.js src/sim/__review_date_probe.ts`
exited **0**. A sim module can therefore read the wall clock and still satisfy both FOUND-05 gates. The
probe was removed by the shell trap; no source change remains.

**Fix:** add the call form to the sim zone, e.g. extend `no-restricted-syntax`:

```js
{
  selector: 'CallExpression[callee.name="Date"]',
  message: "No Date inside src/sim.",
},
```

(or add `Date` to `no-restricted-globals`, which covers both forms), and add a case to
`tests/guards/sim-purity.test.ts` that pins it.

### WR-04: Vitest's 5 s default timeout makes the 30 s/180 s budgets in the tests unreachable

**Files:** `vitest.config.ts:6-23`, `tests/contract/container-contract.test.ts:126-140`,
`tests/guards/sim-purity.test.ts:30-40`

**Evidence:** `vitest.config.ts` sets no `testTimeout` or `hookTimeout`. Vitest 5.0.5 resolves the default
to 5 000 ms (verified in the image at
`node_modules/vitest/dist/chunks/index.1TqnEahn.js:9162`: `resolved.testTimeout ??= ... : 5e3`).
`waitForBody` deliberately budgets 30 s of retries for a real Vite boot, and `runGate` passes
`timeout: 180_000` to `spawnSync`. The dev-server test is `async` and awaits `setTimeout`/`fetch`, so the
5 s Vitest timer can fire during the retry loop; the 30 s deadline is dead code beyond 5 s. On a cold or
loaded runner the test fails at 5 s with a generic timeout instead of using its own budget. (Today the guard
tests already consume ~3.6 s each; the whole suite is ~7 s.)

**Fix:** set explicit timeouts in the `unit` project (or root `test` options) and keep the internal budgets
below them, e.g.:

```ts
test: {
  name: "unit",
  environment: "node",
  testTimeout: 60_000,
  hookTimeout: 60_000,
  include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
}
```

### WR-05: The fail-fast rehearsal can report success when lint never caught the seeded violation

**Files:** `scripts/check-verify-fails-fast.sh:54-58`, `tests/contract/container-contract.test.ts:286-301`

**Evidence:** The script requires a non-zero exit **and** output matching
`no-restricted-imports|__verify_probe`. The second alternative is satisfied by any later stage that names the
probe file. If the lint rule ever regresses, `tsc -p tsconfig.sim.json` still sees
`src/sim/__verify_probe.ts` (it is in `src/sim/**` and `types: []` plus `three`'s DOM types makes it fail)
and its diagnostic names the probe — I confirmed the typecheck diagnostic format names the file and line
(`src/sim/__review_probe.ts(1,28): error TS2591...`). The script would then print
"verify failed fast at lint as expected" although the chain reached typecheck. That is exactly the
regression the rehearsal exists to catch. The contract test at `:298` only asserts the script *contains*
`no-restricted-imports`, a string already present in the script's comment at line 9, so it does not pin the
operative check.

**Fix:** require the rule, not the file name:

```sh
if ! printf '%s' "$output" | grep -q 'no-restricted-imports\|src/sim must stay renderer-free'; then
```

and optionally assert the absence of a later-stage marker (e.g. the `tsc` banner) so a failure at typecheck
cannot satisfy the rehearsal. Update the contract test to assert the operative grep text.

### WR-06: A bare `docker compose up` starts all seven services, including three concurrent builds into the same bind-mounted `dist/`

**Files:** `compose.yaml:28-78`, `AGENTS.md:61`

**Evidence:** `docker compose config --services` lists all seven services and the resolved config contains
no `profiles:`. `preview` (`compose.yaml:40`), `e2e` (`:54`) and `verify` (`:77`) each execute
`npm run build`, which writes/empties the *same* host path (`.:/app` → `/app/dist`) because every service
shares the bind mount. `AGENTS.md:61` explicitly requires every service to be reachable from a clean
checkout with `docker compose up`, so the obvious bare `up` is in scope: it runs three Vite builds
concurrently plus the full test suite and the platform test container, which can produce a corrupted or
half-written `dist/` and flaky e2e/build results. The same `up` also races the test suite's source-tree
probes (WR-07).

**Fix:** put the one-shot services behind a profile, e.g. `profiles: ["tools"]` for `test`, `e2e`, `lint`,
`typecheck`, `verify` (and decide whether `preview` should start with `app`), so `docker compose up` starts
only the server(s) and `docker compose --profile tools run --rm verify` stays available. Alternatively,
relax the AGENTS rule to name `docker compose up app` / `up preview` explicitly.

### WR-07: The guard tests write probe files into the shared bind-mounted source tree

**File:** `tests/guards/sim-purity.test.ts:43-57`

**Evidence:** `withProbe` writes `src/sim/__purity_*.ts` into `REPO_ROOT` and removes it in `finally`. The
repository is bind-mounted into every service, so while the guard runs (the `test` service) any concurrent
`lint` container (`docker compose up`, a second `docker compose run --rm test`, or a parallel CI shard) sees
the probe and fails on the seeded Three import / DOM global — a spurious red run. The `compliance` test
skips only names starting with `__purity_` (`tests/compliance.test.ts:71`), while the other rehearsal script
writes `src/sim/__verify_probe.ts`; a SIGKILL (the `finally` never runs) leaves a probe behind that breaks
`npm run lint` and `npm run typecheck` for every subsequent run until it is deleted by hand. The current
single-run `verify` is green only because its stages are sequential.

**Fix:** run the negative-proof gates against a throwaway copy of the minimal tree (for example
`mkdtemp` + copy `src/sim`, the tsconfigs and the ESLint config, then point the gate at the copy) so the
shared worktree is never mutated; at minimum document that test runs must be serialized and ignore the probe
names in `.gitignore`, `.prettierignore`, `.dockerignore` and `compliance.test.ts`. Also skip
`__verify_probe` there or have the rehearsal script use the temp copy too.

### WR-08: The Dockerfile's `# syntax` directive pulls an unpinned external image, and `--with-deps` installs unpinned OS packages

**Files:** `Dockerfile:1`, `Dockerfile:29-30`, `tests/contract/container-contract.test.ts:305-324`

**Evidence:** `# syntax=docker/dockerfile:1` makes BuildKit fetch `docker/dockerfile:1` (a mutable tag) from
Docker Hub on a cold build. The file uses no BuildKit-only construct (no heredocs, `RUN --mount` or
`COPY --link`), so the directive is unnecessary today. The contract test and `01-SECURITY.md` T-01-SC assert
"exactly one external image", but the test only inspects `FROM` lines, so this second external pull is
invisible to it. Separately, `npx playwright install --with-deps` resolves Debian packages from the live
archive at build time, so image contents drift even with the base digest pinned.

**Fix:** delete the `# syntax` line (or pin it by digest), and either pin the apt package set used by
`--with-deps` or record the accepted drift. Extend the FOUND-04 test to reject an unpinned `# syntax` line.

### WR-09: A zero-size viewport at boot publishes `ready: true` with `renders: 0` and no paint

**File:** `src/main.ts:133-146`, `src/main.ts:164-176`

**Evidence:** `resize()` is the only render site in the module, and the new
guard returns at `:138` before it. The probe literal at `:165-176` is published
unconditionally afterwards, with `ready: true` and every render-derived field
copied from `renderer.info.render`, which is still zero. Reproduced inside
`wegolite-ci` against the production bundle with a same-origin
`display:none` iframe (`innerWidth/innerHeight === 0`):

```
{ ready: true, calls: 0, triangles: 0, renders: 0, canvasW: 300, canvasH: 150 }
```

The canvas keeps the `WebGLRenderer` constructor default (300×150) because
`setSize` was never called. Growing the iframe to 800×600 recovers on the next
`resize` event (`renders: 1`, `calls: 3`, `canvas 800×600`), so the state is not
permanent — but it is observable. This falsifies the comment at `:164`
("Published after the first render so `ready` implies the probe's numbers are
real") and the invariant `01-07-PLAN.md` relies on ("`ready` still implies the
numbers are real"). The plan's static gate only proves the `Infinity`-aspect
half; it does not prove that `ready` still means "rendered".

**Impact:** a shell mounted in a zero-sized container (hidden/`display:none`
iframe, an un-sized embed host, a document restored at 0×0) reports itself
booted while nothing was ever painted. Any consumer keyed on `ready` — including
`tests/e2e/*.spec.ts`'s `waitForFunction(ready === true)` — treats a blank
canvas as a successful boot, and the failure surfaces as a confusing downstream
assertion (`calls > 0`) rather than at the real cause. Recoverable on the next
resize, so no crash or data loss.

**Fix:** make `ready` mean what the comment says. Either compute it from the
render counter in the published literal:

```ts
window.__wegolite = {
  ready: renderer.info.render.frame > 0,
  // ...
};
```

or publish the probe before the boot `resize()` with `ready: false` and let
`renderFrame()` flip `ready = true` after a successful `renderer.render()`
(this also removes the need for the `if (window.__wegolite)` guard). Add a case
to `tests/e2e/resize.spec.ts` or a unit test if the contract is to be pinned —
Playwright cannot set a 0×0 viewport, but a hidden iframe can.

### WR-10: `renders` resets to 0 on WebGL context restore, so the field is not monotonic and the new spec can time out

**File:** `src/main.ts:122-131`, `src/main.ts:165-176`;
`tests/e2e/resize.spec.ts:48-69`

**Evidence:** the plan's premise that the counter only resets when the context is
recreated is correct, but the consequence was not followed through. In three
r187, `WebGLRenderer`'s `initGLContext()` builds a new info object
(`info = new WebGLInfo(_gl)`, `three.module.js:16288`) and `onContextRestore()`
calls `initGLContext()` (`:16950-16962`), so `info.render.frame` restarts at 0
after a restore. Measured on the production bundle: boot `1` → 900×600 `2` →
restore `3`; then `loseContext()` + `restoreContext()` (with no render in
between) left the probe at the stale `3`, and the next resize (700×500)
published `renders: 1`. The field went **3 → 1**. `ready` also stays `true`
across the loss, and no repaint is attempted on `webglcontextrestored`, so the
canvas remains blank until an unrelated resize.

**Impact:** `renders` is a per-context counter published under a name that reads
as "renders performed", and the only consumer uses it as a monotonic signal:
`waitForFunction((prev) => renders > prev)` at
`tests/e2e/resize.spec.ts:49-53` and `:65-69`. After any context restore —
driver reset/TDR, GPU-process restart, SwiftShader memory pressure in CI — the
counter is behind `previous` and cannot catch up within the single remaining
resize, so the regression fails with an opaque 5 s timeout instead of
diagnosing the restore. (Three logs `Context Lost.`/`Context Restored.` via
`console.log`, which the spec's console filter ignores because it only collects
`error` messages, so nothing in the failure output points at the cause.) No
runtime consumer exists today, but the field is now part of the probe contract
and Phase 3 will inherit it.

**Fix:** pick one and record it on `WegoliteProbe.renders`:

1. Make the published value monotonic while still deriving from three's
   counter — keep an epoch offset and bump it on restore so
   `renders = info.render.frame + epochBase` never decreases; or
2. Add a `webglcontextrestored` listener that calls `resize()` (repaint the
   restored context, which is also the fix CR-01 suggested) and document that
   `renders` restarts at 0 per context; if the spec must stay green across a
   restore, sample a fresh baseline after a `webglcontextrestored` page event
   rather than comparing against the pre-restore value.

Either way the restore path should repaint, otherwise the new `ready`-implies-a-
painted-canvas contract is broken for a lost context as well.

### WR-11: The resize spec samples the buffer and counter after the fact, so it cannot detect a render-before-setSize ordering

**File:** `tests/e2e/resize.spec.ts:48-75`

**Evidence:** both checks wait for `renders` to advance and then read
`canvas.width/height` in a separate `page.evaluate`, i.e. after the resize task
has finished. A handler ordered as

```ts
renderFrame();                    // paints the OLD buffer, increments info.render.frame
renderer.setSize(width, height, false); // reallocates + clears the buffer
```

would still pass: the counter advanced, and the post-hoc read sees the correct
900×600 buffer. But the paint went to the discarded buffer, so the presented
canvas is blank — exactly the CR-01 symptom. The plan pins the zero-size guard's
ordering statically (`awk` gate) and the code currently places `renderFrame()`
last (`src/main.ts:142`), but nothing in the spec or the gates pins that
ordering, so a future edit can reintroduce the bug with a green suite.

**Impact:** the regression is not order-sensitive. Its stated purpose — proving
"a fresh render follows the buffer resize" — is only half covered: it proves a
render happened and a reallocation happened, not that the render used the new
buffer.

**Fix:** record the buffer size at draw time (still D-08-compliant: no pixels),
for example with an init script:

```ts
await page.addInitScript(() => {
  const proto = WebGL2RenderingContext.prototype;
  for (const name of ["drawElements", "drawArrays", "clear"] as const) {
    const original = proto[name];
    (proto as any)[name] = function (this: WebGL2RenderingContext, ...args: any[]) {
      (window as any).__lastDrawWidth = this.canvas.width;
      return (original as any).apply(this, args);
    };
  }
});
```

then assert `__lastDrawWidth === canvas.width` after each counter advance. (A
cheaper alternative is to add the symmetric static gate: `renderer.render` is
only reached through `renderFrame()`, and `renderFrame()` is the final statement
of `resize()`.)

## Info

### IN-01: `f32Ulp` returns the wrong spacing for float32 subnormals

**File:** `src/render/camera-relative.ts:40-44`

**Evidence:** The formula `2^(floor(log2|x|) - 23)` is correct only for normal float32 values. For
`0 < |x| < 2^-126` the spacing is the fixed subnormal ULP `2^-149`, but the function keeps reducing the
exponent. Verified in the image: `f32Ulp(1e-40)` returns `1.0947644252537633e-47` instead of
`1.401298464324817e-45` (`2^-149`). The `magnitude === 0` branch already returns `2^-149`, so the function
is internally inconsistent. Not reachable with current world coordinates, but it is a measurement primitive
later phases may reuse.

**Fix:** clamp the exponent, e.g.
`const e = Math.max(Math.floor(Math.log2(magnitude)), -126); return Math.pow(2, e - 23);`
or `Math.max(Math.pow(2, -149), ...)`, and add a subnormal test case.

### IN-02: The debug probe is published unconditionally in the production bundle

**File:** `src/main.ts:150-161`

**Evidence:** `window.__wegolite` is assigned outside the `import.meta.env.DEV` guard used for the stats
line (`:139-148`). It exposes renderer statistics only (`calls`, `triangles`, `depthBits`, `nearRelZ`,
`farRelZ`, …), not state or input, and the e2e spec depends on it. `01-SECURITY.md` records this as a
non-blocking observation; it is repeated here because it is an intentional production surface that should be
tracked as the probe grows.

**Fix:** gate the assignment on `import.meta.env.DEV` (and let e2e run against the dev server, or expose the
probe only when a `?probe` query is present), or keep it and document the exposure.

### IN-03: `package.json` declares no licence

**File:** `package.json:1-8`

**Evidence:** Neither `package.json` nor the root entry of `package-lock.json` has a `license` field, so npm
and SBOM/licence tooling report the package as unlicensed even though the project is GPL-2.0-or-later
(`NOTICE:7-10`, SPDX headers on every source file). `private: true` avoids publishing, but the metadata gap
remains.

**Fix:** add `"license": "GPL-2.0-or-later"` (and optionally `"repository"`) to `package.json`.

### IN-04: No `.gitattributes`; the raw-byte LICENSE checksum breaks on a CRLF checkout

**File:** `tests/compliance.test.ts:79-86`

**Evidence:** The test hashes `LICENSE` byte-for-byte with MD5. No `.gitattributes` is tracked (verified:
no `.gitattributes` in the working tree or `git ls-files`), so a Windows checkout with `core.autocrlf=true`
(or a global CRLF setting) checks the file out with CRLF, changes the digest, and fails the compliance test;
the same checkout also conflicts with Prettier's LF output. The project explicitly supports WSL2/macOS.

**Fix:** add a tracked `.gitattributes` with `* text=auto eol=lf` (plus `LICENSE text eol=lf`), or normalize
line endings before computing the digest.

### IN-05: Container builds create root-owned artifacts on the host bind mount

**Files:** `compose.yaml:24-26`, `Dockerfile:7-44`

**Evidence:** Every service mounts `.:/app`, no service sets `user:`, and the image has no `USER` directive.
`preview`, `e2e` and `verify` run `npm run build` as root, writing `dist/` (and `test-results/` for
Playwright) into the host tree; I confirmed `dist/` and `test-results/` are owned by `root:root` in the
working copy. A developer then needs root to clean them, and `git clean -fdx` fails.

**Fix:** map the host identity in the anchor (`user: "${UID:-1000}:${GID:-1000}"`) or build/test into a
container-only path/named volume, and document the choice.

### IN-06: `stop()` ignores `signalCode` and has a check-then-listen race

**File:** `tests/contract/container-contract.test.ts:142-155`

**Evidence:** `if (child.exitCode !== null) return;` treats a signal-killed child (`exitCode === null`,
`signalCode` set) as alive. It then attaches an `exit` listener that will never fire and waits the full
5 000 ms SIGKILL timer; that wait is itself at the edge of the 5 s Vitest default (WR-04) and can turn a
crashed Vite into a timeout. There is also a small window between the `exitCode` check and attaching the
listener in which an exit can be missed.

**Fix:** check both exit paths (`child.exitCode !== null || child.signalCode !== null`) and prefer resolving
on `close` (or call `kill` and resolve immediately when the process is already gone).

### IN-07: The e2e "precision" assertions read values the page computed, not the rendered result

**Files:** `tests/e2e/precision.spec.ts:24-33`, `src/main.ts:151-160`

**Evidence:** `nearRelZ`/`farRelZ` are exactly the `Object3D.position.z` values `place()` wrote, and
`farUlp` is a direct `f32Ulp(FAR_M)` call. The browser test therefore proves the scene-graph wiring and the
constants, but it cannot detect float32 jitter in the GPU upload or the rendered image. The numeric
transform is covered by `src/render/camera-relative.test.ts`; `01-VALIDATION.md` acknowledges the manual
visual check, but the spec name/claims overstate what the assertions prove.

**Fix:** assert against projected coordinates or sampled pixels (or add a GPU-side readback), or rename the
e2e claim to "scene graph wiring and constants" and leave precision to the unit test plus the manual check.

### IN-08: `oneSecondAt` swallows every error, not just the expected exhaustion

**File:** `src/sim/cadence.test.ts:41-50`

**Evidence:** The helper wraps `runToSteps` in a bare `catch {}` and returns `state.tick`. At 30/60 Hz an
unexpected throw still changes the tick count and fails the assertion, but at 144 Hz an unexpected failure
that happens to occur after tick 119 would satisfy `toBe(119)` and hide a real loop bug. The comment only
justifies the frame-exhaustion error.

**Fix:** assert the error instead of discarding it, e.g.
`expect(() => runToSteps(...)).toThrow(/frame list exhausted/)`, or catch and check the message.

### IN-09: `playwright.config.ts` uses `npx` for the web server

**File:** `playwright.config.ts:25`

**Evidence:** `webServer.command` is `npx vite preview ...`. If the local `vite` binary is missing (stale
named volume, partial install), `npx` falls back to a network fetch, which is exactly the runtime-download
behaviour FOUND-04 tries to exclude, and it spawns an extra npm process. The contract test deliberately
spawns `node node_modules/vite/bin/vite.js` instead, citing reliability (`container-contract.test.ts:159-161`).

**Fix:** use `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort` (or
`vite preview` with an explicit PATH) so the local binary is the only resolution path.

### IN-10: The smoke scripts install their teardown trap after `docker compose up -d`

**Files:** `scripts/smoke-dev.sh:21-22`, `scripts/smoke-preview.sh:23-24`

**Evidence:** `trap 'docker compose down' EXIT` is registered on the line *after* `docker compose up -d ...`.
If `up -d` fails after creating/starting a container (port conflict after creation, a build error mid-start,
a permission error), the script exits with no trap installed and leaves the container behind, contradicting
the header comment that teardown happens "on every exit path" and the T-01-19 claim.

**Fix:** install the trap before the `up` call (it is a no-op if nothing started), then run
`docker compose up -d ...`. The scripts also assume a host `curl` with `--retry-all-errors` (≥7.71), which is
not part of the documented "Docker and a browser" host requirement; state it in README/AGENTS or drop the
flag.

### IN-11: The spec proves "at least one render per resize", not "exactly one"

**File:** `tests/e2e/resize.spec.ts:49-53`, `tests/e2e/resize.spec.ts:65-69`

**Evidence:** both waits use `> previous` and the follow-up assertions use
`toBeGreaterThan`, so a handler that renders twice per event (or a hidden extra
render site) passes. `01-07-PLAN.md` lists "each resize event produces exactly
one render" as a must-have; only the static "no loop" grep backs it. My probe
measured exactly one `resize` event and one counter step per
`page.setViewportSize`, so a tighter assertion is feasible on this Chromium, but
it is browser-version dependent (an intermediate resize event would make `+1`
flaky), which is presumably why the looser form was chosen.

**Fix:** either pin the multiplicity statically (`renderer.render` appears once
in `src/main.ts`, and `renderFrame(` is called only from `resize()`), or assert
an upper bound per event (`expect(renders).toBeLessThanOrEqual(previous + 2)`)
and document why it is not exactly `+1`.

### IN-12: The spec derives the expected buffer size from the live `devicePixelRatio`, but the renderer pins the pixel ratio at boot

**File:** `src/main.ts:98`, `src/main.ts:139`;
`tests/e2e/resize.spec.ts:58-60`, `:73-75`

**Evidence:** `buildRenderer()` calls
`renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` once at boot;
`resize()` never re-applies it, so `setSize` keeps using the boot-time
`_pixelRatio`. The spec instead computes the expectation from
`window.devicePixelRatio` read after each resize. When the device pixel ratio
changes between boot and the assertion (window dragged between monitors,
browser zoom), the renderer sizes the buffer with the old ratio while the spec
expects the new one: the app renders a scaled/blurry image and the spec fails
with a false negative that looks like a resize regression.

**Impact:** a real (if uncommon) DPR-change path is neither handled nor
distinguished from a genuine failure, and the new test encodes the assumption
that DPR is constant for the page's lifetime.

**Fix:** re-apply the ratio inside `resize()` before `setSize`:

```ts
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(width, height, false);
```

so the assertion and the renderer agree, or assert against the ratio the
renderer actually resolved instead of the live `window.devicePixelRatio`.
