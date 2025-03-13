// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

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

    plugins: [tailwindcss()],
  },

  output: "server",
  adapter: cloudflare(),
});