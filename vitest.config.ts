// File: vitest.config.ts
// Purpose: Vitest の設定を集約し、Obsidian 依存を解決する。
// Reason: テストを安定実行し、CI 環境とローカルの挙動を揃えるため。
// Related: tsconfig.json, package.json, .github/workflows/release.yml, src/MdTexPlugin.ts

import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
    },
    environmentMatchGlobs: [
      ["**/*.dom.test.ts", "jsdom"],
    ],
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
