// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The boot failure taxonomy (T-3-21, WORLD-05).
 *
 * This is the honest proof for the content-manifest contract: `manifest.json` is
 * a build-time module import bundled into the app chunk, not a runtime fetch, so
 * a Playwright `page.route` on it never fires. Injecting an invalid manifest
 * into `bootApp` here is the only test that can actually exercise the boundary.
 *
 * Both directions are asserted so the two failure classes stay distinct:
 *
 * - invalid manifest → a named `ContentBoundaryError` and a never-called renderer
 *   factory (moving the assert inside the renderer `try` fails this test);
 * - valid manifest + throwing factory → `{ ok: false, reason }`, no throw.
 */

import { describe, expect, it, vi } from "vitest";

import { bootApp } from "../../src/app/boot.js";
import { ContentBoundaryError } from "../../src/content/index.js";
import manifest from "../../src/content/generated/manifest.json";

const fakeCanvas = {} as unknown as HTMLCanvasElement;

function captureThrow(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected bootApp to throw");
}

describe("bootApp failure taxonomy", () => {
  it("throws a named ContentBoundaryError before the renderer exists", () => {
    const factory = vi.fn(() => {
      throw new Error("the renderer factory must not run for a bad manifest");
    });

    const error = captureThrow(() =>
      bootApp({ manifest: {}, canvas: fakeCanvas, rendererFactory: factory }),
    );

    expect(error).toBeInstanceOf(ContentBoundaryError);
    expect((error as Error).name).toBe("ContentBoundaryError");
    // `{}` fails on the two literal fields, so the message must name a real
    // path, not only the anonymous root.
    expect((error as Error).message).toMatch(/format/);
    expect((error as Error).message).toMatch(/schemaVersion/);
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns { ok: false } instead of throwing when the renderer cannot be created", async () => {
    const factory = vi.fn(() => {
      throw new Error("no WebGL2 here");
    });

    const result = await bootApp({
      manifest,
      canvas: fakeCanvas,
      rendererFactory: factory,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/WebGL2/);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
