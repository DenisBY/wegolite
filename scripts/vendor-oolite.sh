#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# vendor-oolite.sh is the single authority for the vendored Oolite bytes and for
# every provenance hash derived from them (D-01, D-02, T-02-09).
#
# A human runs it deliberately. It is never part of `verify`, and no build ever
# touches the network. The bytes of the FILES list at the pinned commit come
# from one of two sources:
#
# 1. Network (the original route): the script downloads each path from
#    raw.githubusercontent.com at the pinned commit.
#
#      docker compose run --rm assets sh scripts/vendor-oolite.sh
#
# 2. Local (owner decision 2026-11-16, Phase 16 D16-02): the bytes come from a
#    local Oolite checkout, never its working tree but the pinned commit's git
#    blobs, exported on the host (the container has no git). From the
#    repository root:
#
#      sh scripts/vendor-oolite.sh --export-pin <oolite-checkout> <out-dir>
#      docker compose run --rm -v <out-dir>:/oolite-pin:ro \
#        -e OOLITE_LOCAL=/oolite-pin/Resources \
#        -e OOLITE_PINNED_SHA256=/oolite-pin/pinned.sha256 \
#        assets sh scripts/vendor-oolite.sh
#      docker compose run --rm lint npx prettier --write ASSETS.md
#
#    The --export-pin step needs only sh, git and sha256sum, writes nothing
#    inside the repository, and records `# commit <full sha>` and one
#    `<sha256>  <path>` line per FILES path in <out-dir>/pinned.sha256. The
#    local mode is a stricter source, not an escape: it verifies every byte
#    against that list, and it refuses, before writing anything, any change to
#    a digest already committed in third_party/oolite/CHECKSUMS.sha256.
#
# Either way the script then rewrites third_party/oolite/CHECKSUMS.sha256 and
# third_party/oolite/pin.json, and replaces the trailing SHA-256 cell of every
# third_party/oolite/ row in ASSETS.md with the digest it just computed —
# including the CHECKSUMS.sha256 row itself, whose digest is taken after that
# file is written. No provenance hash is ever typed or copied out of band.
#
# A vendored path with no ASSETS.md row is an error: add the row (with its
# provenance cells) and re-run. There is no --force and no allowlist.
set -eu

RELEASE="1.93.1-241"
COMMIT="7437f22"
# The full SHA the short COMMIT names. Every route compares this exact value; the
# short form is only the display identity written to pin.json.
FULL_COMMIT="7437f22a543c442830774dea0f2cad4e59c04cbb"
RETRIEVED="2026-11-03"
case "$FULL_COMMIT" in
  "$COMMIT"*) ;;
  *) echo "vendor-oolite: FULL_COMMIT does not extend COMMIT" >&2; exit 1 ;;
