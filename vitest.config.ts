import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the app build never pulls in vitest's
// nested Vite copy (which otherwise clashes with @vitejs/plugin-react's types).
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
