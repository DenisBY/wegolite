// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * FOUND-01/02/03/04/09 are infrastructure contracts: their observable behaviour
 * is the Compose topology, the pinned/baked image, the documented command
 * table and the scripts that drive live servers. None of that is exercised by
 * the sim/render unit tests, so this suite pins it inside
 * `docker compose run --rm test` — the same gate as application code.
 *
 * Division of proof:
 * - The dev-server case below is a genuine runtime check: it boots the real
 *   Vite dev server from this container and asserts the served body carries
 *   the HMR client.
 * - The FOUND-04 browser case reads `/ms-playwright`, which only exists
 *   because the binary was baked into the image at build time.
 * - The remaining cases pin the contracts that cannot be re-executed from
 *   inside a container (mounting Compose services from the host, spawning a
 *   nested `verify`). Their live halves stay in `scripts/smoke-dev.sh`,
 *   `scripts/smoke-preview.sh` and `scripts/check-verify-fails-fast.sh`;
 *   this suite asserts those scripts still contain the checks they claim.
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

interface PackageManifest {
  name?: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

/** The release title `Wegolite <version>`, derived from package.json (D-06). */
function releaseTitle(): string {
  return `Wegolite ${readJson<PackageManifest>("package.json").version}`;
}

/**
 * Extract the `services:` map as name -> block text.
 *
 * This is a deliberately small subset parser: Compose service names sit at two
 * spaces, every body line is deeper, and the next top-level key is at column
 * zero. It is enough to assert per-service content without adding a YAML
 * dependency (the project forbids new dependencies in Phase 1).
 */
function parseServices(compose: string): Map<string, string> {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => /^services:\s*$/.test(line));
  if (start < 0)
    throw new Error("compose.yaml has no top-level services: block");

  const services = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== null) services.set(current, buffer.join("\n"));
  };

  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^\S/.test(line)) break;
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header !== null) {
      flush();
      current = header[1] ?? null;
      buffer = [];
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  flush();

  if (services.size === 0) {
    throw new Error("compose.yaml services: block parsed to zero services");
  }
  return services;
}

const COMPOSE_TEXT = read("compose.yaml");
const SERVICES = parseServices(COMPOSE_TEXT);

function service(name: string): string {
  const block = SERVICES.get(name);
  if (block === undefined)
    throw new Error(`compose.yaml has no "${name}" service`);
  return block;
}

