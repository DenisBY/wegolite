// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

// The one path rule for the NPC ship models fetched on demand (DATA-13). It is
// shared by the NPC ship record schema and, from plan 09-05, by the render
// asset cache. The module has no import on purpose: the render layer can use
// the rule without pulling in zod or a schema module.

export const NPC_GLB_PATH_PATTERN = /^models\/[a-z0-9][a-z0-9_-]*\.glb$/;
