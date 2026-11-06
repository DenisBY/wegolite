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

/**
 * The generator's transcendental ban message. It names the rule's reason and
 * the replacement surface in one sentence so an ESLint failure is actionable
 * without opening this file (DATA-08).
 */
const MATH_1ULP_MESSAGE =
  "Math.sin/cos/tan/exp/log/pow are spec-permitted to differ by 1 ULP across engines and architectures; use + - * /, Math.sqrt, or integers in the generator.";

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
            // D-13/FLGT-06: settings persistence is an app concern. The sim
            // receives a validated config, never a storage blob.
            {
              group: ["**/settings/**"],
              message: "src/sim must not import the settings layer",
            },
            // FLGT-03/D-16: the ship catalogue is runtime content. The sim
            // receives a derived `FlightConfig`, never the catalogue itself.
            {
              group: ["**/content/ships*"],
              message: "src/sim must not import the ship catalogue",
            },
            {
              group: [
                "**/render/**",
                "**/ui/**",
                "**/input/**",
                "**/app/**",
                "**/persistence/**",
                // D-16: the sim may name content *types* and nothing else. A
                // runtime import would drag zod, the loader, or generated data
                // into the simulation bundle. The type-only door is
                // `content/types`, proven by tests/guards/content-boundary.
                "**/content/index*",
                "**/content/schemas/**",
                "**/content/generated/**",
                // The Phase 5 loaders are runtime content too: the sim receives
                // a validated record or plain data, never a loader.
                "**/content/commodities*",
                "**/content/labels*",
                "**/content/equipment*",
                "**/content/dock-port*",
                "**/content/systems*",
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
  {
    // The generator determinism zone (DATA-08, RESEARCH §P6.4, D-06). These
    // APIs are spec-permitted to differ by engine or architecture (1-ULP
    // transcendentals, ICU-backed locale formatting, historical tie-breaking),
    // so one call anywhere in the compiler can make the emitted bytes depend on
    // the machine that produced them. Every rule is "error": a warning would
    // let the divergence ship. The safe surface — `+ - * /`, `Math.sqrt`,
    // `min`/`max`/`abs`/`floor`/`round`/`ceil`, `Math.imul`, `Math.fround`,
    // integers and SHA-256 — is deliberately left unrestricted.
    files: ["tools/oolite-ingest/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "sin",
          message: MATH_1ULP_MESSAGE,
        },
        {
          object: "Math",
          property: "cos",
          message: MATH_1ULP_MESSAGE,
        },
        {
          object: "Math",
          property: "tan",
          message: MATH_1ULP_MESSAGE,
        },
        {
          object: "Math",
          property: "exp",
          message: MATH_1ULP_MESSAGE,
        },
        {
          object: "Math",
          property: "log",
          message: MATH_1ULP_MESSAGE,
        },
        {
          object: "Math",
          property: "pow",
          message: MATH_1ULP_MESSAGE,
        },
        {
          object: "Math",
          property: "random",
          message: "No unseeded randomness in the generator.",
        },
        {
          object: "Date",
          property: "now",
          message: "No wall clock in the generator.",
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "Intl",
          message:
            "Intl is locale/ICU-dependent; emit stable strings and numbers, not locale formatting.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: "No Date in the generator; the output carries no time.",
        },
        {
          selector: 'CallExpression[callee.property.name="localeCompare"]',
          message:
            "localeCompare is ICU-dependent; sort with a code-unit comparison.",
        },
        {
          selector: 'CallExpression[callee.property.name="toFixed"]',
          message:
            "toFixed tie-breaking is engine-dependent; format numbers explicitly with String(n).",
        },
        {
          selector: 'CallExpression[callee.property.name="toPrecision"]',
          message:
            "toPrecision tie-breaking is engine-dependent; format numbers explicitly with String(n).",
        },
      ],
      // `eval` and `new Function` are not global-name restrictions, so the core
      // rules are enabled explicitly: generated code must never run in-process.
      "no-eval": "error",
      "no-new-func": "error",
    },
  },
  // Must stay last: turns off every stylistic rule Prettier owns.
  prettier,
);