/** Comments are documentation, never part of the executable command. */
function executable(block: string): string {
  return block
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

function script(manifest: PackageManifest, name: string): string {
  const value = manifest.scripts[name];
  if (value === undefined)
    throw new Error(`package.json has no "${name}" script`);
  return value;
}

/** Every `docker compose run --rm X` / `docker compose up X` target in a doc. */
function documentedTargets(document: string): Set<string> {
  const targets = new Set<string>();
  const pattern = /docker compose (?:run --rm|up(?: -d)?) ([a-z][a-z0-9-]*)/g;
  for (const match of document.matchAll(pattern)) {
    const target = match[1];
    if (target !== undefined) targets.add(target);
  }
  return targets;
}

async function waitForBody(url: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  let lastError = "no request attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      lastError = `HTTP ${String(response.status)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not answer ${url}: ${lastError}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

describe("FOUND-01 dev server", () => {
  it("serves the Vite HMR client on the documented port from this container", async () => {
    // Spawning the real binary (not `npx`) gives one process that can be
    // stopped reliably; the path only exists because `npm ci` baked the
    // dependency tree into the image.
    const viteBin = join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js");
    expect(existsSync(viteBin)).toBe(true);

    const child = spawn(process.execPath, [viteBin], {
      cwd: REPO_ROOT,
      stdio: "ignore",
      // Empty means "do not force polling"; the config must not read anything
      // else out of the ambient environment to decide the port or host.
      env: { ...process.env, VITE_USE_POLLING: "" },
    });

    try {
      const body = await waitForBody("http://127.0.0.1:5173/");
      expect(body).toContain("@vite/client");
      expect(body).toContain("Wegolite");
    } finally {
      await stop(child);
    }
  });

  it("publishes 5173 on the app service and runs the documented dev script", () => {
    const app = executable(service("app"));
    const manifest = readJson<PackageManifest>("package.json");

    expect(app).toMatch(/ports:\s*\n\s*-\s*"5173:5173"/);
    expect(app).toMatch(/command:\s*\[\s*"npm",\s*"run",\s*"dev"\s*\]/);
    expect(script(manifest, "dev")).toContain("--port 5173");
    expect(script(manifest, "dev")).toContain("--host 0.0.0.0");
    expect(read("vite.config.ts")).toMatch(/port:\s*5173/);
  });

  it("keeps the live dev check and the WSL2/macOS polling escape hatch", () => {
    const smoke = read("scripts/smoke-dev.sh");

    expect(smoke).toContain("docker compose up -d app");
    expect(smoke).toContain("5173");
    // The script must assert the served *body*, not a listening port.
    expect(smoke).toContain("@vite/client");
    expect(smoke).toMatch(/grep -q '@vite\/client'/);
    expect(smoke).toContain("trap ");
    expect(read(".env.example")).toContain("VITE_USE_POLLING");
    expect(read("vite.config.ts")).toContain("VITE_USE_POLLING");
  });
});

describe("FOUND-02 production preview", () => {
  it("builds before serving the bundle on 4173, and the marker ships in the shell", () => {
    const preview = executable(service("preview"));
    const command = /command:\s*\[([^\]]*)\]/.exec(preview)?.[1] ?? "";
    const buildAt = command.indexOf("npm run build");
    const serveAt = command.indexOf("npm run preview");

    expect(buildAt).toBeGreaterThanOrEqual(0);
    expect(serveAt).toBeGreaterThan(buildAt);
    expect(preview).toContain('"4173:4173"');
    // The preview smoke greps for this marker, so it has to exist in the page.
    expect(read("index.html")).toContain(releaseTitle());
    expect(
      script(readJson<PackageManifest>("package.json"), "preview"),
    ).toContain("--port 4173");
  });

  it("keeps the live preview check asserting the served bundle body", () => {
    const smoke = read("scripts/smoke-preview.sh");

    expect(smoke).toContain("docker compose up -d preview");
    expect(smoke).toContain("4173");
    expect(smoke).toContain(releaseTitle());
    expect(smoke).toContain("trap ");
  });
});

describe("FOUND-03 container-only verification", () => {
  it("declares every documented service on the shared workspace anchor", () => {
    for (const name of [
      "test",
      "e2e",
      "e2e-cross",
      "lint",
      "typecheck",
      "assets",
      "verify",
      "verify-full",
      "verify-checks",
    ]) {
      expect(executable(service(name))).toContain("<<: *workspace");
    }
    // One image build target for every service: no service may drift onto a
    // different stage and test content other than the committed tree.
    expect(COMPOSE_TEXT).toMatch(/x-workspace: &workspace[\s\S]*?target: ci/);
    // Ports are published only for the two servers, never for test services.
    for (const name of [
      "test",
      "e2e",
      "e2e-cross",
      "lint",
      "typecheck",
      "assets",
      "verify",
      "verify-full",
      "verify-checks",
    ]) {
      expect(executable(service(name))).not.toMatch(/^\s*ports:/m);
    }
    expect(COMPOSE_TEXT).not.toMatch(/^\s*depends_on:/m);
  });

  it("builds the cross stage only from e2e-cross and keeps it out of verify", () => {
    // Only one service may override the shared `target: ci` anchor.
    const overriding = [...SERVICES.keys()].filter((name) =>
      /^\s*target:/m.test(executable(service(name))),
    );
    expect(overriding).toEqual(["e2e-cross"]);

    const cross = executable(service("e2e-cross"));
    expect(cross).toMatch(/^\s*target:\s*cross\s*$/m);
    expect(cross).toMatch(/^\s*image:\s*wegolite-cross\s*$/m);
    expect(cross).toMatch(/^\s*ipc:\s*host\s*$/m);
    expect(cross).toContain('WEGOLITE_E2E_WAIT_SCALE: "1"');
    expect(cross).toContain(
      'command: ["sh", "-lc", "npm run build:e2e && npm run test:e2e:cross"]',
    );

    // D-09: the Firefox gate never joins the Chromium-only verify chain.
    const verify = executable(service("verify"));
    expect(verify).not.toMatch(/e2e-cross|test:e2e:cross/);
    expect(executable(service("verify-full"))).not.toMatch(
      /e2e-cross|test:e2e:cross/,
    );
    expect(executable(service("verify-checks"))).not.toMatch(
      /e2e-cross|test:e2e:cross/,
    );
  });

  it("maps each service to its documented npm script", () => {
    const manifest = readJson<PackageManifest>("package.json");
    const blocks = {
      test: executable(service("test")),
      e2e: executable(service("e2e")),
      lint: executable(service("lint")),
      typecheck: executable(service("typecheck")),
      assets: executable(service("assets")),
    };

    expect(blocks.test).toMatch(/command:\s*\[\s*"npm",\s*"test"\s*\]/);
    expect(blocks.lint).toMatch(/"npm",\s*"run",\s*"lint"/);
    expect(blocks.typecheck).toMatch(/"npm",\s*"run",\s*"typecheck"/);
    expect(blocks.assets).toMatch(/"npm",\s*"run",\s*"assets:build"/);
    expect(blocks.e2e).toContain("npm run build:e2e");
    expect(blocks.e2e).toContain("npm run test:e2e");

    // WORLD-16: the production bundle and the browser-test bundle are two
    // scripts; the latter carries the traffic default off.
    expect(script(manifest, "build")).toBe("vite build");
    expect(script(manifest, "build:e2e")).toBe(
      "vite build --config vite.e2e.config.ts",
    );
    expect(script(manifest, "test")).toBe("vitest run --coverage");
    expect(script(manifest, "lint")).toBe("eslint . && prettier --check .");
    expect(script(manifest, "typecheck")).toBe(
      "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit",
    );
    // D-09: verify runs the Chromium project only; the Firefox project is a
    // separate script, and its xvfb-run wrapper is the owner's firefox-xvfb mode.
    expect(script(manifest, "test:e2e")).toBe(
      "playwright test --project=chromium",
    );
    expect(script(manifest, "test:e2e:cross")).toBe(
      "xvfb-run -a playwright test --project=firefox --workers=1",
    );
    // WR-04: the seam spec has its own config, so it can be invoked separately
    // instead of building the test-only bundle on every Playwright run.
    expect(script(manifest, "test:e2e:seams")).toBe(
      "playwright test --config=playwright.seams.config.ts",
    );

    // Owner option B (2026-11-08): the fast gate ends in a Chromium-only smoke
    // subset (D-09) made of whole spec files. Pin the exact script and require
    // each listed spec to exist, so a rename or delete cannot silently shrink it.
    // The probe-shape spec joined the fast gate for the Phase 8 split (D-12, D-13).
    const fast = script(manifest, "test:e2e:fast");
    expect(fast).toBe(
      "playwright test --project=chromium tests/e2e/scene.spec.ts tests/e2e/docking.spec.ts tests/e2e/save-load.spec.ts tests/e2e/probe-shape.spec.ts",
    );
    const specPaths = fast.match(/tests\/e2e\/[a-z-]+\.spec\.ts/g) ?? [];
    expect(specPaths).toHaveLength(4);
    for (const specPath of specPaths) {
      expect(existsSync(join(REPO_ROOT, specPath))).toBe(true);
    }
  });

  it("runs verify as one fail-fast chain in dependency order", () => {
    const verify = executable(service("verify")).replace(/\s+/g, " ").trim();
    const chainAt = verify.indexOf("npm run lint");

    // YAML renders the argv as separate list items: `- sh`, `- -lc`, `- >-`.
    expect(verify).toMatch(/command: - sh - -lc - >- npm run lint/);
    expect(chainAt).toBeGreaterThanOrEqual(0);
    // The exact chain is the contract: `&&` (not `;`) is what makes the first
    // failing stage short-circuit (D-03).
    expect(verify.slice(chainAt)).toBe(
      "npm run lint && npm run typecheck && npm run assets:check && npm run test && npm run build:e2e && npm run check:dist && npm run test:e2e:fast",
    );
  });

  it("runs verify-full as the same fail-fast chain with the full browser suite", () => {
    const verifyFull = executable(service("verify-full"))
      .replace(/\s+/g, " ")
      .trim();
    const chainAt = verifyFull.indexOf("npm run lint");

    expect(verifyFull).toMatch(/command: - sh - -lc - >- npm run lint/);
    expect(chainAt).toBeGreaterThanOrEqual(0);
    expect(verifyFull.slice(chainAt)).toBe(
      "npm run lint && npm run typecheck && npm run assets:check && npm run test && npm run build:e2e && npm run check:dist && npm run test:e2e && npm run test:e2e:seams",
    );
  });

  it("runs verify-checks as verify-full without the Chromium suite", () => {
    const normalise = (name: string): string => {
      const block = executable(service(name)).replace(/\s+/g, " ").trim();
      expect(block).toMatch(/command: - sh - -lc - >- npm run lint/);
      const chainAt = block.indexOf("npm run lint");
      expect(chainAt).toBeGreaterThanOrEqual(0);
      return block.slice(chainAt);
    };
    const fullStages = normalise("verify-full").split(" && ");
    const checksStages = normalise("verify-checks").split(" && ");

    // CI runs the Chromium suite as four shards beside this service, so the
    // only stage it may drop is verify-full's one full Chromium run. The
    // expectation is derived from verify-full, so a stage added there alone
    // fails here.
    expect(
      fullStages.filter((stage) => stage === "npm run test:e2e"),
    ).toHaveLength(1);
    expect(checksStages).toEqual(
      fullStages.filter((stage) => stage !== "npm run test:e2e"),
    );
    // The WR-04 seam spec starts Chromium.
    expect(executable(service("verify-checks"))).toMatch(
      /^\s*ipc:\s*host\s*$/m,
    );
  });

  it("runs CI as one checks job and four Chromium shards behind one aggregate verify job", () => {
    const workflow = read(".github/workflows/verify.yml");

    // pages.yml triggers on the workflow name, so it must not change.
    expect(workflow).toMatch(/^name: verify$/m);
    expect(workflow).toContain("docker compose run --rm verify-checks");
    expect(workflow).toContain("fail-fast: false");
    expect(workflow).toContain("shard: [1, 2, 3, 4]");
    expect(workflow).toContain(
      "npm run build:e2e && npm run test:e2e -- --shard=${{ matrix.shard }}/4",
    );
    expect(workflow).toContain("needs: [checks, e2e]");

    // The aggregate job itself, region-scoped so a match in another job cannot
    // satisfy it: it runs even when a dependency failed (`!cancelled()`), and
    // it passes only when the checks job and every shard succeeded, so a
    // skipped or failed dependency cannot leave the required check green.
    const aggregateStart = workflow.indexOf("\n  verify:\n");
    expect(aggregateStart).toBeGreaterThan(-1);
    const aggregate = workflow.slice(aggregateStart);
    expect(aggregate).toContain("needs: [checks, e2e]");
    expect(aggregate).toContain("if: ${{ !cancelled() }}");
    expect(aggregate).toContain("CHECKS_RESULT: ${{ needs.checks.result }}");
    expect(aggregate).toContain("E2E_RESULT: ${{ needs.e2e.result }}");
    expect(aggregate).toContain(
      'test "$CHECKS_RESULT" = "success" && test "$E2E_RESULT" = "success"',
    );
    // CI must not run the whole release chain again on top of the split jobs.
    expect(workflow).not.toMatch(/^\s*run:.*verify-full/m);

    const pages = read(".github/workflows/pages.yml");
    expect(pages).toContain("workflows: [verify]");
    expect(pages).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
  });

  it("documents verify as the definition of done and keeps the fail-fast rehearsal", () => {
    const readme = read("README.md");
    const failFast = read("scripts/check-verify-fails-fast.sh");

    expect(readme).toContain("docker compose run --rm verify");
    expect(readme).toContain("definition of done");

    // The rehearsal must capture the status explicitly, require non-zero, and
    // name the seeded violation so an unrelated failure cannot satisfy it.
    expect(failFast).toContain("set +e");
    expect(failFast).toContain("docker compose run --rm verify");
    expect(failFast).toMatch(/\[ "\$status" -eq 0 \]/);
    expect(failFast).toContain("no-restricted-imports");
    expect(failFast).toContain("trap ");
    expect(failFast).not.toMatch(/src\/sim\/__verify_probe\.ts.*\n.*git add/);
  });
});

describe("the traffic default never reaches the deployed bundle (WORLD-16, owner decision 1)", () => {
  /** The define's value in a config file, or undefined when it is not defined. */
  function trafficDefaultOf(relativePath: string): string | undefined {
    return /__WEGOLITE_TRAFFIC_DEFAULT__:\s*"([^"]*)"/.exec(
      read(relativePath),
    )?.[1];
  }

  it("defines the default true in production and false only in the two test configs", () => {
    expect(trafficDefaultOf("vite.config.ts")).toBe("true");
    expect(trafficDefaultOf("vite.e2e.config.ts")).toBe("false");
    expect(trafficDefaultOf("vite.seams.config.ts")).toBe("false");
    // The browser-test bundle keeps the default `dist/` output that the
    // Playwright webServer serves; it must not redirect it.
    expect(read("vite.e2e.config.ts")).not.toMatch(/outDir/);
  });

  it("keeps the production build in preview and the Pages deploy, never the e2e bundle", () => {
    const preview = executable(service("preview"));
    expect(preview).toContain("npm run build && npm run preview");
    expect(preview).not.toContain("build:e2e");

    const pages = read(".github/workflows/pages.yml");
    expect(pages).toContain('npm run build && npm run check:dist"');
    expect(pages).not.toContain("build:e2e");
  });

  it("builds the e2e bundle in exactly the five browser-test services", () => {
    const users = [...SERVICES.keys()].filter((name) =>
      executable(service(name)).includes("npm run build:e2e"),
    );
    expect(users.sort()).toEqual([
      "e2e",
      "e2e-cross",
      "verify",
      "verify-checks",
      "verify-full",
    ]);
  });
});

