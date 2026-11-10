// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The browser delivery path for the generated GLBs (DATA-04, DATA-07, D-05).
 *
 * Division of labour with `tools/oolite-ingest/convert/glb.test.ts`:
 *
 * - there, `NodeIO` proves the bytes parse as glTF and that the geometry,
 *   accessors and material graph are what the writer meant;
 * - here, a real Chromium proves the *delivery path* — that `vite build` copied
 *   `public/models/` into `dist/`, that the relative URLs survive the `base:
 *   "./"` preview, and that the JSON chunk a consumer reads in the browser is
 *   the same one the tests pinned.
 *
 * That is the failure mode `NodeIO` cannot see: a GLB missing from `dist/`, or a
 * URL that only works from the repository. `GLTFLoader` is deliberately not
 * used — the built bundle does not expose three's addon as a URL-importable
 * module, and adding a second Vite entry point for a test is a larger change
 * than this property needs.
 *
 * Handoff from plan 07: this case now fetches every `images[].uri` over the
 * preview server and asserts its signature (WebP for the re-encoded ship and
 * station textures, PNG for the baked emissive maps). A URI that points at a missing
 * file, or at the wrong directory after a `base: "./"` regression, fails here.
 */

import { expect, test } from "@playwright/test";

const GLB_MAGIC = 0x46546c67;
const TEXTURES_PREFIX = "/textures/";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** "RIFF", four size bytes, then "WEBP". */
const RIFF_TAG = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];

interface ImageCheck {
  readonly path: string;
  readonly status: number;
  readonly signature: readonly number[];
}

interface GlbRead {
  readonly magic: number;
  readonly version: number;
  readonly declaredLength: number;
  readonly byteLength: number;
  readonly json: {
    readonly nodes: readonly {
      readonly name: string;
      readonly translation?: readonly number[];
    }[];
    readonly meshes: readonly {
      readonly name: string;
      readonly primitives: readonly unknown[];
    }[];
    readonly materials: readonly { readonly name: string }[];
    readonly images: readonly { readonly uri: string }[];
  };
  readonly imagePaths: readonly string[];
  readonly imageChecks: readonly ImageCheck[];
}

interface ReadResult {
  readonly cobra: GlbRead;
  readonly coriolis: GlbRead;
}

const result = async (): Promise<ReadResult> => {
  const read = async (relative: string): Promise<GlbRead> => {
    const response = await fetch(relative);
    if (!response.ok) {
      throw new Error(`${relative} responded ${String(response.status)}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(
      new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)),
    ) as GlbRead["json"];
    const base = new URL(relative, window.location.href);
    const imageChecks = await Promise.all(
      json.images.map(async (image) => {
        const url = new URL(image.uri, base);
        const response = await fetch(url.href);
        const bytes = new Uint8Array(await response.arrayBuffer());
        return {
          path: url.pathname,
          status: response.status,
          signature: Array.from(bytes.subarray(0, 12)),
        };
      }),
    );
    return {
      magic: view.getUint32(0, true),
      version: view.getUint32(4, true),
      declaredLength: view.getUint32(8, true),
      byteLength: bytes.byteLength,
      json,
      imagePaths: json.images.map((image) => new URL(image.uri, base).pathname),
      imageChecks,
    };
  };

  return {
    cobra: await read("./models/cobra3.glb"),
    coriolis: await read("./models/coriolis.glb"),
  };
};

test("the preview serves both GLBs and the Coriolis graph reads correctly", async ({
  page,
}) => {
  await page.goto("/");
  const glbs = await page.evaluate(result);

  for (const [label, glb] of [
    ["cobra3.glb", glbs.cobra],
    ["coriolis.glb", glbs.coriolis],
  ] as const) {
    expect(glb.magic, label).toBe(GLB_MAGIC);
    expect(glb.version, label).toBe(2);
    expect(glb.declaredLength, label).toBe(glb.byteLength);
    expect(glb.imagePaths.length, label).toBeGreaterThan(0);
    for (const path of glb.imagePaths) {
      expect(path, `${label} texture reference`).toContain(TEXTURES_PREFIX);
    }
    expect(glb.imageChecks.length, label).toBe(glb.imagePaths.length);
    for (const check of glb.imageChecks) {
      expect(check.path, `${label} texture reference`).toContain(
        TEXTURES_PREFIX,
      );
      expect(check.status, `${label} ${check.path}`).toBe(200);
      if (check.path.endsWith(".webp")) {
        expect(check.signature.slice(0, 4), `${label} ${check.path}`).toEqual(
          RIFF_TAG,
        );
        expect(check.signature.slice(8, 12), `${label} ${check.path}`).toEqual(
          WEBP_TAG,
        );
      } else {
        expect(check.path, `${label} texture reference`).toMatch(
          /_emissive\.png$/,
        );
        expect(check.signature.slice(0, 8), `${label} ${check.path}`).toEqual(
          PNG_SIGNATURE,
        );
      }
    }
    // The ship and station textures are served re-encoded, never as the PNGs.
    expect(
      glb.imagePaths.filter((path) => path.endsWith(".webp")).length,
      label,
    ).toBeGreaterThan(0);
  }

  const coriolis = glbs.coriolis.json;
  expect(coriolis.nodes.map((node) => node.name)).toEqual([
    "hull",
    "faceplate",
    "tris",
    "dock",
  ]);
  expect(coriolis.nodes[3]?.translation).toEqual([0, 0, -500.2561]);
  expect(coriolis.meshes).toHaveLength(4);
  expect(coriolis.materials).toHaveLength(4);

  const cobra = glbs.cobra.json;
  expect(cobra.materials).toHaveLength(2);
  expect(cobra.meshes).toHaveLength(1);
  expect(cobra.meshes[0]?.primitives).toHaveLength(2);
});
