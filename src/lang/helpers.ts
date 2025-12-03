// File: src/lang/helpers.ts
// Purpose: moment のロケールから現在言語を判定し、翻訳文字列を返すヘルパーを提供する。
// Reason: 軽量な自前実装で Obsidian プラグインの i18n を実現するため。
// Related: src/lang/locale/en.ts, src/lang/locale/ja.ts, src/MdTexPlugin.ts, src/MdTexPluginSettingTab.ts

import { moment } from "obsidian";
import en, { TranslationKeys } from "./locale/en";
import ja from "./locale/ja";

type LocaleTable = Partial<Record<TranslationKeys, string>>;

const localeMap: Record<string, LocaleTable> = {
  en,
  "en-us": en,
  "en-gb": en,
  ja,
  "ja-jp": ja,
};

function normalizeLocale(raw?: string): string {
  const lowered = (raw || moment?.locale?.() || window?.moment?.locale?.() || "en").toLowerCase();
  if (localeMap[lowered]) return lowered;
  const short = lowered.split("-")[0];
  if (localeMap[short]) return short;
  return "en";
}

function getActiveTable(): LocaleTable {
  const code = normalizeLocale();
  return localeMap[code] || en;
}

export function t(key: TranslationKeys, vars?: Array<string | number>): string {
  const table = getActiveTable();
  let text = table[key] ?? en[key] ?? key;
  if (vars && vars.length) {
    vars.forEach((val, i) => {
      text = text.replace(`{${i}}`, String(val));
    });
  }
  return text;
}

export function currentLocale(): string {
  return normalizeLocale();
}