esac
BASE_URL="https://raw.githubusercontent.com/OoliteProject/oolite/${FULL_COMMIT}/Resources"

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
Models/oolite_adder.dat
Models/oolite_alloy.dat
Models/oolite_barrel.dat
Models/oolite_buoy.dat
Models/oolite_buoy_subents.dat
Models/oolite_cobra3.dat
Models/oolite_cobramk1.dat
Models/oolite_coriolis.dat
Models/oolite_coriolis_dock.dat
Models/oolite_coriolis_faceplate.dat
Models/oolite_coriolis_tris.dat
Models/oolite_gecko.dat
Models/oolite_krait.dat
Models/oolite_mamba.dat
Models/oolite_moray.dat
Models/oolite_shuttle.dat
Models/oolite_sidewinder.dat
Models/oolite_viper.dat
Models/wreck1.dat
Models/wreck2.dat
Models/wreck3.dat
Models/wreck4.dat
Models/wreck5.dat
Models/oolite_asp.dat
Textures/oolite-nebula-1.png
Textures/oolite-nebula-2.png
Textures/oolite-nebula-3.png
Textures/oolite-nebula-4.png
Textures/oolite-particle-cloud2.png
Textures/oolite-particle-flash.png
Textures/oolite_adder_diffuse.png
Textures/oolite_adder_normal.png
Textures/oolite_adder_specular.png
Textures/oolite_alloy_diffuse.png
Textures/oolite_barrel_diffuse.png
Textures/oolite_barrel_normal.png
Textures/oolite_barrel_specular.png
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
Textures/oolite_cobramk1_diffuse.png
Textures/oolite_cobramk1_normal.png
Textures/oolite_cobramk1_specular.png
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
Textures/oolite_gecko_diffuse.png
Textures/oolite_gecko_normal.png
Textures/oolite_gecko_specular.png
Textures/oolite_gecko_subents.png
Textures/oolite_gecko_subents_normal.png
Textures/oolite_gecko_subents_specular.png
Textures/oolite_krait_diffuse.png
Textures/oolite_krait_normal.png
Textures/oolite_krait_specular.png
Textures/oolite_mamba_diffuse.png
Textures/oolite_mamba_normal.png
Textures/oolite_mamba_specular.png
Textures/oolite_mamba_subents.png
Textures/oolite_mamba_subents_normal.png
Textures/oolite_moray_diffuse.png
Textures/oolite_moray_normal.png
Textures/oolite_moray_specular.png
Textures/oolite_moray_subents.png
Textures/oolite_moray_subents_normal.png
Textures/oolite_shuttle_diffuse.png
Textures/oolite_shuttle_normal.png
Textures/oolite_shuttle_specular.png
Textures/oolite_sidewinder_diffuse.png
Textures/oolite_sidewinder_normal.png
Textures/oolite_sidewinder_specular.png
Textures/oolite_viper_diffuse.png
Textures/oolite_viper_normal.png
Textures/wreck.png
Textures/oolite_asp_diffuse.png
Textures/oolite_asp_normal.png
Textures/oolite_asp_specular.png
Textures/oolite_asp_subents.png
"

