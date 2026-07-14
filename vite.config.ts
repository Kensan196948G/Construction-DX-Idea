import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const designSource = resolve(projectRoot, "Construction DX Idea (standalone).html");
const designRoute = "/design/construction-dx-idea.html";
const designSupportSource = resolve(projectRoot, "support.js");
const designSupportRoute = "/design/support.js";

function standaloneDesignPlugin(): Plugin {
  return {
    name: "construction-dx-standalone-design",
    buildStart() {
      if (!existsSync(designSource)) {
        this.error(`Required design file is missing: ${designSource}`);
      }
      if (!existsSync(designSupportSource)) {
        this.error(`Required design runtime is missing: ${designSupportSource}`);
      }
    },
    configureServer(server) {
      server.middlewares.use(designRoute, (_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(readFileSync(designSource));
      });
      server.middlewares.use(designSupportRoute, (_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(readFileSync(designSupportSource));
      });
    },
    closeBundle() {
      const target = resolve(projectRoot, "dist", designRoute.slice(1));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(designSource, target);

      const supportTarget = resolve(projectRoot, "dist", designSupportRoute.slice(1));
      mkdirSync(dirname(supportTarget), { recursive: true });
      copyFileSync(designSupportSource, supportTarget);
    },
  };
}

export default defineConfig({
  plugins: [react(), standaloneDesignPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: false,
  },
});
