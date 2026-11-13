// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative proof for the src/sim determinism bans (FOUND-12, plan 08-03).
 *
 * A clean-tree `lint` proves the tree is green; it cannot prove the rules would
 * notice a violation. Each case writes a probe under `src/sim/` (through
 * `withSimProbe`: probe lock, `__purity_` name, SPDX header, full cleanup), lints
 * it through the real root config, and asserts the rule id and a fragment of the
 * configured message. Each ban has a positive control that lints clean.
 *
 * Lint is a necessary guard, not the whole determinism proof. Residual forms it
 * cannot see: `Math` or `Reflect` passed as a call argument, a value or method
 * laundered through an intermediate variable or another module, and an
 * identifier-receiver `xs.sort.call(xs2)` where `sort` is not on
 * `Array.prototype`. Lint also checks only that a sort comparator is present,
 * not that it is a total order, so comparators must be total and NaN keys
 * impossible by construction (sanitize) or broken by id. Behaviour is proven by
 * plan 08-02's pinned flight hashes and stream source-scan and plan 08-13's
 * 1,000-tick live-versus-restored equality and cross-cadence hashes.
 *
 * The messages asserted here by fragment are the stable strings of
 * `SIM_SYNTAX_BANS`, `SIM_GLOBAL_BANS` and `SIM_RESTRICTED_PROPERTIES` in
 * `eslint.config.js`; plan 08-09's AI-zone guard reuses them.
 */

import { describe, expect, it } from "vitest";

import { lintProbe } from "./eslint-gate.js";
import { withSimProbe } from "./sim-probe.js";

const TIMEOUT = 120_000;

interface BanCase {
  readonly name: string;
  /** Probe path under src/sim; the helper normalises the basename. */
  readonly path: string;
  readonly source: string;
  readonly rule: string;
  /** A fragment of the configured message. */
  readonly fragment: string;
}

const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

const FOR_IN = lines(
  "export function keysOf(o: Record<string, number>): string[] {",
  "  const out: string[] = [];",
  "  for (const k in o) out.push(k);",
  "  return out;",
  "}",
);
const BARE_SORT = lines("export const sorted = [2, 1].sort();");
const DATE_NOW = lines("export const now = Date.now();");
const MATH_RANDOM = lines("export const r = Math.random();");

const SYNTAX = "no-restricted-syntax";
const GLOBALS = "no-restricted-globals";
const PROPERTIES = "no-restricted-properties";

const BARE = "Bare .sort()";
const BARE_TO = "Bare .toSorted()";
const VIA_CALL = "via .call/.apply/.bind";
const ALIAS = "Do not alias Math";
const REFLECT = "Reflect.get or Reflect.apply";
const UNDEF = "Passing undefined to sort/toSorted";
const TIMERS = "No timers inside src/sim";
const GLOBAL_OBJECT = "must not reach the global object";

