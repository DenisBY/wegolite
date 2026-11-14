# Phase 11: Minimal Save Schema v3 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 11-minimal-save-schema-v3
**Areas discussed:** World counters, v1/v2 → v3 migration, Leg-anchor semantics, Gate and size

## World counters
Options: epoch + nextEntityId ✓ / plus a jump-arrival counter / epoch only.
**User's choice:** epoch + nextEntityId.

## Migration
Options: epoch=0 with required fields ✓ / epoch=0 with optional fields.
**User's choice:** epoch=0, required fields.

## Leg-anchor semantics (bad epoch)
Options: schema rejects ✓ / validation passes with a UI notice.
**User's choice:** schema rejects (corrupt path).

## Gate and size
Options: Vitest test ✓ / plus a browser smoke.
**User's choice:** Vitest test.

## Claude's Discretion
Field naming, golden layout, schema type naming.

## Deferred Ideas
SAVE-09 fields, cost-basis todo, SAVE-10.
