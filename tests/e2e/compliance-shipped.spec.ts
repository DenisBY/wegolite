// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Post-build licence shipping and shipped-page policy (QUAL-07, D-03, D-04,
 * research Pattern 1 and Pattern 2).
 *
 * These specs read the preview, not the source: they run only after
 * `npm run build`, because `vite preview` serves `dist/`. The byte comparison
 * reads the committed repository-root documents, so a stale or missing copy in
 * the build output fails here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";

const DOCUMENTS = ["NOTICE", "LICENSE", "ASSETS.md"] as const;

const FOOTER_HREFS = [
  "./NOTICE",
  "./LICENSE",
  "./ASSETS.md",
  "https://github.com/DenisBY/wegolite",
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

test("the built site serves NOTICE, LICENSE and ASSETS.md byte-for-byte", async ({
  page,
}) => {
  for (const name of DOCUMENTS) {
    const response = await page.request.get("./" + name);
    expect(response.status(), `GET ./${name}`).toBe(200);

    const served = await response.body();
    const committed = readFileSync(join(process.cwd(), name));
    expect(served.equals(committed), `./${name} bytes`).toBe(true);
  }
});

test("the shipped footer links the licence documents and the source", async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto("/");
  await waitForReady(page);

  const footers = page.locator("footer");
  await expect(footers).toHaveCount(1);
  const footerText = (await footers.textContent()) ?? "";
  expect(footerText).toContain("Wegolite 0.1.0");
  expect(footerText).toContain("unofficial fan project");

  const hrefs = await page
    .locator("footer a")
    .evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href")),
    );
  expect(hrefs).toEqual(FOOTER_HREFS);

  const notice = readFileSync(join(process.cwd(), "NOTICE"), "utf8");
  const sourceUrl = /https:\/\/github\.com\/DenisBY\/wegolite/.exec(notice)?.[0];
  expect(sourceUrl).toBe("https://github.com/DenisBY/wegolite");
  expect(hrefs.at(-1)).toBe(sourceUrl);

  for (const href of FOOTER_HREFS.slice(0, 3)) {
    const target = new URL(href, page.url()).toString();
    const response = await page.request.get(target);
    expect(response.status(), target).toBe(200);
  }

  expect(errors).toEqual([]);
});
