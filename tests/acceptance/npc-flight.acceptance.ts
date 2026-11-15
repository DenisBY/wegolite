// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

// The NPC flight acceptance run (npm run test:acceptance). Every epoch, threshold and
// detector lives in thresholds.ts and detectors.ts; this file only registers the run.
import { it } from "vitest";
import { ACCEPTED_HULL_CROSSINGS } from "./accepted-crossings.js";
import { registerAcceptanceRun } from "./detectors.js";

registerAcceptanceRun(it, ACCEPTED_HULL_CROSSINGS);
