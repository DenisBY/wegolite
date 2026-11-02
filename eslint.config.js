// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * The DOM surface `src/sim/` may never touch (FOUND-05). `tsconfig.sim.json`
 * removes these identifiers from the type environment, but it says nothing
 * about ambient `lib` additions elsewhere or about runtime lookups, so ESLint
 * enforces the same boundary a second time.
 */
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "HTMLElement",
  "HTMLCanvasElement",
  "CanvasRenderingContext2D",
  "WebGLRenderingContext",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "performance",
  "Image",
  "fetch",
];

export default tseslint.config(
  {
    // A fixed four-entry set: nothing under src/ is ever ignored, so a seeded
    // violation in the sim zone cannot be hidden by widening this list (T-01-04).
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Type-aware rules need a program per file. The root tsconfig.json
        // includes src/**, tests/** and *.config.ts; this is the one JS file it
        // cannot cover (allowJs is off), so it is named here and only here
        // (Pitfall 9 — double-listing is an error).
        projectService: { allowDefaultProject: ["eslint.config.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The sim/render boundary (FOUND-05). Every rule is "error", never "warn":
    // FOUND-05 requires the zone to fail `lint`, and a warning would let a
    // Three import or a DOM global ship (T-01-04).
    files: ["src/sim/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["three", "three/*", "three/addons/*"],
              message: "src/sim must stay renderer-free.",
            },
            {
              group: [
                "**/render/**",
                "**/ui/**",
                "**/input/**",
                "**/app/**",
                "**/persistence/**",
              ],
              message: "src/sim may only import src/sim and content/types.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...DOM_GLOBALS.map((name) => ({
          name,
          message: "src/sim must not touch the DOM.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the seeded PRNG in sim/math.",
        },
        {
          object: "Date",
          property: "now",
          message: "No wall clock inside src/sim.",
        },
        {
          object: "performance",
          property: "now",
          message: "No wall clock inside src/sim.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: "No Date inside src/sim.",
        },
      ],
    },
  },
  // Must stay last: turns off every stylistic rule Prettier owns.
  prettier,
);
