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
 * The src/sim determinism rule lists (FOUND-12). ESLint REPLACES, it does not
 * merge, a rule that a later config block redefines (RESEARCH Pattern 8): a
 * later block that sets `no-restricted-syntax`, `no-restricted-globals` or
 * `no-restricted-properties` for a src/sim subtree silently drops every entry
 * listed here. Any such block must spread these constants, so the bans stay in
 * force.
 *
 * What lint can and cannot prove (FOUND-12). The selectors below close the
 * simple alias and reflection routes around the Math.random and bare-sort bans:
 * binding or assigning `Math` (which deliberately also rejects destructuring
 * such as `const { floor } = Math`, so every `Math.<fn>` call stays visible to
 * the rules), computed `Math` members with a non-literal key, `Reflect.get` and
 * `Reflect.apply`, and `.sort`/`.toSorted` reached through `.call`, `.apply` or
 * `.bind`, in dot and computed form.
 *
 * Residual forms lint cannot see: `Math` or `Reflect` passed as a call
 * argument, a function or value laundered through an intermediate variable or
 * another module, and an identifier-receiver `xs.sort.call(xs2)` where `sort`
 * is not reached through `Array.prototype`. Lint also checks only that a sort
 * comparator is PRESENT, not that it is a total order, so comparators must be
 * total and NaN keys impossible by construction (sanitize) or broken by id.
 * Lint is therefore a necessary guard, not the whole determinism proof:
 * behaviour is proven by plan 08-02's pinned flight hashes and stream
 * source-scan, and plan 08-13's 1,000-tick live-versus-restored equality and
 * cross-cadence hashes.
 *
 * `toFixed` and `toPrecision` are deliberately not banned here (the generator
 * zone bans them): src/sim/hash.ts canon formats through `toFixed` with a fixed
 * digit count, which is the v1 hash format.
 *
 * The messages are asserted by fragment in tests/guards/sim-determinism-bans
 * and reused by the AI-zone guard (plan 08-09); do not reword them.
 */
const SIM_SYNTAX_BANS = [
  {
    selector: 'NewExpression[callee.name="Date"]',
    message: "No Date inside src/sim.",
  },
  {
    selector: "ForInStatement",
    message:
      "for..in order depends on property insertion; iterate an array or a comparator-sorted key list.",
  },
  {
    selector: 'CallExpression[callee.property.name="sort"][arguments.length=0]',
    message:
      "Bare .sort() is lexicographic and engine-defined for mixed values; pass a total-order comparator.",
  },
  {
    selector:
      'CallExpression[callee.property.name="toSorted"][arguments.length=0]',
    message:
      "Bare .toSorted() is lexicographic; pass a total-order comparator.",
  },
  {
    selector:
      "CallExpression[callee.computed=true][callee.property.value=/^(sort|toSorted)$/][arguments.length=0]",
    message:
      "Bare .sort() is lexicographic and engine-defined for mixed values; pass a total-order comparator.",
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(sort|toSorted)$/][arguments.0.type="Identifier"][arguments.0.name="undefined"]',
    message:
      "Passing undefined to sort/toSorted is a bare sort; pass a total-order comparator.",
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(sort|toSorted)$/][arguments.0.type="UnaryExpression"][arguments.0.operator="void"]',
    message:
      "Passing undefined to sort/toSorted is a bare sort; pass a total-order comparator.",
  },
  {
    selector: 'VariableDeclarator[init.type="Identifier"][init.name="Math"]',
    message:
      "Do not alias Math in src/sim; call Math.<fn> directly so the Math.random ban can see it.",
  },
  {
    selector:
      'AssignmentExpression[right.type="Identifier"][right.name="Math"]',
    message:
      "Do not alias Math in src/sim; call Math.<fn> directly so the Math.random ban can see it.",
  },
  {
    selector:
      'MemberExpression[object.name="Math"][computed=true][property.type!="Literal"]',
    message:
      "No computed Math member with a non-literal key in src/sim; name the function.",
  },
  {
    selector:
      'MemberExpression[object.name="Reflect"][property.name=/^(get|apply)$/]',
    message:
      "Do not use Reflect.get or Reflect.apply in src/sim; it would bypass the Math.random, property and sort bans.",
  },
  {
    selector: 'MemberExpression[object.name="Reflect"][computed=true]',
    message:
      "Do not use Reflect.get or Reflect.apply in src/sim; it would bypass the Math.random, property and sort bans.",
  },
  {
    selector:
      "MemberExpression[object.property.name=/^(sort|toSorted)$/][property.name=/^(call|apply|bind)$/]",
    message:
      "Do not invoke sort/toSorted via .call/.apply/.bind in src/sim; call .sort(cmp) directly with a total-order comparator.",
  },
  {
    selector:
      "MemberExpression[object.property.value=/^(sort|toSorted)$/][property.name=/^(call|apply|bind)$/]",
    message:
      "Do not invoke sort/toSorted via .call/.apply/.bind in src/sim; call .sort(cmp) directly with a total-order comparator.",
  },
  {
    selector:
      "MemberExpression[object.property.name=/^(sort|toSorted)$/][property.value=/^(call|apply|bind)$/]",
    message:
      "Do not invoke sort/toSorted via .call/.apply/.bind in src/sim; call .sort(cmp) directly with a total-order comparator.",
  },
  {
    selector:
      "MemberExpression[object.property.value=/^(sort|toSorted)$/][property.value=/^(call|apply|bind)$/]",
    message:
      "Do not invoke sort/toSorted via .call/.apply/.bind in src/sim; call .sort(cmp) directly with a total-order comparator.",
  },
  {
    selector: 'CallExpression[callee.property.name="localeCompare"]',
    message:
      "localeCompare is ICU- and locale-dependent; sort with a code-unit comparison in src/sim.",
  },
];

