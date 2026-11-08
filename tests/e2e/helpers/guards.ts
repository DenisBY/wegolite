// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The QUAL-08 run guards for a browser journey (D-17, research Pattern 2).
 *
 * A journey attaches both guards before its first navigation and asserts them
 * last. `watchNetwork` is context-wide, so a request from any page or any reload
 * in the journey is seen. D-17 scopes the rule: no request may leave the app's
 * own origin, and no same-origin request may use a method other than GET. Same
 * origin static GETs (models, textures, galaxy chunks) are allowed. `watchConsole`
 * records errors, warnings and uncaught page errors. Errors and page errors are
 * never allowlisted; a warning is allowed only by an exact entry in
 * `ENGINE_WARNING_ALLOWLIST`.
 */

import { expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/** One request the network guard refused. */
export interface NetworkOffence {
  method: string;
  url: string;
}

/** Console and page problems observed on one page, across its reloads. */
export interface ConsoleProblems {
  errors: string[];
  warnings: string[];
  pageErrors: string[];
}

/**
 * Warnings the browser engine itself emits that a run may tolerate.
 *
 * An entry is allowed only for a warning the browser engine itself emits, matched
 * by an exact anchored pattern, with its source named in the comment beside it.
 * A warning whose text contains "Wegolite" or "THREE." may never be listed, and
 * `expectCleanRun` refuses such a warning even if a pattern matches it. Console
 * errors and page errors are never allowlisted at all. The single entry below is
 * the GL driver's ReadPixels stall, observed on the shipped build under
 * headless SwiftShader.
 */
export const ENGINE_WARNING_ALLOWLIST: readonly RegExp[] = [
  // Source: Chromium's WebGL driver layer (ANGLE on SwiftShader in the headless
  // e2e image), which reports a performance hint when the GPU stalls for a
  // ReadPixels readback. The page is the reporting location. No readPixels,
  // getImageData or toDataURL call exists under src/ or tests/e2e/. The context
  // id differs per run, so only its hex form is pinned.
  /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels( \(this message will no longer repeat\))? \(http:\/\/127\.0\.0\.1:4173\/\)$/,
];

/** Warnings from our own code or the renderer library are never tolerated. */
const OWN_WARNING = /Wegolite|THREE\./;

/**
 * Record every request the context makes that leaves the base origin or is not a
 * GET. `data:` and `blob:` URLs are inline resources, not network traffic, so
 * they are ignored. A URL that cannot be parsed is recorded as an offence rather
 * than skipped (fail closed). Returns the live array, which fills as requests run.
 */
export function watchNetwork(
  context: BrowserContext,
  baseURL: string,
): NetworkOffence[] {
  const origin = new URL(baseURL).origin;
  const offences: NetworkOffence[] = [];
  context.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    const method = request.method();
    let sameOrigin: boolean;
    try {
      sameOrigin = new URL(url).origin === origin;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin || method !== "GET") {
      offences.push({ method, url });
    }
  });
  return offences;
}

/**
 * Record the page's console errors and warnings (with the source URL the engine
 * reports) and its uncaught page errors. Page listeners survive `page.reload()`,
 * so the same record covers every reload of a journey.
 */
export function watchConsole(page: Page): ConsoleProblems {
  const problems: ConsoleProblems = {
    errors: [],
    warnings: [],
    pageErrors: [],
  };
  page.on("console", (message) => {
    const source = message.location().url || "no source";
    const entry = `${message.text()} (${source})`;
    if (message.type() === "error") problems.errors.push(entry);
    else if (message.type() === "warning") problems.warnings.push(entry);
  });
  page.on("pageerror", (error) => {
    problems.pageErrors.push(String(error));
  });
  return problems;
}

/** True when a warning entry matches an allowlist pattern and is not ours. */
function isAllowedWarning(entry: string): boolean {
  if (OWN_WARNING.test(entry)) return false;
  return ENGINE_WARNING_ALLOWLIST.some((pattern) => pattern.test(entry));
}

/**
 * Assert the whole run was clean: no network offence, no console error, no page
 * error, and no warning outside the allowlist. Each failure prints the offending
 * entries, so a failing run names the request or message that broke the rule.
 */
export function expectCleanRun(
  network: readonly NetworkOffence[],
  consoleProblems: ConsoleProblems,
): void {
  const unlistedWarnings = consoleProblems.warnings.filter(
    (entry) => !isAllowedWarning(entry),
  );
  expect(
    network.map((offence) => `${offence.method} ${offence.url}`),
    "requests that left the origin or were not GET (QUAL-08, D-17)",
  ).toEqual([]);
  expect(consoleProblems.errors, "console errors (QUAL-08)").toEqual([]);
  expect(consoleProblems.pageErrors, "uncaught page errors (QUAL-08)").toEqual(
    [],
  );
  expect(
    unlistedWarnings,
    "console warnings not listed in ENGINE_WARNING_ALLOWLIST (QUAL-08)",
  ).toEqual([]);
}
