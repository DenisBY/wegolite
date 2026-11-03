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
 * Handoff to plan 07: this case checks only that every `images[].uri` is a
 * well-formed `textures/` path. The files do not exist yet — plan 07 vendors
 * them and extends this spec to fetch each one and assert its bytes.
 */

import { expect, test } from "@playwright/test";

const GLB_MAGIC = 0x46546c67;
const TEXTURES_PREFIX = "/textures/";

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
    return {
      magic: view.getUint32(0, true),
      version: view.getUint32(4, true),
      declaredLength: view.getUint32(8, true),
      byteLength: bytes.byteLength,
      json,
      imagePaths: json.images.map((image) => new URL(image.uri, base).pathname),
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
