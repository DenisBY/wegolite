// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Goldens for the label projection (DATA-07, D-23, T-02-14).
 *
 * `descriptions.plist` carries 1,144 top-level keys; only six label arrays and
 * the `sysdata-*` format templates belong in `labels.json`. The pinned snapshot
 * has **no** tech-level label array — the tech-level display is the
 * `sysdata-tl-value` template plus the raw + 1 rule (D-25), so this suite also
 * proves no TL table was invented.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LabelsSchema } from "../../../src/content/schemas/labels.js";
import { parseOpenStep } from "../openstep/parser.js";
import { compileLabels } from "./labels.js";

const PLIST = "third_party/oolite/Config/descriptions.plist";

const source = readFileSync(
  new URL(
    "../../../third_party/oolite/Config/descriptions.plist",
    import.meta.url,
  ),
  "utf8",
);

const labels = compileLabels(parseOpenStep(source, PLIST));

describe("label arrays", () => {
  it("emits the six measured arrays with their exact lengths", () => {
    expect(labels.economy).toHaveLength(8);
    expect(labels.government).toHaveLength(8);
    expect(labels.legalStatus).toHaveLength(3);
    expect(labels.rating).toHaveLength(9);
    expect(labels.inhabitants).toHaveLength(5);
    expect(labels.systemDescription).toHaveLength(36);
  });

  it("keeps the authored strings verbatim, including the star glyphs", () => {
    expect(labels.economy[0]).toBe("Rich Industrial");
    expect(labels.economy[7]).toBe("Poor Agricultural");
    expect(labels.government[0]).toBe("Anarchy");
    expect(labels.government[7]).toBe("Corporate State");
    expect(labels.legalStatus).toEqual(["Clean", "Offender", "Fugitive"]);
    expect(labels.rating[0]).toBe("Harmless");
    expect(labels.rating[7]).toBe("☆ Deadly ☆");
    expect(labels.rating[8]).toBe("★★★ E L I T E ★★★");
  });

  it("keeps the nested adjective and system-description pools", () => {
    for (const pool of labels.inhabitants)
      expect(pool.length).toBeGreaterThan(0);
    for (const pool of labels.systemDescription) {
      expect(pool.length).toBeGreaterThan(0);
    }
    expect(labels.inhabitants[0]).toContain("Large");
    expect(labels.inhabitants[4]).toContain("Rodents");
    expect(labels.systemDescription[0]).toContain("fabled");
  });

  it("collects the sysdata format templates verbatim, including the TL template", () => {
    expect(labels.formatTemplates["sysdata-tl-value"]).toBe("[techLevel]");
    expect(labels.formatTemplates["sysdata-eco"]).toBe("Economy:");
    expect(labels.formatTemplates["sysdata-pop-value"]).toBe(
      "[population|multiply:0.1|precision:1] Billion",
    );
    expect(labels.formatTemplates["sysdata-radius-value"]).toBe("[radius] km");
    expect(Object.keys(labels.formatTemplates)).toHaveLength(34);
    const keys = Object.keys(labels.formatTemplates);
    expect(keys).toEqual([...keys].sort());
  });

  it("validates against the strict labels schema", () => {
    expect(LabelsSchema.safeParse(labels).success).toBe(true);
    expect(LabelsSchema.safeParse({ ...labels, rating: [] }).success).toBe(
      false,
    );
  });

  it("invents no tech-level label array", () => {
    for (const key of Object.keys(labels)) {
      expect(/tech/i.test(key)).toBe(false);
    }
    expect(Object.keys(labels)).toEqual([
      "economy",
      "government",
      "legalStatus",
      "rating",
      "inhabitants",
      "systemDescription",
      "formatTemplates",
    ]);
    // The only tech-level artefact is the format template, and it is a string.
    expect(typeof labels.formatTemplates["sysdata-tl-value"]).toBe("string");
  });
});
