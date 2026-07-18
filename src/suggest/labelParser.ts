// File: src/suggest/labelParser.ts
// Purpose: crossref ラベルの補完候補を生成する。lexing kernel（crossrefLabels.extractRawLabels）の
//   結果を suggester 用の LabelCompletion へ投影する薄い変換層。
// Reason: 従来はラベル抽出の接頭辞集合・fence/inline-code 保護ルールが crossrefLabels（transform
//   パイプライン用）と本モジュール（suggester 用）で 2 adapter に分かれ、sec 接頭辞の有無や fence
//   保護の有無が drift していた。lexing を 1 つの kernel に集約し、本モジュールは「補完用の形へ変換
//   する」だけを担う（architecture review 候補 C2）。これで [@sec:intro] も補完候補に出る。
// Related: src/suggest/LabelReferenceSuggest.ts, src/utils/crossrefLabels.ts

import { extractRawLabels } from "../utils/crossrefLabels";

export interface LabelCompletion {
  label: string;
  detail?: string;
}

/**
 * Markdown から crossref ラベルを抽出し、suggester 用の補完候補へ変換する。
 *
 * 抽出の真理源（接頭辞集合・fence/inline-code 保護）は crossrefLabels.extractRawLabels が単一所有する。
 * 本関数はその結果を {@link LabelCompletion} へ投影するだけ。これにより変換パイプライン
 * （crossrefLabels の rewrite / 重複検出）と補完（本関数）でラベルの見え方が一致し、drift しない。
 */
export function extractLabels(content: string): LabelCompletion[] {
  const seen = new Set<string>();
  const results: LabelCompletion[] = [];
  for (const ext of extractRawLabels(content)) {
    const label = `${ext.prefix}:${ext.id}`;
    if (seen.has(label)) continue;
    seen.add(label);
    results.push({
      label,
      detail: ext.caption ?? `Label of type ${ext.prefix}`,
    });
  }
  return results;
}
