// File: esbuild.cli.config.mjs
// Purpose: mdtex CLI（src/cli/index.ts）を dist/cli.js にバンドルする。
// Reason: プラグイン（main.js）とは別エントリ・別設定。CLI は Obsidian に依存せず
//          Node 組み込みのみ使う。package.json の version を CLI_VERSION として注入。
// Related: src/cli/index.ts, package.json, esbuild.config.mjs（プラグイン用）

import esbuild from "esbuild";
import process from "process";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2018",
  outfile: "dist/cli.js",
  sourcemap: prod ? false : "inline",
  minify: prod,
  // src/cli/index.ts の declare const CLI_VERSION を package.json の version で置換。
  define: {
    CLI_VERSION: JSON.stringify(pkg.version),
  },
  logLevel: "info",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
