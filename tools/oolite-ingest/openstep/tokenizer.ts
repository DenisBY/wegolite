// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * OpenStep ASCII plist tokenizer (DATA-01).
 *
 * Four states are enough for the pinned corpus: default (skip whitespace and
 * comments), quoted string, bare token, punctuation. The scanner is character
 * based — deliberately not line based — because an `=` and its `{` may be
 * separated by a newline (`"oolite_template_cobra3" =\n{` in shipdata.plist):
 * a line-oriented reader silently drops 194 entries.
 *
 * Every token carries the 1-based line and column of its first character.
 * Malformed input throws a `ContentError` with `PLIST_PARSE` and the position
 * of the offending byte, never a coerced value.
 */

import { contentError, sourceExcerpt } from "../content-error.js";

export interface Token {
  readonly kind: "punct" | "string" | "bare";
  readonly value: string;
  readonly line: number;
  readonly column: number;
}

const PUNCTUATION = new Set(["{", "}", "(", ")", "=", ";", ","]);

function isWhitespace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\r" ||
    character === "\n"
  );
}

function isOctal(character: string): boolean {
  return character >= "0" && character <= "7";
}

export function tokenize(source: string, file: string): Token[] {
  const tokens: Token[] = [];
  // A UTF-8 BOM is not part of the grammar; strip it defensively.
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let column = 1;

  const current = (): string => source[index] ?? "";

  const advance = (): string => {
    const character = current();
    index += 1;
    if (character === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return character;
  };

  const fail = (
    construct: string,
    atLine: number,
    atColumn: number,
    detail: string,
  ): never => {
    throw contentError("PLIST_PARSE", file, construct, {
      line: atLine,
      column: atColumn,
      excerpt: `${detail}${sourceExcerpt(source, atLine) === "" ? "" : `: ${sourceExcerpt(source, atLine)}`}`,
    });
  };

  while (index < source.length) {
    const character = current();

    if (isWhitespace(character)) {
      advance();
      continue;
    }

    if (source.startsWith("//", index)) {
      while (index < source.length && current() !== "\n") advance();
      continue;
    }

    if (source.startsWith("/*", index)) {
      const startLine = line;
      const startColumn = column;
      advance();
      advance();
      let closed = false;
      while (index < source.length) {
        if (source.startsWith("*/", index)) {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        fail(
          "block comment",
          startLine,
          startColumn,
          "unterminated block comment",
        );
      }
      continue;
    }

    if (character === '"') {
      const startLine = line;
      const startColumn = column;
      advance();
      let value = "";
      let closed = false;
      while (index < source.length) {
        const inner = current();
        if (inner === '"') {
          advance();
          closed = true;
          break;
        }
        if (inner === "\n" || inner === "\r") {
          // A quoted string never spans a line in this grammar. Report the
          // opening quote, which is where the author's mistake begins, rather
          // than the newline the scanner happened to reach.
          fail(
            "string",
            startLine,
            startColumn,
            "raw newline in quoted string",
          );
        }
        if (inner === "\\") {
          advance();
          const escaped = current();
          if (escaped === "") break;
          if (isOctal(escaped)) {
            const escapeLine = line;
            const escapeColumn = column;
            let digits = "";
            while (digits.length < 3 && isOctal(current())) {
              digits += advance();
            }
            const code = Number.parseInt(digits, 8);
            if (code > 0xff) {
              fail(
                "escape",
                escapeLine,
                escapeColumn,
                `octal escape \\${digits} exceeds 255`,
              );
            }
            value += String.fromCharCode(code);
            continue;
          }
          advance();
          switch (escaped) {
            case "n":
              value += "\n";
              break;
            case "t":
              value += "\t";
              break;
            case "r":
              value += "\r";
              break;
            case "b":
              value += "\b";
              break;
            case "f":
              value += "\f";
              break;
            case "v":
              value += "\v";
              break;
            case "a":
              value += "\u0007";
              break;
            case '"':
              value += '"';
              break;
            case "'":
              value += "'";
              break;
            case "\\":
              value += "\\";
              break;
            default:
              // Not a C escape: Oolite keeps the literal character. Regexes in
              // gpu-settings.plist rely on this (a doubled backslash arrives
              // here as backslash + "b").
              value += escaped;
              break;
          }
          continue;
        }
        value += advance();
      }
      if (!closed) {
        fail("string", startLine, startColumn, "unterminated string");
      }
      tokens.push({
        kind: "string",
        value,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    if (PUNCTUATION.has(character)) {
      tokens.push({ kind: "punct", value: character, line, column });
      advance();
      continue;
    }

    const startLine = line;
    const startColumn = column;
    let value = "";
    while (index < source.length) {
      const inner = current();
      if (isWhitespace(inner) || PUNCTUATION.has(inner) || inner === '"') break;
      value += advance();
    }
    if (value === "") {
      fail(
        "token",
        startLine,
        startColumn,
        `unexpected character "${current()}"`,
      );
    }
    tokens.push({ kind: "bare", value, line: startLine, column: startColumn });
  }

  return tokens;
}
