// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared station footer contract (quick task 261110-fnh).
 *
 * The pure resolver is exercised directly; the DOM half is proved in
 * `tests/e2e/station-tabs.spec.ts` because this repository's Vitest project is
 * Node-only. The template contract is read from the shipped `index.html` with
 * `node:fs`, which is the only reliable Node-side proof that all three surfaces
 * will clone the same two-line markup.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FOOTER_STATUS_PRIORITY,
  resolveFooterStatus,
} from "../../src/ui/station-footer.js";

const REPO_ROOT = process.cwd();
const HTML = readFileSync(join(REPO_ROOT, "index.html"), "utf8");
// A CSS comment mentions a `<footer>` element; strip the whole style block
// before counting document tags so the contract check cannot pass or fail on
// prose.
const HTML_WITHOUT_STYLE = HTML.replace(/<style[\s\S]*?<\/style>/i, "");

describe("resolveFooterStatus", () => {
  it("uses the strict priority confirm > notice > save > info", () => {
    expect(FOOTER_STATUS_PRIORITY).toEqual([
      "confirm",
      "notice",
      "save",
      "info",
    ]);
    expect(
      resolveFooterStatus({
        confirm: "Buy 1 t Food? [Y/N]",
        notice: "Requires TL 9",
        save: "Save failed — progress not saved",
        info: "No system · -- · --",
      }),
    ).toEqual({ text: "Buy 1 t Food? [Y/N]", tone: "confirm" });
    expect(
      resolveFooterStatus({
        notice: "Requires TL 9",
        save: "Save failed — progress not saved",
        info: "No system · -- · --",
      }),
    ).toEqual({ text: "Requires TL 9", tone: "notice" });
    expect(
      resolveFooterStatus({
        save: "Save failed — progress not saved",
        info: "No system · -- · --",
      }),
    ).toEqual({ text: "Save failed — progress not saved", tone: "save" });
    expect(resolveFooterStatus({ info: "No system · -- · --" })).toEqual({
      text: "No system · -- · --",
      tone: "info",
    });
  });

  it("treats empty and whitespace-only parts as absent", () => {
    expect(resolveFooterStatus({})).toEqual({ text: "", tone: "" });
    expect(
      resolveFooterStatus({
        confirm: "",
        notice: "   ",
        save: "\t",
        info: "\n",
      }),
    ).toEqual({ text: "", tone: "" });
  });

  it("preserves the exact displayed text", () => {
    const text = "  Buy 1 t Food for 3.8 Cr? [Y/N]  ";
    expect(resolveFooterStatus({ confirm: text })).toEqual({
      text,
      tone: "confirm",
    });
    expect(resolveFooterStatus({ notice: "Requires TL 9 " })).toEqual({
      text: "Requires TL 9 ",
      tone: "notice",
    });
  });
});

describe("index.html station footer template", () => {
  it("contains exactly one inert two-line template", () => {
    const templateIds =
      HTML_WITHOUT_STYLE.match(
        /<template\b[^>]*id="station-footer-template"/g,
      ) ?? [];
    expect(templateIds).toHaveLength(1);

    const template =
      /<template id="station-footer-template">([\s\S]*?)<\/template>/.exec(
        HTML_WITHOUT_STYLE,
      );
    expect(template).not.toBeNull();
    const markup = template?.[1] ?? "";

    expect(markup.match(/data-station-footer/g) ?? []).toHaveLength(1);
    const paragraphs = [...markup.matchAll(/<p\b[^>]*>/g)].map(
      (match) => match[0],
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain('data-footer-role="hints"');
    expect(paragraphs[1]).toContain('data-footer-role="status"');
    expect(paragraphs[1]).toContain('data-status-tone=""');
    expect(paragraphs[1]).toContain('role="status"');
    // The hints line is first: hints above the status line.
    expect(markup.indexOf('data-footer-role="hints"')).toBeLessThan(
      markup.indexOf('data-footer-role="status"'),
    );
  });

  it("keeps the document footer unique and outside the template", () => {
    const template =
      /<template id="station-footer-template">([\s\S]*?)<\/template>/.exec(
        HTML_WITHOUT_STYLE,
      );
    expect(template?.[1] ?? "").not.toContain("<footer");

    const documentFooters = HTML_WITHOUT_STYLE.match(/^ *<footer\b/gm) ?? [];
    expect(documentFooters).toHaveLength(1);
  });
});
