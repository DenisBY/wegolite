// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * OpenStep ASCII plist recursive-descent parser (DATA-01).
 *
 * Grammar: `value → dict | array | quoted string | bare token`, where a bare
 * token resolves in this order — `yes`/`no` → integer → real → string. The
 * order matters: `yes` must beat the string fallback, and an unquoted atom such
 * as `magentaColor` must stay a string rather than become an error.
 *
 * A dictionary is `key = value ;` with whitespace (including newlines) allowed
 * between the key, the `=`, the value and the `;`. `{ }` and a comment-only
 * `( /* … *\/ )` produce an explicit empty node, not a failure and not
 * `undefined`. An empty or comment-only file is an empty dictionary.
 *
 * No token is ever run as code: this is a recursive descent over a token
 * array, capped at 64 levels (T-02-01).
 */

import { contentError, sourceExcerpt } from "../content-error.js";
import type { PlistDict, PlistEntry, PlistValue } from "./plist-value.js";
import type { Token } from "./tokenizer.js";
import { tokenize } from "./tokenizer.js";

const MAX_DEPTH = 64;

const INTEGER = /^-?\d+$/;
// A real needs digits on both sides of the point: `.5`, `1.` and `+5` are not
// numbers in this grammar, and are therefore strings (the corpus never uses
// them as numbers, and guessing would change an authored value).
const REAL = /^-?\d+\.\d+$/;

export function parseOpenStep(source: string, file: string): PlistValue {
  const tokens = tokenize(source, file);
  let position = 0;

  const peek = (): Token | undefined => tokens[position];

  const fail: (
    construct: string,
    token: Token | undefined,
    detail: string,
  ) => never = (construct, token, detail) => {
    const at = token ?? { line: 1, column: 1 };
    throw contentError("PLIST_PARSE", file, construct, {
      line: at.line,
      column: at.column,
      excerpt:
        token === undefined
          ? `${detail} (unexpected end of file)`
          : `${detail}: ${sourceExcerpt(source, token.line)}`,
    });
  };

  const resolveBare = (token: Token): PlistValue => {
    if (token.value === "yes" || token.value === "no") {
      return {
        kind: "bool",
        value: token.value === "yes",
        line: token.line,
        column: token.column,
      };
    }
    if (INTEGER.test(token.value)) {
      return {
        kind: "integer",
        value: Number(token.value),
        line: token.line,
        column: token.column,
      };
    }
    if (REAL.test(token.value)) {
      return {
        kind: "real",
        value: Number(token.value),
        line: token.line,
        column: token.column,
      };
    }
    return {
      kind: "string",
      value: token.value,
      line: token.line,
      column: token.column,
    };
  };

  const parseValue = (depth: number): PlistValue => {
    if (depth > MAX_DEPTH) {
      fail("value", peek(), `nesting deeper than ${String(MAX_DEPTH)} levels`);
    }
    const token = peek();
    if (token === undefined) fail("value", token, "expected a value");

    if (token.kind === "punct") {
      if (token.value === "{") return parseDict(token, depth + 1);
      if (token.value === "(") return parseArray(token, depth + 1);
      fail("value", token, `unexpected "${token.value}"`);
    }

    position += 1;
    if (token.kind === "string") {
      return {
        kind: "string",
        value: token.value,
        line: token.line,
        column: token.column,
      };
    }
    return resolveBare(token);
  };

  const parseDict = (open: Token, depth: number): PlistDict => {
    position += 1;
    const entries: PlistEntry[] = [];
    for (;;) {
      const token = peek();
      if (token === undefined) fail("dict", open, 'expected "}"');
      if (token.kind === "punct" && token.value === "}") {
        position += 1;
        break;
      }
      if (token.kind === "punct") {
        fail("dict key", token, `expected a key, found "${token.value}"`);
      }
      position += 1;
      const key = token.value;

      const equals = peek();
      if (
        equals === undefined ||
        equals.kind !== "punct" ||
        equals.value !== "="
      ) {
        fail('dict key "' + key + '"', equals, 'expected "=" after the key');
      }
      position += 1;

      const value = parseValue(depth);

      const semicolon = peek();
      if (
        semicolon === undefined ||
        semicolon.kind !== "punct" ||
        semicolon.value !== ";"
      ) {
        fail(
          'dict entry "' + key + '"',
          semicolon,
          'expected ";" after the value',
        );
      }
      position += 1;

      entries.push({
        key,
        keyLine: token.line,
        keyColumn: token.column,
        value,
      });
    }
    return {
      kind: "dict",
      entries,
      line: open.line,
      column: open.column,
    };
  };

  const parseArray = (open: Token, depth: number): PlistValue => {
    position += 1;
    const values: PlistValue[] = [];
    for (;;) {
      const token = peek();
      if (token === undefined) fail("array", open, 'expected ")"');
      if (token.kind === "punct" && token.value === ")") {
        position += 1;
        break;
      }
      values.push(parseValue(depth));

      const separator = peek();
      if (
        separator !== undefined &&
        separator.kind === "punct" &&
        separator.value === ","
      ) {
        // A trailing comma is legal (`( 1, )` occurs in the corpus): consume it
        // and let the loop meet the `)` on the next iteration.
        position += 1;
        continue;
      }
      if (
        separator !== undefined &&
        separator.kind === "punct" &&
        separator.value === ")"
      ) {
        position += 1;
        break;
      }
      // Anything else is a missing comma, not two adjacent values.
      fail("array", separator, 'expected "," or ")" after the value');
    }
    return {
      kind: "array",
      values,
      line: open.line,
      column: open.column,
    };
  };

  if (tokens.length === 0) {
    // An empty or comment-only file parses to an explicit empty dictionary —
    // distinct from a parse failure and from `undefined`.
    return { kind: "dict", entries: [], line: 1, column: 1 };
  }

  const root = parseValue(0);
  const trailing = peek();
  if (trailing !== undefined) {
    fail("document", trailing, "unexpected content after the root value");
  }
  return root;
}
