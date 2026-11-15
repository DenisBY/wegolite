// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The AI registry (D-11): `AiKey` to module. Frozen at runtime so neither the
 * table nor a registered module can be mutated. Lookup only, never iterated.
 */

import { FLIGHT_SCRIPT } from "./pilots/flight-script.js";
import { TEST_PILOT } from "./pilots/test-pilot.js";
import type { AiKey, AiModule } from "./types.js";

export const AI_REGISTRY: Readonly<Record<AiKey, AiModule>> = Object.freeze({
  "test-pilot": Object.freeze(TEST_PILOT),
  "flight-script": Object.freeze(FLIGHT_SCRIPT),
});