const BAN_CASES: readonly BanCase[] = [
  // Unseeded randomness and the wall clock.
  {
    name: "Math.random()",
    path: "__ban_math_random.ts",
    source: MATH_RANDOM,
    rule: PROPERTIES,
    fragment: "seeded PRNG",
  },
  {
    name: 'Math["random"]()',
    path: "__ban_math_random_computed.ts",
    source: lines('export const r = Math["random"]();'),
    rule: PROPERTIES,
    fragment: "seeded PRNG",
  },
  {
    name: "Date.now()",
    path: "__ban_date_now.ts",
    source: DATE_NOW,
    rule: PROPERTIES,
    fragment: "No wall clock",
  },
  {
    name: "Date.UTC(2026, 0, 1)",
    path: "__ban_date_utc.ts",
    source: lines("export const t = Date.UTC(2026, 0, 1);"),
    rule: GLOBALS,
    fragment: "No Date inside src/sim",
  },
  {
    name: "Date()",
    path: "__ban_date_call.ts",
    source: lines("export const t = Date();"),
    rule: GLOBALS,
    fragment: "No Date inside src/sim",
  },
  {
    name: "new Date()",
    path: "__ban_new_date.ts",
    source: lines("export const t = new Date();"),
    rule: SYNTAX,
    fragment: "No Date inside src/sim",
  },
  {
    name: "performance.now()",
    path: "__ban_performance_now.ts",
    source: lines("export const t = performance.now();"),
    rule: PROPERTIES,
    fragment: "No wall clock",
  },
  // Timers, microtasks, process, platform randomness, the global object.
  {
    name: "setTimeout with a callback",
    path: "__ban_set_timeout.ts",
    source: lines("setTimeout(() => undefined, 1);"),
    rule: GLOBALS,
    fragment: TIMERS,
  },
  {
    name: "setInterval with a callback",
    path: "__ban_set_interval.ts",
    source: lines("setInterval(() => undefined, 1);"),
    rule: GLOBALS,
    fragment: TIMERS,
  },
  {
    name: "setImmediate with a callback",
    path: "__ban_set_immediate.ts",
    source: lines("setImmediate(() => undefined);"),
    rule: GLOBALS,
    fragment: TIMERS,
  },
  {
    name: "queueMicrotask with a callback",
    path: "__ban_queue_microtask.ts",
    source: lines("queueMicrotask(() => undefined);"),
    rule: GLOBALS,
    fragment: TIMERS,
  },
  {
    name: "process.env",
    path: "__ban_process_env.ts",
    source: lines("export const e = process.env;"),
    rule: GLOBALS,
    fragment: "process environment",
  },
  {
    name: "crypto.getRandomValues",
    path: "__ban_crypto.ts",
    source: lines(
      "export const v = crypto.getRandomValues(new Uint32Array(1));",
    ),
    rule: GLOBALS,
    fragment: "No platform randomness",
  },
  {
    name: "self.crypto.getRandomValues",
    path: "__ban_self.ts",
    source: lines(
      "export const v = self.crypto.getRandomValues(new Uint32Array(1));",
    ),
    rule: GLOBALS,
    fragment: GLOBAL_OBJECT,
  },
  {
    name: "globalThis.Math.random()",
    path: "__ban_global_this.ts",
    source: lines("export const r = globalThis.Math.random();"),
    rule: GLOBALS,
    fragment: GLOBAL_OBJECT,
  },
  // Bare sorts and the reflective routes to them.
  {
    name: "bare .sort()",
    path: "__ban_bare_sort.ts",
    source: BARE_SORT,
    rule: SYNTAX,
    fragment: BARE,
  },
  {
    name: "bare .toSorted()",
    path: "__ban_bare_to_sorted.ts",
    source: lines("export const sorted = [2, 1].toSorted();"),
    rule: SYNTAX,
    fragment: BARE_TO,
  },
  {
    name: "Array.prototype.sort.call",
    path: "__ban_sort_call.ts",
    source: lines("export const sorted = Array.prototype.sort.call([2, 1]);"),
    rule: SYNTAX,
    fragment: VIA_CALL,
  },
  {
    name: "Array.prototype.sort.apply",
    path: "__ban_sort_apply.ts",
    source: lines(
      "export const sorted = Array.prototype.sort.apply([2, 1], []);",
    ),
    rule: SYNTAX,
    fragment: VIA_CALL,
  },
  {
    name: "Array.prototype.sort.bind",
    path: "__ban_sort_bind.ts",
    source: lines("export const sorted = Array.prototype.sort.bind([2, 1])();"),
    rule: SYNTAX,
    fragment: VIA_CALL,
  },
  {
    name: 'Reflect.get(Math, "random")',
    path: "__ban_reflect_get.ts",
    source: lines(
      'export const r = (Reflect.get(Math, "random") as () => number)();',
    ),
    rule: SYNTAX,
    fragment: REFLECT,
  },
  {
    name: 'Reflect["get"](Math, "random")',
    path: "__ban_reflect_get_computed.ts",
    source: lines(
      'export const r = (Reflect["get"](Math, "random") as () => number)();',
    ),
    rule: SYNTAX,
    fragment: REFLECT,
  },
  {
    name: "Reflect.apply(Array.prototype.sort, ...)",
    path: "__ban_reflect_apply.ts",
    source: lines(
      "export const sorted = Reflect.apply(Array.prototype.sort, [2, 1], []);",
    ),
    rule: SYNTAX,
    fragment: REFLECT,
  },
  // Aliasing Math.
  {
    name: "const m = Math; m.random()",
    path: "__ban_alias_const.ts",
    source: lines("const m = Math;", "export const r = m.random();"),
    rule: SYNTAX,
    fragment: ALIAS,
  },
  {
    name: "const { random } = Math",
    path: "__ban_alias_destructure.ts",
    source: lines("const { random } = Math;", "export const r = random();"),
    rule: SYNTAX,
    fragment: ALIAS,
  },
  {
    name: "m = Math (assignment)",
    path: "__ban_alias_assign.ts",
    source: lines(
      "let m: Math | undefined;",
      "m = Math;",
      "export const r = m.floor(1.5);",
    ),
    rule: SYNTAX,
    fragment: ALIAS,
  },
  {
    name: 'const k = "random"; Math[k]()',
    path: "__ban_math_computed.ts",
    source: lines('const k = "random";', "export const r = Math[k]();"),
    rule: SYNTAX,
    fragment: "No computed Math member",
  },
  // Code evaluation and locale.
  {
    name: 'eval("1")',
    path: "__ban_eval.ts",
    source: lines('export const v = eval("1");'),
    rule: "no-eval",
    fragment: "eval",
  },
  {
    name: '(0, eval)("Date.now()")',
    path: "__ban_eval_indirect.ts",
    source: lines('export const v = (0, eval)("Date.now()");'),
    rule: "no-eval",
    fragment: "eval",
  },
  {
    name: 'new Function("return 1")()',
    path: "__ban_new_function.ts",
    source: lines('export const v = new Function("return 1")();'),
    rule: "no-new-func",
    fragment: "Function",
  },
  {
    name: 'Function("return 1")()',
    path: "__ban_function_call.ts",
    source: lines('export const v = Function("return 1")();'),
    rule: "no-new-func",
    fragment: "Function",
  },
  {
    name: 'setTimeout("1", 0)',
    path: "__ban_implied_eval.ts",
    source: lines('setTimeout("1", 0);'),
    rule: "no-implied-eval",
    fragment: "mplied eval",
  },
  {
    name: 'new Intl.Collator("en")',
    path: "__ban_intl.ts",
    source: lines('export const c = new Intl.Collator("en");'),
    rule: GLOBALS,
    fragment: "Intl is locale/ICU-dependent",
  },
  {
    name: "localeCompare comparator",
    path: "__ban_locale_compare.ts",
    source: lines(
      'export const sorted = ["b", "a"].sort((a, b) => a.localeCompare(b));',
    ),
    rule: SYNTAX,
    fragment: "localeCompare is ICU- and locale-dependent",
  },
  // Round 4 sort-ban bypass forms.
  {
    name: "sort(undefined)",
    path: "__ban_sort_undefined.ts",
    source: lines("export const sorted = [2, 1].sort(undefined);"),
    rule: SYNTAX,
    fragment: UNDEF,
  },
  {
    name: "toSorted(void 0)",
    path: "__ban_to_sorted_void.ts",
    source: lines("export const sorted = [2, 1].toSorted(void 0);"),
    rule: SYNTAX,
    fragment: UNDEF,
  },
  {
    name: 'computed ["sort"]()',
    path: "__ban_sort_computed.ts",
    source: lines('export const sorted = [2, 1]["sort"]();'),
    rule: SYNTAX,
    fragment: BARE,
  },
  {
    name: 'Array.prototype["sort"].call',
    path: "__ban_sort_computed_call.ts",
    source: lines(
      'export const sorted = Array.prototype["sort"].call([2, 1]);',
    ),
    rule: SYNTAX,
    fragment: VIA_CALL,
  },
  {
    name: 'Array.prototype.sort["call"]',
    path: "__ban_sort_call_computed.ts",
    source: lines(
      'export const sorted = Array.prototype.sort["call"]([2, 1]);',
    ),
    rule: SYNTAX,
    fragment: VIA_CALL,
  },
  {
    name: 'Array.prototype["sort"]["call"]',
    path: "__ban_sort_both_computed.ts",
    source: lines(
      'export const sorted = Array.prototype["sort"]["call"]([2, 1]);',
    ),
    rule: SYNTAX,
    fragment: VIA_CALL,
  },
  // Every rule constant reaches a subdirectory of src/sim.
  {
    name: "world/ for..in",
    path: "world/__ban_for_in.ts",
    source: FOR_IN,
    rule: SYNTAX,
    fragment: "for..in",
  },
  {
    name: "world/ bare .sort()",
    path: "world/__ban_bare_sort.ts",
    source: BARE_SORT,
    rule: SYNTAX,
    fragment: BARE,
  },
  {
    name: "world/ Date.now()",
    path: "world/__ban_date_now.ts",
    source: DATE_NOW,
    rule: PROPERTIES,
    fragment: "No wall clock",
  },
  {
    name: "world/ Math.random()",
    path: "world/__ban_math_random.ts",
    source: MATH_RANDOM,
    rule: PROPERTIES,
    fragment: "seeded PRNG",
  },
  {
    name: "world/ setTimeout",
    path: "world/__ban_set_timeout.ts",
    source: lines("setTimeout(() => undefined, 1);"),
    rule: GLOBALS,
    fragment: TIMERS,
  },
];

