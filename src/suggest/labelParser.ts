// File: src/suggest/labelParser.ts
// Purpose: ラベル抽出とパースの共通処理。言語指定やスペース有無の揺れを吸収する。
// Reason: サジェスト間でロジックを共有し、Markdown表記ゆれでも安定してラベルを検出するため。
// Related: src/suggest/LabelReferenceSuggest.ts, src/suggest/LabelEditorSuggest.ts, src/utils/markdownTransforms.ts

export interface LabelCompletion {
  label: string;
  detail?: string;
}

export function extractLabels(content: string): LabelCompletion[] {
  const results: LabelCompletion[] = [];
  const labelSet = new Set<string>();

  // ```lang {#lst:id caption="..."} も ```lang{#lst:id} も拾う
  const blockRegex = /```(?:[\w-]*)?\s*(\{#(?:lst|fig|eq|tbl):[^}]+\})/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(content)) !== null) {
    const labelInfo = parseLabel(match[1]);
    if (labelInfo && !labelSet.has(labelInfo.label)) {
      labelSet.add(labelInfo.label);
      results.push(labelInfo);
    }
  }

  // インライン {#lst:foo}
  const inlineMatches = content.match(/\{#(lst|fig|eq|tbl):[a-zA-Z0-9:_-]+\}/g) || [];
  for (const m of inlineMatches) {
    const labelInfo = parseLabel(m);
    if (labelInfo && !labelSet.has(labelInfo.label)) {
      labelSet.add(labelInfo.label);
      results.push(labelInfo);
    }
  }

  return results;
}

export function parseLabel(labelStr: string): LabelCompletion | null {
  const regex = /\{#(lst|fig|eq|tbl):([a-zA-Z0-9:_-]+)(?:\s+caption="(.*?)")?\}/;
  const match = labelStr.match(regex);
  if (match) {
    const [, type, labelId, caption] = match;
    return {
      label: `${type}:${labelId}`,
      detail: caption ?? `Label of type ${type}`,
    };
  }
  return null;
}
