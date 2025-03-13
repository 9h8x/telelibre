// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: 'https://telelibre.site',
  output: "server",
  adapter: cloudflare(),
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
      allowedHosts: ["dev.jns.net.ar"], // added this
    },
    plugins: [tailwindcss()],
    resolve: {
      alias: import.meta.env.PROD
        ? { "react-dom/server": "react-dom/server.edge" }
        : undefined, // Ensure alias is only set if PROD is true
    },
  },
});
