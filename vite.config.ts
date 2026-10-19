import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths + hash routing let the build work from any GitHub Pages URL.
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 800 },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
