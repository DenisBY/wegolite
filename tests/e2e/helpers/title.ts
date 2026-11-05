// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared New-game starter (G-04-3).
 *
 * New game asks for confirmation when boot found a clearable save. A spec whose
 * intent is "start a fresh docked game" must accept that prompt rather than
 * silently change meaning (or switch to Continue), so both the first boot and a
 * post-reload click go through here. A boot with no clearable save never shows
 * the prompt, so the visibility check rather than a fixed wait serves both
 * cases. Specs that test the gate itself assert its visibility explicitly.
 */

import type { Page } from "@playwright/test";

export async function startNewGame(page: Page): Promise<void> {
  await page.click("#title-start");
  const confirm = page.locator("#title-confirm");
  if (await confirm.isVisible()) {
    await confirm.locator("#title-confirm-accept").click();
  }
}
