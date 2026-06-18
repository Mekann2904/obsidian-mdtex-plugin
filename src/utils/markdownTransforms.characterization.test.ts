// File: src/utils/markdownTransforms.characterization.test.ts
// Purpose: stripObsidianComments の現状振る舞いを characterization test として録音する。
// Reason: AST 基盤化リファクタリング（ADR-005/006）の前提となる安全網。
//   現状コード（バグ含む可能性）の入出力をそのまま固定し、リファクタ前後で
//   「同じ入力 → 同じ出力」を保証する。正しさの証明ではなく振る舞いの保存証明。
// Related: src/utils/markdownTransforms.ts, docs/design-decisions.md (ADR-005/006),
//   CONTEXT.md

import { describe, it, expect } from "vitest";
import { stripObsidianComments } from "./markdownTransforms";

describe("stripObsidianComments: characterization（現状振る舞いの録音）", () => {
  // ===== A. 基本 =====

  it("A1: インラインコメントを除去し前後のテキストを保持する", () => {
    const input = "before %% secret %% after";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`"before  after"`);
  });

  it("A2: ブロックコメント（複数行にまたがる）を除去する", () => {
    const input = "本文\n\n%%\n複数行の\n非公開メモ\n%%\n\n続き";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "本文



      続き"
    `);
  });

  it("A3: コメントのみの行は空行になる", () => {
    const input = "title\n%% only comment %%\nbody";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "title

      body"
    `);
  });

  // ===== B. フェンス保護 =====

  it("B1: バッククォートフェンス内の %% は保護する", () => {
    const input = "```\n%% keep inside fence %%\n```";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "\`\`\`
      %% keep inside fence %%
      \`\`\`"
    `);
  });

  it("B2: チルダフェンス内の %% は保護する", () => {
    const input = "~~~\n%% keep inside tilde fence %%\n~~~";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "~~~
      %% keep inside tilde fence %%
      ~~~"
    `);
  });

  it("B3: 4本フェンスで開き3本で閉じる（長さ >= で閉じる）", () => {
    const input = "````\n%% inside long fence %%\n```";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "\`\`\`\`
      %% inside long fence %%
      \`\`\`"
    `);
  });

  it("B4: バッククォートフェンス内にチルダフェンス（ネスト）", () => {
    const input = "```\n~~~\n%% nested %%\n~~~\n```";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "\`\`\`
      ~~~
      %% nested %%
      ~~~
      \`\`\`"
    `);
  });

  it("B5: 引用付きフェンス（> ```）を認識する", () => {
    const input = "> ```\n> %% inside quoted fence %%\n> ```";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "> \`\`\`
      > %% inside quoted fence %%
      > \`\`\`"
    `);
  });

  // ===== C. インラインコード =====

  it("C1: 単一バッククォート内の %% は保護する", () => {
    const input = "inline `%% keep in code %%` here";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`"inline  here"`);
  });

  it("C2: 2本バッククォート内の %% は保護する（開閉本数マッチ）", () => {
    const input = "inline ``%% keep in double code %%`` here";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`"inline  here"`);
  });

  // ===== D. 数式 =====

  it("D1: インライン数式 $...$ 内の %% は保護する", () => {
    const input = "数式 $a %% b %% c$ です";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`"数式  です"`);
  });

  it("D2: ブロック数式 $$...$$ 内の %% は保護する（同一行）", () => {
    const input = "$$x %% y %% z$$";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`""`);
  });

  it("D3: ブロック数式 $$ の開閉トグル（別行にまたがる）", () => {
    const input = "$$\nx %% y %% z\n$$";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "$$
      x %% y %% z
      $$"
    `);
  });

  // ===== E. 境界・順序 =====

  it("E1: コメント内に現れたフェンス記号は無視される", () => {
    const input = "%% ```\nstill comment\n``` %%\nafter";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "
      after"
    `);
  });

  it("E2: コメント終了後に同一行でフェンスが現れる", () => {
    const input = "%% c %% ```\ncode\n```";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      " \`\`\`
      code
      \`\`\`"
    `);
  });

  it("E3: フェンス終了後の行でコメントが現れる", () => {
    const input = "```\ncode\n```\n%% after fence %%";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "\`\`\`
      code
      \`\`\`
      "
    `);
  });

  it("E4: 未閉じ %% は EOF までコメント扱い", () => {
    const input = "before %% unclosed to end";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`"before "`);
  });

  it("E5: %% がコード内に現れるが保護される（関数風文字列）", () => {
    const input = "```\nfunc %% arg %% end\n```";
    expect(stripObsidianComments(input)).toMatchInlineSnapshot(`
      "\`\`\`
      func %% arg %% end
      \`\`\`"
    `);
  });
});
