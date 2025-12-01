// File: src/suggest/labelParser.ts
// Purpose: ラベル抽出とパースの共通処理を提供するユーティリティ。
// Reason: オートコンプリート実装間で重複するロジックを一箇所にまとめるため。
// Related: src/suggest/LabelReferenceSuggest.ts, src/suggest/LabelEditorSuggest.ts, src/utils/markdownTransforms.ts

export interface LabelCompletion {
  label: string;
  detail?: string;
}

export function extractLabels(content: string): LabelCompletion[] {
  const blockMatches = content.match(/```[a-zA-Z0-9]*\s*\{#(lst|fig|eq|tbl):[a-zA-Z0-9:_-]+(?:\s+caption=".*?")?\}/g) || [];
  const inlineMatches = content.match(/\{#(lst|fig|eq|tbl):[a-zA-Z0-9:_-]+\}/g) || [];
  const allMatches = [...blockMatches, ...inlineMatches];

  const labelSet = new Set<string>();
  const results: LabelCompletion[] = [];

  for (const match of allMatches) {
    const labelInfo = parseLabel(match);
    if (labelInfo && !labelSet.has(labelInfo.label)) {
      labelSet.add(labelInfo.label);
      results.push(labelInfo);
    }
  }
  return results;
}

export function parseLabel(labelStr: string): LabelCompletion | null {
  const blockRegex = /\{#(lst|fig|eq|tbl):([a-zA-Z0-9:_-]+)(?:\s+caption="(.*?)")?\}/;
  const inlineRegex = /\{#(lst|fig|eq|tbl):([a-zA-Z0-9:_-]+)\}/;

  const blockMatch = labelStr.match(blockRegex);
  if (blockMatch) {
    const [, type, labelId, caption] = blockMatch;
    return { label: `${type}:${labelId}`, detail: caption ?? `Label of type ${type}` };
  }

  const inlineMatch = labelStr.match(inlineRegex);
  if (inlineMatch) {
    const [, type, labelId] = inlineMatch;
    return { label: `${type}:${labelId}`, detail: `Label of type ${type}` };
  }
  return null;
}
