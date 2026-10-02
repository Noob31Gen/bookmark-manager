import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        manager: path.resolve(__dirname, "manager.html"),
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        popup: path.resolve(__dirname, "popup.html"),
        options: path.resolve(__dirname, "options.html"),
        background: path.resolve(__dirname, "src/background/serviceWorker.ts"),
        content: path.resolve(__dirname, "src/content/extractor.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") return "background.js"
          if (chunkInfo.name === "content") return "content.js"
          return "assets/[name]-[hash].js"
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
})
