import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png", "licenses/*"],
      manifest: {
        name: "Quiet Knight — Chess, at your pace",
        short_name: "Quiet Knight",
        description:
          "Private, offline chess with a thoughtful engine opponent.",
        theme_color: "#172b26",
        background_color: "#f4f1e9",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 20000000,
        globPatterns: ["**/*.{js,css,html,svg,wasm,txt}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  test: { include: ["tests/**/*.test.js"] },
});