describe("src/sim determinism bans: failing probes", () => {
  for (const ban of BAN_CASES) {
    it(
      `${ban.name} fails lint with ${ban.rule}`,
      async () => {
        await withSimProbe(ban.path, ban.source, async (file) => {
          const lint = await lintProbe(file);

          expect(lint.status, lint.output).toBe(1);
          const hit = lint.messages.find(
            (m) => m.ruleId === ban.rule && m.message.includes(ban.fragment),
          );
          expect(hit, lint.output).toBeDefined();
        });
      },
      TIMEOUT,
    );
  }
});

interface ControlCase {
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

const CONTROL_CASES: readonly ControlCase[] = [
  {
    name: "a sort with a numeric comparator",
    path: "__ok_sort_cmp.ts",
    source: lines("export const sorted = [3, 1, 2].sort((a, b) => a - b);"),
  },
  {
    name: "a toSorted with a numeric comparator",
    path: "__ok_to_sorted_cmp.ts",
    // The sim lib predates `toSorted`, so the receiver is typed explicitly: the
    // control must lint clean for the right reason (a comparator is present).
    source: lines(
      "interface Sortable {",
      "  toSorted(compare: (a: number, b: number) => number): number[];",
      "}",
      "const xs = [3, 1, 2] as unknown as Sortable;",
      "export const sorted = xs.toSorted((a, b) => a - b);",
    ),
  },
  {
    name: "a comparator-sorted Object.keys list",
    path: "__ok_sorted_keys.ts",
    source: lines(
      "export function sortedKeys(o: Record<string, number>): string[] {",
      "  return Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));",
      "}",
    ),
  },
  {
    name: "a direct Math.floor and Math.imul call",
    path: "__ok_math_direct.ts",
    source: lines("export const n = Math.floor(1.5) + Math.imul(3, 5);"),
  },
  {
    name: "a Date used only as a type annotation",
    path: "__ok_date_type.ts",
    source: lines("export type Stamp = (when: Date) => number;"),
  },
  {
    name: "a for..of loop over an array",
    path: "__ok_for_of.ts",
    source: lines(
      "export function total(xs: readonly number[]): number {",
      "  let sum = 0;",
      "  for (const x of xs) sum += x;",
      "  return sum;",
      "}",
    ),
  },
  {
    name: "toFixed with a fixed digit count (hash canon)",
    path: "__ok_to_fixed.ts",
    source: lines("export const text = (1.5).toFixed(6);"),
  },
  {
    name: "a comparator sort under world/",
    path: "world/__ok_sort_cmp.ts",
    source: lines("export const sorted = [3, 1, 2].sort((a, b) => a - b);"),
  },
];

describe("src/sim determinism bans: positive controls", () => {
  for (const control of CONTROL_CASES) {
    it(
      `${control.name} lints clean`,
      async () => {
        await withSimProbe(control.path, control.source, async (file) => {
          const lint = await lintProbe(file);

          expect(lint.status, lint.output).toBe(0);
        });
      },
      TIMEOUT,
    );
  }
});
