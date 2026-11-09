# Wegolite

Wegolite is a browser-based, faithful reimplementation of Oolite's core
single-player loop: fly a Cobra Mk III out of a Coriolis station, dock manually,
trade commodities between star systems, and hyperspace across the eight galaxies.
Desktop web only. It is an unofficial fan project, not affiliated with the Oolite
project, Frontier Developments plc, David Braben or Ian Bell.

Every process — dev server, production preview, unit tests and browser tests —
runs in Docker. The host machine is expected to provide Docker and a browser,
nothing else: no host Node, npm or Playwright install is authoritative.

The project is licensed GPL-2.0-or-later. Oolite-derived artwork and
configuration files remain CC BY-NC-SA 3.0 (attribution required, non-commercial
only, share-alike). See [`NOTICE`](./NOTICE), [`LICENSE`](./LICENSE) and
[`ASSETS.md`](./ASSETS.md).

## Play

Release: **Wegolite 0.1.0**. The version is read from `package.json`, and the
release title is derived from it, so the two cannot drift apart.

Build the production bundle and serve it:

```sh
docker compose up preview
```

then open <http://localhost:4173>. For development with hot reload, run
`docker compose up app` and open <http://localhost:5173> instead. Saves stay in
your browser's IndexedDB; they are not uploaded anywhere.

## Controls

The tables show the default keys, spelled the way the game labels them. The
pause menu's Controls panel rebinds any of them; a rebind replaces the default
for that action.

**Flight**

