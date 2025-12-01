// File: src/services/settingsService.ts
// Purpose: 設定データの読み込み・保存・移行処理をまとめるサービス。
// Reason: プラグイン本体の肥大化を防ぎ、設定ロジックを分離するため。
// Related: src/MdTexPlugin.ts, src/MdTexPluginSettings.ts, src/services/convertService.ts

import { DEFAULT_PROFILE, DEFAULT_SETTINGS, PandocPluginSettings, ProfileSettings } from "../MdTexPluginSettings";

export async function loadSettings(loadData: () => Promise<any>): Promise<PandocPluginSettings> {
  let loadedData = await loadData();

  if (!loadedData) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  if (loadedData && Array.isArray(loadedData.profilesArray)) {
    const profilesObj: { [key: string]: ProfileSettings } = {};
    for (const p of loadedData.profilesArray) {
      const name = p.name || "Default";
      profilesObj[name] = { ...DEFAULT_PROFILE, ...p };
    }
    return normalize(profilesObj, loadedData);
  }

  if (loadedData && Array.isArray(loadedData.profiles)) {
    const profilesObj: { [key: string]: ProfileSettings } = {};
    for (const p of loadedData.profiles) {
      const name = p.name || "Default";
      profilesObj[name] = { ...DEFAULT_PROFILE, ...p };
    }
    return normalize(profilesObj, loadedData);
  }

  if (loadedData && !loadedData.profiles) {
    const profilesObj = { Default: { ...DEFAULT_PROFILE, ...loadedData } } as Record<string, ProfileSettings>;
    return normalize(profilesObj, loadedData, "Default");
  }

  return {
    ...DEFAULT_SETTINGS,
    ...loadedData,
    suppressDeveloperLogs: loadedData.suppressDeveloperLogs !== undefined ? loadedData.suppressDeveloperLogs : DEFAULT_SETTINGS.suppressDeveloperLogs,
  } as PandocPluginSettings;
}

export async function saveSettings(
  settings: PandocPluginSettings,
  saveData: (data: any) => Promise<void>
): Promise<void> {
  const profilesArray = Object.entries(settings.profiles).map(([name, data]) => ({ name, ...data }));
  const savePayload = { ...settings, profilesArray };
  await saveData(savePayload);
}

function normalize(
  profilesObj: Record<string, ProfileSettings>,
  loadedData: any,
  fallbackActive: string = Object.keys(profilesObj)[0] || "Default"
): PandocPluginSettings {
  return {
    profiles: profilesObj,
    activeProfile: loadedData.currentProfileName || loadedData.activeProfile || fallbackActive,
    suppressDeveloperLogs: loadedData.suppressDeveloperLogs !== undefined ? loadedData.suppressDeveloperLogs : DEFAULT_SETTINGS.suppressDeveloperLogs,
    enableMarkdownlintFix: loadedData.enableMarkdownlintFix !== undefined ? loadedData.enableMarkdownlintFix : DEFAULT_SETTINGS.enableMarkdownlintFix,
    markdownlintCli2Path: loadedData.markdownlintCli2Path !== undefined ? loadedData.markdownlintCli2Path : DEFAULT_SETTINGS.markdownlintCli2Path,
  } as PandocPluginSettings;
}