# Host-only export of the pinned commit's blobs (the local route, step 1). It
# runs before the cd below so that relative arguments mean what the caller
# typed, and it never writes inside the repository.
if [ "${1:-}" = "--export-pin" ]; then
  if [ "$#" -ne 3 ]; then
    echo "usage: sh scripts/vendor-oolite.sh --export-pin <oolite-checkout> <out-dir>" >&2
    exit 2
  fi
  checkout=$2
  out=$3
  repo=$(cd "$(dirname "$0")/.." && pwd -P)
  case "$out" in
    /*) out_abs=$out ;;
    *) out_abs=$(pwd -P)/$out ;;
  esac
  if [ -d "$out_abs" ]; then
    out_abs=$(cd "$out_abs" && pwd -P)
  fi
  case "$out_abs/" in
    "$repo"/*)
      echo "vendor-oolite: --export-pin refuses an out-dir inside the repository: $out" >&2
      exit 1
      ;;
  esac
  if ! full=$(git -C "$checkout" rev-parse --verify --quiet "${FULL_COMMIT}^{commit}"); then
    echo "vendor-oolite: $checkout has no commit ${FULL_COMMIT}" >&2
    exit 1
  fi
  mkdir -p "$out_abs/Resources"
  list="$out_abs/pinned.sha256"
  partial="$list.partial"
  printf '# commit %s\n' "$full" >"$partial"
  for path in $FILES; do
    case "$path" in
      /* | *..*)
        echo "vendor-oolite: refusing unsafe path: $path" >&2
        exit 1
        ;;
    esac
    target="$out_abs/Resources/$path"
    mkdir -p "$(dirname "$target")"
    if ! git -C "$checkout" cat-file blob "${full}:Resources/${path}" >"$target"; then
      rm -f "$target"
      echo "vendor-oolite: no blob for $path at $full" >&2
      exit 1
    fi
    if ! (cd "$out_abs/Resources" && sha256sum "$path") >>"$partial"; then
      echo "vendor-oolite: cannot hash $path" >&2
      exit 1
    fi
    echo "vendor-oolite: exported $path ($(wc -c <"$target" | tr -d ' ') bytes)"
  done
  mv "$partial" "$list"
  echo "vendor-oolite: wrote $list for commit $full"
  exit 0
fi

cd "$(dirname "$0")/.."

MODE="network"
if [ -n "${OOLITE_LOCAL:-}" ] || [ -n "${OOLITE_PINNED_SHA256:-}" ]; then
  if [ -z "${OOLITE_LOCAL:-}" ] || [ -z "${OOLITE_PINNED_SHA256:-}" ]; then
    echo "vendor-oolite: the local mode needs both OOLITE_LOCAL and OOLITE_PINNED_SHA256" >&2
    exit 1
  fi
  MODE="local"
fi

if [ "$MODE" = "local" ]; then
  # Verify every path against the pinned list and the committed digests first,
  # and write only when all of them pass.
  # shellcheck disable=SC2086 # FILES is a whitespace-separated path list.
  node --input-type=module -e '
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

const [localRoot, pinnedPath, commit, ...paths] = process.argv.slice(1);
const ROOT = "third_party/oolite";

function fail(message) {
  console.error(`vendor-oolite: ${message}`);
  process.exit(1);
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

const pinnedText = await readOptional(pinnedPath);
if (pinnedText === "") fail(`cannot read the pinned list ${pinnedPath}`);
const pinned = new Map();
let pinnedCommit;
for (const line of pinnedText.split("\n")) {
  if (line === "") continue;
  const commitLine = /^# commit ([0-9a-f]{40})$/.exec(line);
  if (commitLine !== null) {
    pinnedCommit = commitLine[1];
    continue;
  }
  const entry = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(line);
  if (entry === null) fail(`malformed line in ${pinnedPath}: ${line}`);
  if (pinned.has(entry[2])) fail(`duplicate entry in ${pinnedPath}: ${entry[2]}`);
  pinned.set(entry[2], entry[1]);
}
if (pinnedCommit !== commit) {
  fail(`${pinnedPath} is not an export of commit ${commit} (found ${pinnedCommit ?? "no commit line"})`);
}

const committed = new Map();
for (const line of (await readOptional(`${ROOT}/CHECKSUMS.sha256`)).split("\n")) {
  const entry = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
  if (entry !== null) committed.set(entry[2], entry[1]);
}

const verified = [];
const changed = [];
for (const path of paths) {
  if (isAbsolute(path) || path.includes("..")) fail(`refusing unsafe path: ${path}`);
  let bytes;
  try {
    bytes = await readFile(`${localRoot}/${path}`);
  } catch {
    fail(`${path}: missing from ${localRoot}`);
  }
  const expected = pinned.get(path);
  if (expected === undefined) fail(`${path}: no entry in ${pinnedPath}`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    fail(`${path}: SHA-256 ${actual} does not match the pinned ${expected}`);
  }
  const target = `${ROOT}/${path}`;
  const previous = committed.get(target);
  if (previous !== undefined && previous !== actual) changed.push(target);
  verified.push({ target, bytes });
}
if (changed.length > 0) {
  fail(`committed digest changed for: ${changed.join(", ")}`);
}

for (const { target, bytes } of verified) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`vendor-oolite: copied ${target} (${bytes.length} bytes) from the pinned export`);
}
' "$OOLITE_LOCAL" "$OOLITE_PINNED_SHA256" "$FULL_COMMIT" $FILES
else
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
fi

node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [release, commit, retrieved, mode] = process.argv.slice(1);
const ROOT = "third_party/oolite";
const CHECKSUMS = `${ROOT}/CHECKSUMS.sha256`;
const PIN = `${ROOT}/pin.json`;

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

// Read the committed digests before anything below rewrites them.
let committedText = "";
try {
  committedText = await readFile(CHECKSUMS, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const committed = new Map();
for (const line of committedText.split("\n")) {
  const entry = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
  if (entry !== null) committed.set(entry[2], entry[1]);
}

const pin = { release, commit, retrieved };
const pinText = `${JSON.stringify(pin, null, 2)}\n`;

const files = (await walk(ROOT)).sort();
const digests = new Map();
for (const file of files) {
  if (file === CHECKSUMS || file === PIN) continue;
  const bytes = await readFile(file);
  digests.set(file, createHash("sha256").update(bytes).digest("hex"));
}
// pin.json is hashed as it is about to be written, so the check below runs
// before any file of the block is touched.
digests.set(PIN, createHash("sha256").update(pinText, "utf8").digest("hex"));

if (mode === "local") {
  const changed = [...committed.entries()]
    .filter(([file, hash]) => digests.get(file) !== hash)
    .map(([file]) => file);
  if (changed.length > 0) {
    console.error(`vendor-oolite: committed digest changed for: ${changed.join(", ")}`);
    process.exit(1);
  }
}

await writeFile(PIN, pinText, "utf8");

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
' "$RELEASE" "$COMMIT" "$RETRIEVED" "$MODE"