| Action           | Keys                     |
| ---------------- | ------------------------ |
| Pitch forward    | `Up arrow`               |
| Pitch back       | `Down arrow`             |
| Roll left        | `Left arrow`             |
| Roll right       | `Right arrow`            |
| Increase speed   | `W`                      |
| Decrease speed   | `S`                      |
| Torus drive      | `J`                      |
| Launch           | `1 / F1`                 |
| Docking computer | `Shift+C`                |
| Target station   | `R`                      |
| Cycle compass    | `\`                      |
| Precision        | `Left Ctrl / Right Ctrl` |
| Hyperspace       | `H`                      |

**Galactic chart**

| Action         | Keys          |
| -------------- | ------------- |
| Galactic chart | `F6`          |
| Chart up       | `Up arrow`    |
| Chart down     | `Down arrow`  |
| Chart left     | `Left arrow`  |
| Chart right    | `Right arrow` |
| Chart commit   | `Enter`       |
| Chart range    | `Tab`         |
| Chart close    | `Esc`         |

**Docked station**

| Action        | Keys                |
| ------------- | ------------------- |
| Market        | `F8 / 8`            |
| Outfitting    | `F3 / 3`            |
| Status        | `F5 / 5`            |
| System data   | `F7 / 7`            |
| Interfaces    | `F4 / 4`            |
| Back          | `Esc / Backspace`   |
| Up            | `Up arrow`          |
| Down          | `Down arrow`        |
| Left          | `Left arrow`        |
| Right         | `Right arrow`       |
| Confirm       | `Enter / Y`         |
| Cancel        | `N`                 |
| Next page     | `Tab / PageDown`    |
| Previous page | `PageUp`            |
| Sell maximum  | `Shift+Left arrow`  |
| Buy maximum   | `Shift+Right arrow` |

**Save and load**

| Action             | Keys         |
| ------------------ | ------------ |
| Save / load        | `F2`         |
| Save/load up       | `Up arrow`   |
| Save/load down     | `Down arrow` |
| Save               | `S`          |
| Load               | `L`          |
| Return             | `Esc`        |
| Save/load activate | `Enter`      |
| Save/load confirm  | `Y`          |
| Save/load cancel   | `N`          |

**Anywhere**

| Action | Keys      |
| ------ | --------- |
| Pause  | `P / Esc` |

## Supported browsers

Wegolite supports two desktop browsers: current stable Chrome and current stable Firefox. Both need WebGL2, so hardware acceleration must be enabled.

Two commands check the release. `docker compose run --rm verify-full` runs the
full suite on Chromium. `docker compose run --rm e2e-cross` runs the core loop on
Firefox under a virtual display. Real-GPU frame rate is measured by the protocol
in [`docs/PERFORMANCE.md`](./docs/PERFORMANCE.md), never inside Docker.

No other browser is tested for this release.

## Commands

These are the same commands `AGENTS.md` documents; the service names are the
contract.

| Task                             | Command                                               |
| -------------------------------- | ----------------------------------------------------- |
| Dev server (port 5173)           | `docker compose up app`                               |
| Production preview (port 4173)   | `docker compose up preview`                           |
| Unit tests                       | `docker compose run --rm test`                        |
| Browser tests                    | `docker compose run --rm e2e`                         |
| Firefox browser tests            | `docker compose run --rm e2e-cross`                   |
| Content build (regenerate)       | `docker compose run --rm assets`                      |
| Content drift check              | `docker compose run --rm assets npm run assets:check` |
| Fast verification gate           | `docker compose run --rm verify`                      |
| Full release gate                | `docker compose run --rm verify-full`                 |
| Lint                             | `docker compose run --rm lint`                        |
| Typecheck                        | `docker compose run --rm typecheck`                   |
| Rebuild after dependency changes | `docker compose build --no-cache`                     |
| Stop and clean up                | `docker compose down --volumes --remove-orphans`      |

## Fidelity

[`FIDELITY.md`](./FIDELITY.md) maps each ported mechanic to the Oolite source
that defines it, at the pinned commit `7437f22`. It also lists every recorded
divergence, and each divergence names its row in the PROJECT.md Key Decisions
table.

## Performance

[`docs/PERFORMANCE.md`](./docs/PERFORMANCE.md) holds the frame budget and the
measurement protocol. Each rendered frame may use at most 50 draw calls and at
most 250 000 triangles, and the planet may spend at most 9 noise evaluations.
The container checks the first two on SwiftShader. Frame rate is judged only on a
real GPU, by the protocol in that document.

## Troubleshooting

- **WebGL2 is unavailable.** Wegolite needs WebGL2. When the browser does not
  provide it, the page shows a plain message in place of the game. Enable
  hardware acceleration in the browser, then reload the page.
- **The graphics context is lost.** The game pauses at once. When the browser
  restores the graphics, the pause overlay says "Graphics restored. The game is
  paused — press P to continue." If no restore arrives within 10 seconds, the
  page says "Wegolite could not restore the graphics. Your last save is safe.
  Reload the page to continue."
- **A hidden tab pauses the game.** Switching to another tab pauses Wegolite.
  Return to the tab and press P or Esc to carry on.

## Content pipeline

The game content is compiled at build time from a pinned Oolite snapshot. The
browser never parses a plist and never downloads the snapshot.

- **Pinned snapshot.** `third_party/oolite/` holds the exact bytes the compiler
  reads: Oolite release **1.93.1-241**, commit **`7437f22`**. The identity lives
  in `third_party/oolite/pin.json` and is explained by
  `third_party/oolite/SOURCE.md`; `scripts/vendor-oolite.sh` is the only
  sanctioned way those bytes enter the repository.
- **Regenerate.** `docker compose run --rm assets` compiles the snapshot into
  `src/content/generated/` (typed JSON and the manifest) and `public/models/`,
  `public/textures/` (GLB and PNG). The output is committed: it is the reviewed
  baseline, not a build cache.
- **Drift gate.** `docker compose run --rm assets npm run assets:check`
  regenerates into a temporary directory and compares the file set, the bytes
  and each SHA-256 against the committed tree. It runs inside
  `docker compose run --rm verify`, third in the chain, so a content change
  that was not regenerated and committed fails the definition of done.
- **Never hand-edit generated output.** Every file under
  `src/content/generated/`, `public/models/` and `public/textures/` is emitted
  by the compiler. Change the converter or the pinned input, then regenerate.
- **Bump the pin.** Re-vendor at the new release/commit, run
  `docker compose run --rm assets`, review every changed byte, and commit the
  regenerated output together with the new `pin.json`, `SOURCE.md`,
  `CHECKSUMS.sha256` and `ASSETS.md` hashes. `verify` stays red until that diff
  is reviewed and committed; there is no override.
- **Cross-architecture proof.** `sh scripts/check-arch-determinism.sh` rebuilds
  the generator and regenerates under `linux/arm64` and `linux/amd64`, then
  compares the two trees file by file. It is deliberately outside `verify`
  because Compose cannot select a platform per invocation; run it on CI or a
  host with arm64 execution.
- **Licensing.** Oolite-derived data and artwork stay CC BY-NC-SA 3.0:
  attribution required, non-commercial only, share-alike. Every vendored and
  generated asset has a row with a SHA-256 in [`ASSETS.md`](./ASSETS.md); see
  also [`NOTICE`](./NOTICE).

## Operational notes

- **Ports.** The dev server publishes `5173` and the production preview `4173`. The test services (`test`, `e2e`, `e2e-cross`, `lint`, `typecheck`, `assets`, `verify`, `verify-full`) publish no ports — Playwright starts its own `vite preview` inside the container.
- **Definition of done.** The definition of done for everyday changes is `docker compose run --rm verify`, the fast gate: it runs `lint`, then `typecheck`, then `assets:check`, then `test`, then `build`, then the e2e smoke subset (`test:e2e:fast`: the scene, docking and save/load specs), as one fail-fast chain in one container, exiting non-zero at the first failing stage. `docker compose run --rm verify-full` runs the same fail-fast chain with the full Chromium suite (`test:e2e`); run it before a release and when render, input, persistence or network-guard code changes, and CI runs it. A green host run is not evidence; tests pass only in the container.
- **Dependency changes.** After any `package.json` or `package-lock.json` change run `docker compose build --no-cache` **and** `docker compose down --volumes`. A rebuild alone is not enough: the named `node_modules` volume is populated from the image once and otherwise keeps its old contents.
- **Hot reload on WSL2/macOS.** If host edits stop triggering a reload, opt in to file polling with `VITE_USE_POLLING=1` (see `.env.example`). Polling is opt-in because it costs CPU.
- **Chromium posture.** Browser tests run the image's baked Chromium as root with its sandbox disabled, and the preview under test loads only content this repository serves. No third-party page is ever opened. Firefox in the `e2e-cross` image runs under the same localhost-only posture, and `e2e-cross` is not part of `verify`, which stays Chromium-only.
- **Working tree, not image.** `docker compose run --rm verify` bind-mounts the repository at `/app`, so it checks the edits you can see. Run `docker compose build` first when you need the committed tree verified instead.

## Repository layout

- `src/sim/` — pure TypeScript simulation core: no Three.js, no DOM, no wall clock.
- `src/render/` — camera-relative transforms and the scene, downstream of the sim.
- `src/content/` — compiled content: the zod schemas, the type-only surface the
  sim may import, and the generated JSON under `src/content/generated/`.
- `tools/oolite-ingest/` — the build-time compiler that turns the pinned
  snapshot into typed content, GLB models and textures.
- `tests/` — Vitest suites (`compliance`, golden fixtures, guards) and Playwright
  specs under `tests/e2e/`.
- `third_party/oolite/` — the pinned Oolite snapshot; `public/` holds the
  compiled GLB models and textures served by URL.

## Licence and source

Wegolite's own source code is licensed under GPL-2.0-or-later; the unmodified
licence text is in [`LICENSE`](./LICENSE). Oolite-derived artwork and
configuration files are licensed under CC BY-NC-SA 3.0: attribution is required,
use is non-commercial only, and derivatives must be shared alike. Every such file
has a row in [`ASSETS.md`](./ASSETS.md), and [`NOTICE`](./NOTICE) gives the
attribution.

The built site ships `NOTICE`, `LICENSE` and `ASSETS.md`, and its footer links
all three.

The complete corresponding source for every distributed build is at
https://github.com/DenisBY/wegolite.
