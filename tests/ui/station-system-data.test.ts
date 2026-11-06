// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F7 system-data view model (ECON-07, D-05).
 *
 * The title and the seven field labels come from the compiled `sysdata-*`
 * templates; the four value templates are expanded in one pass with a replacer
 * function, never a replacement string (which would interpret `$&`, `$'` and
 * `$1` in a value). A missing key or a leftover token throws
 * `StationModelError`, never passes through as generated prose.
 */

import { describe, expect, it } from "vitest";

import type { Labels } from "../../src/content/types.js";
import {
  StationModelError,
  buildSystemDataModel,
} from "../../src/ui/station-model.js";
import { labelsFixture } from "../helpers/labels.js";
import { laveFixture } from "../helpers/lave.js";

const system = laveFixture().system;
const labels = labelsFixture();

function withTemplates(overrides: Readonly<Record<string, string>>): Labels {
  return {
    ...labels,
    formatTemplates: { ...labels.formatTemplates, ...overrides },
  };
}

function labelOf(
  model: ReturnType<typeof buildSystemDataModel>,
  label: string,
): string | undefined {
  return model.fields.find((field) => field.label === label)?.value;
}

describe("buildSystemDataModel", () => {
  it("renders the separate Lave title", () => {
    expect(buildSystemDataModel(system, labels).title).toBe("Data on Lave");
  });

  it("renders exactly seven sysdata fields plus the inhabitants row", () => {
    const model = buildSystemDataModel(system, labels);

    expect(model.fields).toHaveLength(8);
    expect(
      model.fields.filter((field) => field.label.endsWith(":")),
    ).toHaveLength(7);
    expect(labelOf(model, "Inhabitants")).toBe("(Human Colonials)");
  });

  it("renders every Lave value verbatim", () => {
    const model = buildSystemDataModel(system, labels);

    expect(labelOf(model, "Economy:")).toBe("Rich Agricultural");
    expect(labelOf(model, "Government:")).toBe("Dictatorship");
    expect(labelOf(model, "Tech Level:")).toBe("5");
    expect(labelOf(model, "Population:")).toBe("2.5 Billion");
    expect(labelOf(model, "Gross productivity:")).toBe("7000 M₢");
    expect(labelOf(model, "Average radius:")).toBe("4116 km");
    expect(labelOf(model, "Distance:")).toBe("0.0 ly");
  });

  it("returns the compiled system description verbatim", () => {
    expect(buildSystemDataModel(system, labels).description).toBe(
      "Lave is most famous for its vast rain forests and the Laveian tree grub.",
    );
  });

  it("expands a value containing `$&`, `$'` and `$1` verbatim", () => {
    const model = buildSystemDataModel(
      system,
      withTemplates({
        "sysdata-prod-value": "[productivity] $& $' $1",
      }),
    );

    expect(labelOf(model, "Gross productivity:")).toBe("7000 $& $' $1");
  });

  it("throws StationModelError for a leftover token", () => {
    expect(() =>
      buildSystemDataModel(
        system,
        withTemplates({ "sysdata-radius-value": "[radius] [mystery]" }),
      ),
    ).toThrow(StationModelError);
  });

  it("throws StationModelError for a missing label key", () => {
    const templates = { ...labels.formatTemplates };
    delete templates["sysdata-eco"];

    expect(() =>
      buildSystemDataModel(system, { ...labels, formatTemplates: templates }),
    ).toThrow(StationModelError);
  });
});
