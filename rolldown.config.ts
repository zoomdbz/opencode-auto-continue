import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
  },
  platform: "node",
  // @opencode/plugin (and effect) are provided by the opencode host at runtime and must not be
  // bundled. Node built-ins (fs, path) stay external via platform: "node".
  external: [/^@opencode\/plugin(\/|$)/, /^effect(\/|$)/],
});
