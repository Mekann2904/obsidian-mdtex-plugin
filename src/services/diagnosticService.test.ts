// File: src/services/diagnosticService.test.ts
// Purpose: LaTeX/Pandoc エラーログ解析ロジックの期待動作を検証する。
// Reason: 行番号補正とメッセージ抽出の退行を防ぐためのユニットテスト。
// Related: src/services/diagnosticService.ts, plans.md, vitest.config.ts, tests/__mocks__/obsidian.ts

import { describe, it, expect } from "vitest";
import { parseLatexDiagnostics, countHeaderLines } from "./diagnosticService";

describe("diagnosticService", () => {
  describe("countHeaderLines", () => {
    it("空文字なら0", () => {
      expect(countHeaderLines("")).toBe(0);
    });

    it("改行を正しく数える", () => {
      const header = "---\ntitle: test\n---";
      expect(countHeaderLines(header)).toBe(3);
    });
  });

  describe("parseLatexDiagnostics", () => {
    it("単一の LaTeX エラーを抽出する", () => {
      const stderr = "\n! Undefined control sequence.\nl.10 \\unknowncmd\n";
      const result = parseLatexDiagnostics(stderr, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ line: 10, message: "\\unknowncmd" });
    });

    it("ヘッダー行数を差し引いて補正する", () => {
      const stderr = "l.15 \\error";
      const result = parseLatexDiagnostics(stderr, 5);
      expect(result[0].line).toBe(10);
    });

    it("ヘッダー内の行は無視する", () => {
      const stderr = "l.3 \\error_in_header";
      const result = parseLatexDiagnostics(stderr, 5);
      expect(result).toHaveLength(0);
    });

    it("複数エラーを順序通り返す", () => {
      const stderr = "\nl.10 error1\n...\nl.20 error2\n";
      const result = parseLatexDiagnostics(stderr, 0);
      expect(result).toHaveLength(2);
      expect(result[0].line).toBe(10);
      expect(result[1].line).toBe(20);
    });
  });
});
