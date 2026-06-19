// File: src/assets/text-imports.d.ts
// Purpose: esbuild の text loader で文字列として取り込む非 TS ファイルの型宣言（ADR-008）。
// Reason: tsc -noEmit で .tex / .lua / .yaml を文字列 import できるようにするため。
// Related: esbuild.config.mjs, src/assets/sampleTemplatePacks.ts

declare module "*.tex" {
  const content: string;
  export default content;
}

declare module "*.lua" {
  const content: string;
  export default content;
}

declare module "*.yaml" {
  const content: string;
  export default content;
}