describe("FOUND-04 pinned and baked image", () => {
  it("pins the single external base image by index digest and never uses :latest", () => {
    const dockerfile = read("Dockerfile");
    const fromLines = dockerfile
      .split("\n")
      .filter((line) => line.startsWith("FROM "));
    const pinned = fromLines.filter((line) => line.includes("@sha256:"));

    // Six stages (the cross stage was added for e2e-cross, D-09). Exactly one
    // may pull an external image, and that image must be the digest-pinned Node
    // baseline. Every other stage must build on an earlier stage of this
    // Dockerfile.
    expect(fromLines).toHaveLength(6);
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toMatch(
      /^FROM node:24-bookworm-slim@sha256:[0-9a-f]{64} AS base$/,
    );
    for (const line of fromLines.filter((line) => !line.includes("@sha256:"))) {
      expect(line).toMatch(/^FROM (base|deps|ci|preview|dev|cross) AS [a-z]+$/);
    }
    expect(dockerfile).not.toMatch(/^FROM [^\n]*:latest/m);
  });

  it("caches the dependency layer and pins every package exactly", () => {
    const dockerfile = read("Dockerfile");
    const manifestCopyAt = dockerfile.indexOf(
      "COPY package.json package-lock.json",
    );
    const treeCopyAt = dockerfile.indexOf("COPY . .");

    expect(dockerfile).toContain("npm ci");
    expect(manifestCopyAt).toBeGreaterThanOrEqual(0);
    expect(treeCopyAt).toBeGreaterThan(manifestCopyAt);
    expect(read(".dockerignore").split("\n")).toContain("node_modules");
    expect(existsSync(join(REPO_ROOT, "package-lock.json"))).toBe(true);

    const manifest = readJson<PackageManifest>("package.json");
    for (const [name, version] of Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })) {
      expect(version, `${name} must be pinned exactly`).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
    }
  });

  it("bakes Chromium and never downloads a browser at test time", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("PLAYWRIGHT_BROWSERS_PATH=/ms-playwright");
    expect(dockerfile).toMatch(
      /^RUN npx playwright install --with-deps chromium/m,
    );

    // No runtime surface may re-download a browser: the install belongs to the
    // image build only.
    for (const path of [
      "package.json",
      "compose.yaml",
      "scripts/smoke-dev.sh",
      "scripts/smoke-preview.sh",
      "scripts/check-verify-fails-fast.sh",
    ]) {
      expect(read(path), `${path} must not install browsers`).not.toMatch(
        /playwright\s+install/,
      );
    }
  });

  it("installs Firefox only in the cross stage and Chromium only in ci", () => {
    const dockerfile = read("Dockerfile");
    const stages = dockerfile
      .split(/^(?=FROM )/m)
      .filter((stage) => stage.startsWith("FROM "));
    const nameOf = (stage: string): string =>
      /^FROM \S+ AS (\S+)$/m.exec(stage)?.[1] ?? "";

    const installing = stages
      .filter((stage) => /playwright install/.test(stage))
      .map(nameOf);
    expect(installing).toEqual(["ci", "cross"]);

    const ci = stages.find((stage) => nameOf(stage) === "ci") ?? "";
    const cross = stages.find((stage) => nameOf(stage) === "cross") ?? "";
    expect(ci).toMatch(/^RUN npx playwright install --with-deps chromium/m);
    expect(ci).not.toMatch(/firefox/i);
    expect(cross).toMatch(/^FROM ci AS cross$/m);
    expect(cross).toMatch(/npx playwright install --with-deps firefox/);
    expect(cross).toMatch(
      /apt-get install -y --no-install-recommends xvfb xauth/,
    );
    expect(cross).not.toMatch(/playwright install --with-deps chromium/);
  });

  it("resolves the baked Chromium from this container's image", () => {
    // This test runs in the `ci` image. The path and its Chromium directory
    // can only exist if the browser was installed at image-build time.
    const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (browsersPath === undefined) {
      throw new Error("PLAYWRIGHT_BROWSERS_PATH is not set in the test image");
    }
    expect(browsersPath).toBe("/ms-playwright");

    const entries = readdirSync(browsersPath);
    expect(entries.some((entry) => entry.startsWith("chromium-"))).toBe(true);
    expect(
      entries.some((entry) => entry.startsWith("chromium_headless_shell-")),
    ).toBe(true);
  });
});

