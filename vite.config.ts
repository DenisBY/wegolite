// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { defineConfig } from "vite";

export default defineConfig({
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
