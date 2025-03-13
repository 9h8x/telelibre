// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: 'https://telelibre.site',
  integrations: [react(), sitemap()],

  vite: {
    build: {
      outDir: "dist",
      target: "esnext",
    },
    preview: {
      port: 3000,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
    },
    server: {
      cors: {
        origin: ["https://dev.jns.net.ar"],
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type"],
      },
      allowedHosts: ["dev.jns.net.ar"], //added this
    },

    resolve: {
      // Use react-dom/server.edge instead of react-dom/server.browser for React 19.
      // Without this, MessageChannel from node:worker_threads needs to be polyfilled.
      alias: import.meta.env.PROD && {
        "react-dom/server": "react-dom/server.edge",
      },

    plugins: [tailwindcss()],
  },

  output: "server",
  adapter: cloudflare(),
});