const SIM_GLOBAL_BANS = [
  ...DOM_GLOBALS.map((name) => ({
    name,
    message: "src/sim must not touch the DOM.",
  })),
  { name: "Date", message: "No Date inside src/sim; use the fixed-step tick." },
  ...["setTimeout", "setInterval", "setImmediate", "queueMicrotask"].map(
    (name) => ({
      name,
      message: "No timers inside src/sim; schedule with integer ticks.",
    }),
  ),
  {
    name: "process",
    message: "src/sim must not read the process environment.",
  },
  {
    name: "crypto",
    message:
      "No platform randomness inside src/sim; use the seeded stream in sim/rng.",
  },
  ...["globalThis", "self"].map((name) => ({
    name,
    message:
      "src/sim must not reach the global object; it would bypass the Math and Date bans.",
  })),
  {
    name: "Intl",
    message:
      "Intl is locale/ICU-dependent; src/sim emits no locale formatting.",
  },
];

const SIM_RESTRICTED_PROPERTIES = [
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
];

/**
 * The generator's transcendental ban message. It names the rule's reason and
 * the replacement surface in one sentence so an ESLint failure is actionable
 * without opening this file (DATA-08).
 */
const MATH_1ULP_MESSAGE =
  "Math.sin/cos/tan/exp/log/pow are spec-permitted to differ by 1 ULP across engines and architectures; use + - * /, Math.sqrt, or integers in the generator.";

/**
 * The AI zone (FOUND-13, D-11, Pitfall 5). Hand-ported AI code may read the
 * world only through `WorldView` and act only through `ShipControl`, so its
 * import surface is an allow-list, not a deny-list.
 *
 * `AI_ZONE_IMPORT_REGEX_DEPTH1` is for `src/sim/ai/*.ts`. ESLint tests a
 * `regex` pattern against the import specifier and reports a match, so each
 * regex matches every specifier EXCEPT the allowed ones (a negative lookahead
 * at the start). Allowed: `./<name>.js` (an AI sibling), `./pilots/<name>.js`,
 * `../math.js`, `../world/ids.js`, `../world/view.js`, `../world/control.js`.
 * Names are limited to lowercase letters, digits and hyphens, so `./../` and
 * `.//` cannot sneak past.
 */
const AI_ZONE_IMPORT_REGEX_DEPTH1 = String.raw`^(?!(?:\./[a-z0-9-]+|\./pilots/[a-z0-9-]+|\.\./math|\.\./world/(?:ids|view|control))\.js$)`;

/**
 * The same allow-list for `src/sim/ai/pilots/*.ts` and any other one-level `src/sim/ai/<subdir>` file.
 * Allowed: `./<name>.js`, `../<name>.js` (an AI sibling one level up),
 * `../../math.js`, `../../world/ids.js`, `../../world/view.js`,
 * `../../world/control.js`.
 */
const AI_ZONE_IMPORT_REGEX_DEPTH2 = String.raw`^(?!(?:\./[a-z0-9-]+|\.\./[a-z0-9-]+|\.\./\.\./math|\.\./\.\./world/(?:ids|view|control))\.js$)`;

/**
 * `src/sim/math.ts` still exports `createSeededRandom`, a closure-held stream
 * the renderer keeps and no snapshot can carry. The AI zone bans it by name
 * (any alias, and any namespace import of the module), so AI code cannot draw
 * from anything but `AiContext.random` (FOUND-12, FOUND-13).
 */
const AI_ZONE_CLOSURE_RNG_MESSAGE =
  "AI modules draw only from the per-entity stream in AiContext.random; createSeededRandom is a closure-held stream that no snapshot can carry (FOUND-12, FOUND-13).";

const AI_MODULE_STATE_MESSAGE =
  "AI modules keep no module-level mutable state; put state in the entity's AiComponent, or wrap a constant table in Object.freeze(...) (FOUND-13).";

