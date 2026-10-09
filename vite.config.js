import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: { "/host-api": { target: "http://127.0.0.1:4304" } },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/.git/**",
        "**/services/api/data/**",
        "**/services/host/data/**",
        "**/store*.json",
        "**/*.pem",
        "**/*.key",
      ],
    },
  },
  build: {
    outDir: "dist/apps",
    rollupOptions: {
      input: {
        admin: "apps/admin/index.html",
        about: "apps/about/index.html",
        agent: "apps/agent/index.html",
        site: "apps/dummy-site/index.html",
        siteAdmin: "apps/dummy-site/admin.html",
      },
    },
  },
});
