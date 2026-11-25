// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC ship models are fetchable on demand and decode (DATA-13, D-07).
 *
 * Division of labour:
 *
 * - `tools/oolite-ingest/convert/glb.test.ts` proves geometry and materials with
 *   an independent reader;
 * - `tests/e2e/models.spec.ts` proves the delivery path of the first-load GLBs;
 * - this spec proves that each of the NPC GLBs (nine today), and every image it
 *   references, is served by the built preview and decodes in a real browser.
 *   The cold start must request none of them; `budget.spec.ts` asserts that.
 * - its second test (Phase 16, plan 16-09) proves the same of the seven debris
 *   models (`ships-debris.json`) and every image they reference, and decodes
 *   the two explosion particle textures.
 *
 * `GLTFLoader` is not used: the built bundle does not expose three's addon as a
 * URL-importable module, and a second Vite entry point for a test is a larger
 * change than this property needs. `createImageBitmap` is the browser's own
 * decode of the image bytes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const GLB_MAGIC = 0x46546c67;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** "RIFF", four size bytes, then "WEBP". */
const RIFF_TAG = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];

interface ImageResult {
  readonly path: string;
  readonly status: number;
  readonly signature: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly error: string | null;
}

interface GlbResult {
  readonly glb: string;
  readonly status: number;
  readonly magic: number;
  readonly version: number;
  readonly declaredLength: number;
  readonly byteLength: number;
  readonly images: readonly ImageResult[];
}

const records = JSON.parse(
  readFileSync(
    join(process.cwd(), "src", "content", "generated", "ships-npc.json"),
    "utf8",
  ),
) as readonly { readonly glb: string }[];
const glbPaths = records.map((record) => record.glb);

/**
 * Fetch each GLB from the preview, read its header and JSON chunk, then fetch
 * and decode every image it references. Runs in the page (serialised by
 * `page.evaluate`), so it uses no module binding.
 */
async function fetchGlbs(paths: readonly string[]): Promise<GlbResult[]> {
  const out: GlbResult[] = [];
  for (const glb of paths) {
    const base = new URL(`./${glb}`, window.location.href);
    const response = await fetch(base.href);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(
      new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)),
    ) as { images?: { uri: string }[] };
    const images: ImageResult[] = [];
    for (const image of json.images ?? []) {
      const url = new URL(image.uri, base);
      const imageResponse = await fetch(url.href);
      const blob = await imageResponse.blob();
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      let width = 0;
      let height = 0;
      let error: string | null = null;
      try {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch (cause) {
        error = String(cause);
      }
      images.push({
        path: url.pathname,
        status: imageResponse.status,
        signature: Array.from(head),
        width,
        height,
        error,
      });
    }
    out.push({
      glb,
      status: response.status,
      magic: view.getUint32(0, true),
      version: view.getUint32(4, true),
      declaredLength: view.getUint32(8, true),
      byteLength: bytes.byteLength,
      images,
    });
  }
  return out;
}

test("each NPC role model is fetchable on demand and every texture it references decodes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");

  const results = await page.evaluate(fetchGlbs, glbPaths);

  // Plan 21-04: the model count follows the compiled records (9 today), so the
  // roster plan grows the catalogue without editing this spec; the floor keeps
  // it from passing on an empty catalogue.
  expect(glbPaths.length, "NPC model count (vacuity guard)").toBeGreaterThan(0);
  expect(results, "NPC model count").toHaveLength(records.length);
  const imagePaths = new Set<string>();
  for (const result of results) {
    const label = result.glb;
    expect(result.status, label).toBe(200);
    expect(result.magic, label).toBe(GLB_MAGIC);
    expect(result.version, label).toBe(2);
    expect(result.declaredLength, label).toBe(result.byteLength);
    expect(
      result.images.filter((image) => image.path.endsWith(".webp")).length,
      `${label} WebP images`,
    ).toBeGreaterThan(0);
    for (const image of result.images) {
      const where = `${label} ${image.path}`;
      imagePaths.add(image.path);
      expect(image.path, where).toContain("/textures/");
      expect(image.status, where).toBe(200);
      if (image.path.endsWith(".webp")) {
        expect(image.signature.slice(0, 4), where).toEqual(RIFF_TAG);
        expect(image.signature.slice(8, 12), where).toEqual(WEBP_TAG);
      } else {
        expect(image.path, where).toMatch(/_emissive\.png$/);
        expect(image.signature.slice(0, 8), where).toEqual(PNG_SIGNATURE);
      }
      expect(image.error, `${where} decode error`).toBeNull();
      expect(image.width, `${where} width`).toBeGreaterThan(0);
      expect(image.height, `${where} height`).toBeGreaterThan(0);
    }
  }
  expect(imagePaths.size, "unique NPC image paths").toBe(43);
});

