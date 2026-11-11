#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# vendor-oolite.sh is the single authority for the vendored Oolite bytes and for
# every provenance hash derived from them (D-01, D-02, T-02-09).
#
# A human runs it deliberately, through the container:
#
#   docker compose run --rm assets sh scripts/vendor-oolite.sh
#
# It is never part of `verify`, and no build ever touches the network. The
# script downloads the FILES list at the pinned commit, rewrites
# third_party/oolite/CHECKSUMS.sha256 and third_party/oolite/pin.json, and then
# replaces the trailing SHA-256 cell of every third_party/oolite/ row in
# ASSETS.md with the digest it just computed — including the CHECKSUMS.sha256
# row itself, whose digest is taken after that file is written. No provenance
# hash is ever typed or copied out of band.
#
# A vendored path with no ASSETS.md row is an error: add the row (with its
# provenance cells) and re-run. There is no --force, no allowlist and no
# environment-variable escape.
set -eu
cd "$(dirname "$0")/.."

RELEASE="1.93.1-241"
COMMIT="7437f22"
RETRIEVED="2026-11-03"
BASE_URL="https://raw.githubusercontent.com/OoliteProject/oolite/${COMMIT}/Resources"

# Ordered list of vendored paths, relative to Resources/. Later plans append to
# this list; nothing else decides what is vendored.
FILES="
Config/autoAImap.plist
Config/characters.plist
Config/crosshairs.plist
Config/customsounds.plist
Config/demoships.plist
Config/descriptions.plist
Config/equipment.plist
Config/explosions.plist
Config/global-settings.plist
Config/gpu-settings.plist
Config/gui-settings.plist
Config/hud-small.plist
Config/hud.plist
Config/javascript-errors.plist
Config/keyconfig.plist
Config/keyconfig2.plist
Config/keymappings_linux.plist
Config/keymappings_mac.plist
Config/keymappings_windows.plist
Config/logcontrol.plist
Config/material-defaults.plist
Config/missiontext.plist
Config/nebulatextures.plist
Config/oolite-font.plist
Config/pirate-victim-roles.plist
Config/planetinfo.plist
Config/role-categories.plist
Config/scenarios.plist
Config/screenbackgrounds.plist
Config/shader-uniform-bindings.plist
Config/shipdata-overrides.plist
Config/shipdata.plist
Config/shiplibrary.plist
Config/shipyard.plist
Config/speech_pronunciation_guide.plist
Config/startextures.plist
Config/trade-goods.plist
Config/verifyOXP.plist
Config/whitelist.plist
Config/world-scripts.plist
Models/oolite_buoy.dat
Models/oolite_buoy_subents.dat
Models/oolite_cobra3.dat
Models/oolite_coriolis.dat
Models/oolite_coriolis_dock.dat
Models/oolite_coriolis_faceplate.dat
Models/oolite_coriolis_tris.dat
Textures/oolite-nebula-1.png
Textures/oolite-nebula-2.png
Textures/oolite-nebula-3.png
Textures/oolite-nebula-4.png
Textures/oolite_buoy_diffuse.png
Textures/oolite_buoy_illumination.png
Textures/oolite_buoy_normal.png
Textures/oolite_buoy_specular.png
Textures/oolite_buoy_subents.png
Textures/oolite_cobra3_diffuse.png
Textures/oolite_cobra3_normal.png
Textures/oolite_cobra3_specular.png
Textures/oolite_cobra3_subents.png
Textures/oolite_cobra3_subents_normal.png
Textures/oolite_coriolis_diffuse.png
Textures/oolite_coriolis_dock_diffuse.png
Textures/oolite_coriolis_dock_normal.png
Textures/oolite_coriolis_faceplate_diffuse.png
Textures/oolite_coriolis_faceplate_normal.png
Textures/oolite_coriolis_faceplate_specular.png
Textures/oolite_coriolis_normal.png
Textures/oolite_coriolis_specular.png
Textures/oolite_coriolis_tris_diffuse.png
Textures/oolite_coriolis_tris_normal.png
Textures/oolite_coriolis_tris_specular.png
"

for path in $FILES; do
  node --input-type=module -e '
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [url, target] = process.argv.slice(1);
const response = await fetch(url);
if (response.status !== 200) {
  console.error(`vendor-oolite: ${target}: HTTP ${response.status} from ${url}`);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
await mkdir(dirname(target), { recursive: true });
await writeFile(target, bytes);
console.log(`vendor-oolite: fetched ${target} (${bytes.length} bytes)`);
' "${BASE_URL}/${path}" "third_party/oolite/${path}"
done

node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [release, commit, retrieved] = process.argv.slice(1);
const ROOT = "third_party/oolite";
const CHECKSUMS = `${ROOT}/CHECKSUMS.sha256`;

/** Sorted recursive walk: directory order never reaches output or hashing. */
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files = [];
  for (const entry of entries) {
    const full = join(directory, entry.name).split("\\").join("/");
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

const pin = { release, commit, retrieved };
await writeFile(`${ROOT}/pin.json`, `${JSON.stringify(pin, null, 2)}\n`, "utf8");

const files = (await walk(ROOT)).sort();
const digests = new Map();
for (const file of files) {
  if (file === CHECKSUMS) continue;
  const bytes = await readFile(file);
  digests.set(file, createHash("sha256").update(bytes).digest("hex"));
}

const lines = [...digests.entries()]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([file, hash]) => `${hash}  ${file}`);
await writeFile(CHECKSUMS, `${lines.join("\n")}\n`, "utf8");

const checksums = await readFile(CHECKSUMS);
digests.set(CHECKSUMS, createHash("sha256").update(checksums).digest("hex"));

const assets = await readFile("ASSETS.md", "utf8");
const rows = assets.split("\n");
// Prettier pads every cell, so the path is followed by spaces before the pipe.
const rowPattern = /^\|\s*(third_party\/oolite\/[^|]+?)\s*\|/;
const rowIndex = new Map();
rows.forEach((line, index) => {
  const match = rowPattern.exec(line);
  if (match !== null && match[1] !== undefined) rowIndex.set(match[1], index);
});

const missing = [...digests.keys()].filter((file) => !rowIndex.has(file));
if (missing.length > 0) {
  console.error(`vendor-oolite: no ASSETS.md row for: ${missing.join(", ")}`);
  process.exit(1);
}

for (const [file, hash] of digests) {
  const index = rowIndex.get(file);
  if (index === undefined) continue;
  rows[index] = rows[index].replace(/\|[^|]*\|\s*$/, `| ${hash} |`);
}
await writeFile("ASSETS.md", rows.join("\n"), "utf8");

for (const [file, hash] of digests) {
  console.log(`vendor-oolite: ${hash}  ${file}`);
}
' "$RELEASE" "$COMMIT" "$RETRIEVED"
