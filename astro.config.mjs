// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

import node from "@astrojs/node";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://telelibre.site",
  output: "server",
  adapter: cloudflare(),
  integrations: [react(), sitemap()],
  vite: {
    build: {
      outDir: "dist",
      target: "esnext",
    },
    plugins: [tailwindcss()],
    resolve: {
      alias: import.meta.env.PROD
        ? { "react-dom/server": "react-dom/server.edge" }
        : undefined, // Ensure alias is only set if PROD is true
    },
  },
});