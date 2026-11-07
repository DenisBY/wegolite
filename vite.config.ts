// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

/** The licence documents the built site must carry (QUAL-07). */
const COMPLIANCE_DOCUMENTS = ["NOTICE", "LICENSE", "ASSETS.md"] as const;

/**
 * Ships NOTICE, LICENSE and ASSETS.md inside the build output (QUAL-07, D-03,
 * research Pattern 1).
 *
 * The sources are the repository-root files, resolved from this config file's
 * directory rather than `process.cwd()`. They are emitted as build assets, so
 * `dist/` carries byte-identical copies. They never go under `public/`: every
 * `public/` file needs an ASSETS.md row (tests/compliance-assets.test.ts), and a
 * licence document is not an asset.
 */
function shipComplianceDocs(): Plugin {
  const root = fileURLToPath(new URL(".", import.meta.url));
  return {
    name: "wegolite-compliance-docs",
    apply: "build",
    generateBundle() {
      for (const fileName of COMPLIANCE_DOCUMENTS) {
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(join(root, fileName)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [shipComplianceDocs()],
  // Static hosting: every asset path is relative to index.html.
  base: "./",
  server: {
    // Vite defaults to `localhost`, which the container's published port
    // cannot reach. `strictPort` fails loudly instead of silently moving to
    // 5174 and breaking the documented URL.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      // Opt-in only: polling is the WSL2/macOS workaround and costs CPU.
      usePolling: Boolean(process.env.VITE_USE_POLLING),
    },
    // `allowedHosts` stays at its default (localhost + IP addresses). Setting
    // it to `true` is a DNS-rebinding footgun and is never needed here.
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    // Deliberate: the source is GPL and public by design.
    sourcemap: true,
  },
});
