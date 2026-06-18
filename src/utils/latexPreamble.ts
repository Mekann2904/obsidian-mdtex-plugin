// File: src/utils/latexPreamble.ts
// Purpose: LaTeXプリアンブルの組み立て（相互参照ラベル名上書きの付与）を行うユーティリティを提供する。
// Reason: ユーザー設定のプリアンブル + コールアウト定義に対し、安全にラベル上書きを追記するため。
// Related: src/services/convertService.ts, src/MdTexPluginSettings.ts, src/utils/latexEscape.ts

import { escapeLatex } from "./latexEscape";

export interface LabelOverrides {
  figureLabel: string;
  figPrefix: string;
  tableLabel: string;
  tblPrefix: string;
  codeLabel: string;
  lstPrefix: string;
  equationLabel: string;
  eqnPrefix: string;
}

export function appendLabelOverrides(latexCode: string, labels: LabelOverrides): string {
  const safe = (val: string) => escapeLatex(val || "");

  const overrides: string[] = [
    labels.figureLabel ? `\\renewcommand{\\figurename}{${safe(labels.figureLabel)}}` : "",
    labels.tableLabel ? `\\renewcommand{\\tablename}{${safe(labels.tableLabel)}}` : "",
    labels.codeLabel ? `\\renewcommand{\\lstlistingname}{${safe(labels.codeLabel)}}` : "",
    labels.lstPrefix ? `\\renewcommand{\\lstlistlistingname}{${safe(labels.lstPrefix)}}` : "",
    labels.equationLabel
      ? `\\providecommand{\\equationautorefname}{${safe(labels.equationLabel)}}\\renewcommand{\\equationautorefname}{${safe(labels.equationLabel)}}`
      : "",
  ].filter(Boolean);

  if (!overrides.length) return latexCode.trim();

  const block = [latexCode.trim(), "\\makeatletter", ...overrides, "\\makeatother"]
    .filter(Boolean)
    .join("\n\n");

  return block.trim();
}