describe("WR-04 seam build split", () => {
  it("keeps the test-only bundle out of the ordinary Playwright run", () => {
    const main = read("playwright.config.ts");
    const seams = read("playwright.seams.config.ts");
    const compose = read("compose.yaml");

    // The ordinary suite must not start the 4175 server: that was a second
    // full Vite build on every run, including the fast smoke subset and
    // single-spec invocations.
    expect(main).toContain("testIgnore: /hyperspace-failure");
    expect(main).not.toContain("4175");
    expect(main).not.toContain("vite.seams.config.ts");

    // The WR-04 spec keeps its own config, its own test-only build and its own
    // origin, so the positive control still has a freshly built bundle.
    expect(seams).toContain("testMatch: /hyperspace-failure");
    expect(seams).toContain("vite.seams.config.ts");
    expect(seams).toContain("4175");

    // The dedicated config is actually reachable from the container chains.
    expect(compose).toContain("npm run test:e2e:seams");
  });
});

describe("FOUND-09 documented container-only workflow", () => {
  it("documents every declared service with a runnable command in both guides", () => {
    const declared = [...SERVICES.keys()].sort();
    for (const guide of ["AGENTS.md", "README.md"]) {
      const targets = [...documentedTargets(read(guide))].sort();
      // Exact set equality: an undocumented service or a documented service
      // that no longer exists both fail.
      expect(targets, `${guide} command targets`).toEqual(declared);
    }
  });

  it("names no browser beyond Chromium and Firefox in the files it writes", () => {
    // D-07 claims only current stable Chrome and Firefox (T-07-26).
    for (const path of [
      "README.md",
      "AGENTS.md",
      "compose.yaml",
      "Dockerfile",
    ]) {
      expect(read(path), `${path} must not claim another browser`).not.toMatch(
        /safari|webkit/i,
      );
    }
  });

  it("states the container-only rule and the operational traps", () => {
    const agents = read("AGENTS.md");
    const readme = read("README.md");
    const env = read(".env.example");

    expect(agents).toContain("Everything runs in Docker");
    expect(agents).toContain("Tests pass only in the container");
    expect(agents).toContain("docker compose run --rm verify");
    expect(agents).toContain("5173");
    expect(agents).toContain("4173");
    expect(agents).toContain("VITE_USE_POLLING");
    expect(agents).toContain("down --volumes");
    expect(agents).toMatch(/bind-mounts?/);

    expect(readme).toContain("Every process");
    expect(readme).toContain("runs in Docker");
    expect(readme).toContain("5173");
    expect(readme).toContain("4173");
    expect(readme).toContain("VITE_USE_POLLING");
    expect(readme).toContain("down --volumes");
    expect(readme).toMatch(/bind-mounts?/);

    expect(env).toContain("VITE_USE_POLLING");
  });

  it("names no npm script that does not exist", () => {
    // Every `npm run X` the Compose file or the guides invoke must exist in
    // package.json; this is the "commands work verbatim" half that a rename
    // would otherwise break silently.
    const manifest = readJson<PackageManifest>("package.json");
    const surfaces = [COMPOSE_TEXT, read("AGENTS.md"), read("README.md")];
    const invoked = new Set<string>();
    for (const surface of surfaces) {
      for (const match of surface.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
        const name = match[1];
        if (name !== undefined) invoked.add(name);
      }
    }

    expect(invoked.size).toBeGreaterThan(0);
    for (const name of invoked) {
      expect(manifest.scripts, `missing npm script "${name}"`).toHaveProperty(
        name,
      );
    }
  });
});
