// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Turns zod's JIT off before any schema is built (QUAL-08, T-07-02).
 *
 * zod 4 probes `new Function("")` the first time a schema is constructed, to
 * decide whether it may compile fast parsers. The shipped policy
 * (`script-src 'self'`, no `unsafe-eval`) refuses that probe, and the browser
 * reports a `securitypolicyviolation` even though zod swallows the throw.
 * `jitless` skips the probe and takes zod's interpreted parse path, which is
 * the path zod itself expects under a strict CSP. Validation results are the
 * same on both paths.
 *
 * Schemas are built at module evaluation time, so this module must be the
 * first import of src/main.ts: the setting has to land before any schema exists.
 */

import { config } from "zod";

config({ jitless: true });
