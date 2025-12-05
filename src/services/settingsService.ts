// File: src/services/settingsService.ts
// Purpose: 設定データの読み込み・保存・移行処理をまとめるサービス。
// Reason: プラグイン本体の肥大化を防ぎ、設定ロジックを分離するため。
// Related: src/MdTexPlugin.ts, src/MdTexPluginSettings.ts, src/services/convertService.ts

import { PandocPluginSettings } from "../MdTexPluginSettings";
import { migrateSettings } from "./profileManager";

export async function loadSettings(loadData: () => Promise<any>): Promise<PandocPluginSettings> {
  const loadedData = await loadData();
  return migrateSettings(loadedData);
}

export async function saveSettings(
  settings: PandocPluginSettings,
  saveData: (data: any) => Promise<void>
): Promise<void> {
  const profilesArray = Object.entries(settings.profiles).map(([name, data]) => ({ name, ...data }));
  const savePayload = { ...settings, profilesArray };
  await saveData(savePayload);
}
