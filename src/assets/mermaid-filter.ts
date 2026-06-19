// File: src/assets/mermaid-filter.ts
// Purpose: Mermaid コードブロックの言語削除を AST ベースで行う Pandoc Lua フィルタ（pdf/latex 用）。
// Reason: 従来 stripMermaidLanguage（TS 正規表現）で文字列処理していたが、ADR-005 の
//   「純粋変換は Lua」へ合致するため Lua フィルタへ移行した。AST ベースのため:
//   - 文字列として現れる ```mermaid の誤爆がない（実際の CodeBlock ノードだけを処理）
//   - トランスクルージョン先の mermaid ブロックも漏れなく処理される
//   - Pandoc の --listings が unknown language 警告を出さないよう言語を削除する
// Related: src/services/convertService.ts, src/assets/callout-filter.ts, src/assets/docxTexFilter.ts,
//   docs/design-decisions.md (ADR-005)

// 実行時に一時ファイルへ書き出して `--lua-filter` で渡す。
export const MERMAID_STRIP_LUA_FILTER = `
-- mermaid-filter.lua
-- Mermaid コードブロック（\`\`\`mermaid ...）の言語クラスを削除し、プレーンコードブロックへ
-- 変換する。Pandoc の --listings が "mermaid" を未知の言語として警告を出すのを防ぐため。
-- 実験的 Mermaid（rasterizeMermaidBlocks で PNG 化）が無効な場合のみ適用される。

function CodeBlock(el)
  if el.classes:includes("mermaid") then
    -- 言語クラスをすべて削除し、identifier と attributes のみ保持したプレーンコードブロックへ。
    -- 実 Pandoc 検証（mermaidFilter.integration.test.ts）で、言語なしコードブロックと
    -- 出力が完全一致することを確認済み。
    local newAttrs = pandoc.Attr(el.identifier, {}, el.attributes)
    return pandoc.CodeBlock(el.text, newAttrs)
  end
  return nil
end
`;
