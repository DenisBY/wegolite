// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The label record loader (ECON-07, D-05).
 *
 * `labels.json` is a build artifact, so the loader is the trust boundary
 * between the emitted templates and the system information card. Every array
 * length and every `sysdata-*` key the card reads is pinned here; a malformed
 * record throws a named `LabelsError` instead of reaching the view model.
 *
 * This file deliberately imports no UI module: the unknown-token model cases
 * belong to `tests/ui/station-system-data.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { LabelsError, parseLabels } from "../../src/content/labels.js";
import { labelsFixture } from "../helpers/labels.js";

const SIX_ARRAY_KEYS = [
  "economy",
  "government",
  "legalStatus",
  "rating",
  "inhabitants",
  "systemDescription",
] as const;

const SYSTEM_TEMPLATE_KEYS = [
  "sysdata-data-on-system",
  "sysdata-eco",
  "sysdata-govt",
  "sysdata-tl",
  "sysdata-pop",
  "sysdata-prod",
  "sysdata-radius",
  "sysdata-distance",
  "sysdata-tl-value",
  "sysdata-pop-value",
  "sysdata-prod-value",
  "sysdata-radius-value",
] as const;

describe("parseLabels", () => {
  it("validates the committed record with the pinned array lengths", () => {
    const labels = labelsFixture();

    expect(labels.economy).toHaveLength(8);
    expect(labels.government).toHaveLength(8);
    expect(labels.legalStatus).toHaveLength(3);
    expect(labels.rating).toHaveLength(9);
    expect(labels.inhabitants).toHaveLength(5);
    expect(labels.systemDescription).toHaveLength(36);
  });

  it("carries every template the system information card reads", () => {
    const labels = labelsFixture();

    for (const key of SYSTEM_TEMPLATE_KEYS) {
      expect(labels.formatTemplates[key], key).toBeTypeOf("string");
    }
  });

  it("rejects a non-record", () => {
    expect(() => parseLabels([])).toThrow(LabelsError);
    expect(() => parseLabels(null)).toThrow(LabelsError);
  });

  it("rejects a record with a missing array", () => {
    const labels = labelsFixture();
    const missing: Record<string, unknown> = { ...labels };
    delete missing.systemDescription;

    expect(() => parseLabels(missing)).toThrow(LabelsError);
  });

  it("rejects an array of the wrong length", () => {
    const labels = labelsFixture();

    expect(() =>
      parseLabels({ ...labels, economy: labels.economy.slice(1) }),
    ).toThrow(LabelsError);
  });

  it("names the first failing path", () => {
    const labels = labelsFixture();

    expect(() =>
      parseLabels({ ...labels, legalStatus: ["Clean", 7, "Fugitive"] }),
    ).toThrow(/legalStatus\.1/);
  });

  it("rejects a non-string template", () => {
    const labels = labelsFixture();

    expect(() =>
      parseLabels({
        ...labels,
        formatTemplates: { ...labels.formatTemplates, "sysdata-eco": 5 },
      }),
    ).toThrow(LabelsError);
  });

  it("rejects a record with no formatTemplates", () => {
    const labels = labelsFixture();
    const withoutTemplates: Record<string, unknown> = { ...labels };
    delete withoutTemplates.formatTemplates;

    expect(() => parseLabels(withoutTemplates)).toThrow(LabelsError);
  });

  it("keeps the six arrays it knows about", () => {
    const labels = labelsFixture();

    for (const key of SIX_ARRAY_KEYS) {
      expect(labels[key]).toBeDefined();
    }
  });
});
