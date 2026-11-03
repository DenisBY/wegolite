// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one structured failure type the content toolchain reports (D-17, T-02-01).
 *
 * Every parse, schema, mesh or texture failure becomes a `ContentError` carrying
 * a stable `code`, a repository-relative `file`, the offending `construct`, and —
 * where the failure came from text — 1-based `line` and `column` plus a short
 * single-line `excerpt`. The CLI prints it and exits non-zero; tests assert the
 * code, file and construct.
 *
 * Never include more than the excerpt of the offending source: a stack trace or
 * a whole file body turns one bad byte into a megabyte of noise.
 */

export type ContentErrorCode =
  | "PLIST_PARSE"
  | "LIKE_SHIP_CYCLE"
  | "LIKE_SHIP_DANGLING"
  | "DAT_MESH"
  | "SCHEMA"
  | "TEXTURE_MISSING"
  | "MESH_BOUNDS";

export interface ContentErrorOptions {
  readonly line?: number;
  readonly column?: number;
  readonly chain?: readonly string[];
  readonly excerpt?: string;
}

const MAX_EXCERPT = 120;

function describe(
  code: ContentErrorCode,
  file: string,
  construct: string,
  line: number | undefined,
  column: number | undefined,
  excerpt: string,
): string {
  const location =
    line === undefined
      ? ""
      : column === undefined
        ? `:${String(line)}`
        : `:${String(line)}:${String(column)}`;
  return `${code} ${file}${location} ${construct} — ${excerpt}`;
}

/**
 * Collapse one source line into a bounded excerpt.
 *
 * The line is 1-based; an out-of-range line yields an empty excerpt rather than
 * throwing, because a malformed file may report a position one past its last
 * byte.
 */
export function sourceExcerpt(source: string, line: number): string {
  const text = source.split("\n")[line - 1] ?? "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_EXCERPT
    ? `${collapsed.slice(0, MAX_EXCERPT - 1)}…`
    : collapsed;
}

export class ContentError extends Error {
  readonly code: ContentErrorCode;
  readonly file: string;
  readonly construct: string;
  readonly line?: number;
  readonly column?: number;
  readonly chain?: readonly string[];
  readonly excerpt: string;

  constructor(
    code: ContentErrorCode,
    file: string,
    construct: string,
    options: ContentErrorOptions = {},
  ) {
    const excerpt = options.excerpt ?? "";
    super(
      describe(code, file, construct, options.line, options.column, excerpt),
    );
    this.name = "ContentError";
    this.code = code;
    this.file = file;
    this.construct = construct;
    this.excerpt = excerpt;
    // `exactOptionalPropertyTypes` is on: an absent position is an absent
    // property, never an explicit `undefined`.
    if (options.line !== undefined) this.line = options.line;
    if (options.column !== undefined) this.column = options.column;
    if (options.chain !== undefined) this.chain = options.chain;
  }
}

export function contentError(
  code: ContentErrorCode,
  file: string,
  construct: string,
  options: ContentErrorOptions = {},
): ContentError {
  return new ContentError(code, file, construct, options);
}

export function isContentError(value: unknown): value is ContentError {
  return value instanceof ContentError;
}

/** `CODE file:line:column construct — excerpt`, omitting absent positions. */
export function formatContentError(error: ContentError): string {
  return describe(
    error.code,
    error.file,
    error.construct,
    error.line,
    error.column,
    error.excerpt,
  );
}
