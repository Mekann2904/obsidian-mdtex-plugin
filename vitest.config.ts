// File: vitest.config.ts
// Purpose: Vitest の設定を集約し、Obsidian 依存を解決する。
// Reason: テストを安定実行し、CI 環境とローカルの挙動を揃えるため。
// Related: tsconfig.json, package.json, .github/workflows/release.yml, src/MdTexPlugin.ts

import path from "path";
import { defineConfig } from "vitest/config";

// サンプルテンプレートパックの補助ファイル（.tex/.lua/.yaml）を文字列として取り込む
// （ADR-008）。esbuild 側と同等の text loader を Rollup プラグインで再現し、
// テスト実行時にこれらのファイルが JS としてパースされるのを防ぐ。
function rawTextLoader() {
  return {
    name: "mdtex-raw-text-loader",
    transform(_code: string, id: string) {
      if (/\.(tex|lua|yaml)$/.test(id)) {
        // ファイルを文字列定数として default export する JS に変換する。
        const fs = require("fs") as typeof import("fs");
        const content = fs.readFileSync(id, "utf8");
        return {
          code: `export default ${JSON.stringify(content)};`,
          map: null,
        };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [rawTextLoader()],
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