/**
 * Module-level mutable state ban for the AI zone: every piece of AI state must
 * live in the entity's `AiComponent` so it survives the snapshot. Rejected at
 * the top level: `let` and `var` (plain or exported), a `const` initialised by
 * an array literal, an object literal or `new` (plain or exported), and an
 * `export default` of those. Module tables are wrapped in `Object.freeze(...)`.
 *
 * Residual forms lint cannot see: a top-level const initialised by another call
 * or an IIFE, TypeScript `as const` or `satisfies` literals (readonly only at
 * type level), nested mutable fields under a shallow freeze, and class static
 * fields. The behavioural backstop is the test pilot's JSON round trip
 * (tests/sim/ai/test-pilot.test.ts) and plan 08-13's 1,000-tick snapshot
 * equality for every AI that test runs; each later AI port adds its own
 * round-trip test.
 */
const AI_MODULE_STATE_BANS = [
  {
    selector: "Program > VariableDeclaration[kind=/^(let|var)$/]",
    message: AI_MODULE_STATE_MESSAGE,
  },
  {
    selector:
      "Program > ExportNamedDeclaration > VariableDeclaration[kind=/^(let|var)$/]",
    message: AI_MODULE_STATE_MESSAGE,
  },
  {
    selector:
      'Program > VariableDeclaration[kind="const"] > VariableDeclarator[init.type=/^(ArrayExpression|ObjectExpression|NewExpression)$/]',
    message: AI_MODULE_STATE_MESSAGE,
  },
  {
    selector:
      'Program > ExportNamedDeclaration > VariableDeclaration[kind="const"] > VariableDeclarator[init.type=/^(ArrayExpression|ObjectExpression|NewExpression)$/]',
    message: AI_MODULE_STATE_MESSAGE,
  },
  {
    selector:
      "ExportDefaultDeclaration[declaration.type=/^(ArrayExpression|ObjectExpression|NewExpression)$/]",
    message: AI_MODULE_STATE_MESSAGE,
  },
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
      "no-restricted-globals": ["error", ...SIM_GLOBAL_BANS],
      "no-restricted-properties": ["error", ...SIM_RESTRICTED_PROPERTIES],
      "no-restricted-syntax": ["error", ...SIM_SYNTAX_BANS],
      // Code evaluation is not a global-name restriction, so the core rules are
      // enabled on their own, as in the generator zone. They are deliberately
      // not part of the shared constants: a later block never redefines them,
      // so it inherits them.
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
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
  {
    // The AI zone, depth 1: src/sim/ai/*.ts. The blocks redefine
    // `no-restricted-imports` and `no-restricted-syntax` (Pitfall 5), so the sim
    // zone's three-and-friends bans are replaced by the allow-list and the sim
    // syntax bans are spread back in. `no-restricted-globals`,
    // `no-restricted-properties`, `no-eval`, `no-new-func` and `no-implied-eval`
    // are not redefined, so the sim zone's settings still apply. Each AI block
    // spells out its `no-restricted-syntax` list (the sim bans, the module-state
    // bans and the dynamic-import ban) because redefining the rule replaces it.
    files: ["src/sim/ai/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "../math.js",
              importNames: ["createSeededRandom"],
              message: AI_ZONE_CLOSURE_RNG_MESSAGE,
            },
          ],
          patterns: [
            {
              regex: AI_ZONE_IMPORT_REGEX_DEPTH1,
              caseSensitive: true,
              message:
                "AI modules may import only AI siblings, sim math, world/ids, world/view and world/control (FOUND-13).",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...SIM_SYNTAX_BANS,
        ...AI_MODULE_STATE_BANS,
        {
          selector: "ImportExpression",
          message: "No dynamic import in the AI zone.",
        },
      ],
    },
  },
  {
    // The AI zone, depth 2: src/sim/ai/pilots/*.ts and any other one-level
    // subdirectory such as src/sim/ai/nested/*.ts.
    files: ["src/sim/ai/pilots/*.ts", "src/sim/ai/*/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "../../math.js",
              importNames: ["createSeededRandom"],
              message: AI_ZONE_CLOSURE_RNG_MESSAGE,
            },
          ],
          patterns: [
            {
              regex: AI_ZONE_IMPORT_REGEX_DEPTH2,
              caseSensitive: true,
              message:
                "AI modules may import only AI siblings, sim math, world/ids, world/view and world/control (FOUND-13).",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...SIM_SYNTAX_BANS,
        ...AI_MODULE_STATE_BANS,
        {
          selector: "ImportExpression",
          message: "No dynamic import in the AI zone.",
        },
      ],
    },
  },
  {
    // The AI zone, depth >= 3: src/sim/ai/<a>/<b>/**. Depth >= 3 AI modules are
    // intentionally rejected (every import fails) pending an explicit depth
    // allow-list, so a deeply nested file cannot bypass the zone.
    files: ["src/sim/ai/*/*/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^",
              caseSensitive: true,
              message:
                "AI modules at depth >= 3 have no configured allow-list; keep AI modules in src/sim/ai/ or src/sim/ai/<subdir>/ or add an explicit depth regex (FOUND-13).",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...SIM_SYNTAX_BANS,
        ...AI_MODULE_STATE_BANS,
        {
          selector: "ImportExpression",
          message: "No dynamic import in the AI zone.",
        },
      ],
    },
  },
  // Must stay last: turns off every stylistic rule Prettier owns.
  prettier,
);
