import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            rollupOptions: {
              input: {
                main: "electron/main.ts",
                "page-preload": "electron/page-preload.ts",
              },
              external: ["sql.js", "jsdom", "@mozilla/readability", "electron-updater"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
      },
      renderer: {},
    }),
  ],
});