const debrisRecords = JSON.parse(
  readFileSync(
    join(process.cwd(), "src", "content", "generated", "ships-debris.json"),
    "utf8",
  ),
) as readonly { readonly glb: string }[];
const debrisGlbPaths = debrisRecords.map((record) => record.glb);
/** The cloud texture of `explosions.json` and Oolite's flash texture. */
const PARTICLE_PATHS = [
  "textures/oolite-particle-cloud2.png",
  "textures/oolite-particle-flash.png",
];

test("each debris model and every image it references decode, and so do both particle textures", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");

  const results = await page.evaluate(fetchGlbs, debrisGlbPaths);
  expect(results, "debris model count").toHaveLength(7);
  const imagePaths = new Set<string>();
  for (const result of results) {
    const label = result.glb;
    expect(result.status, label).toBe(200);
    expect(result.magic, label).toBe(GLB_MAGIC);
    expect(result.version, label).toBe(2);
    expect(result.declaredLength, label).toBe(result.byteLength);
    expect(result.images.length, `${label} images`).toBeGreaterThan(0);
    for (const image of result.images) {
      const where = `${label} ${image.path}`;
      imagePaths.add(image.path);
      expect(image.path, where).toContain("/textures/");
      expect(image.status, where).toBe(200);
      if (image.path.endsWith(".webp")) {
        expect(image.signature.slice(0, 4), where).toEqual(RIFF_TAG);
        expect(image.signature.slice(8, 12), where).toEqual(WEBP_TAG);
      } else {
        expect(image.path, where).toMatch(/_emissive\.png$/);
        expect(image.signature.slice(0, 8), where).toEqual(PNG_SIGNATURE);
      }
      expect(image.error, `${where} decode error`).toBeNull();
      expect(image.width, `${where} width`).toBeGreaterThan(0);
      expect(image.height, `${where} height`).toBeGreaterThan(0);
    }
  }
  expect(imagePaths.size, "unique debris image paths").toBe(6);

  const particles: ImageResult[] = await page.evaluate(async (paths) => {
    const out: ImageResult[] = [];
    for (const path of paths) {
      const url = new URL(`./${path}`, window.location.href);
      const response = await fetch(url.href);
      const blob = await response.blob();
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      let width = 0;
      let height = 0;
      let error: string | null = null;
      try {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch (cause) {
        error = String(cause);
      }
      out.push({
        path: url.pathname,
        status: response.status,
        signature: Array.from(head),
        width,
        height,
        error,
      });
    }
    return out;
  }, PARTICLE_PATHS);
  expect(particles, "particle texture count").toHaveLength(2);
  for (const particle of particles) {
    const where = particle.path;
    expect(particle.status, where).toBe(200);
    expect(particle.signature.slice(0, 8), where).toEqual(PNG_SIGNATURE);
    expect(particle.error, `${where} decode error`).toBeNull();
    expect(particle.width, `${where} width`).toBeGreaterThan(0);
    expect(particle.height, `${where} height`).toBeGreaterThan(0);
  }
});
