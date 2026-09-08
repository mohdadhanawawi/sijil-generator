import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves a project site under /<repo-name>/, so assets need
  // that prefix baked in at build time.
  base: "/sijil-generator/",
  plugins: [react()],
});
