// File: src/services/profileManager.ts
// Purpose: プロファイル管理の純粋ロジックを集約し、UI やストレージから切り離す。
// Reason: 追加・削除・マイグレーションをテストしやすくし、重複実装を防ぐため。
// Related: src/MdTexPluginSettings.ts, src/MdTexPluginSettingTab.ts, src/services/settingsService.ts, src/services/pandocCommandBuilder.ts

import { DEFAULT_PROFILE, DEFAULT_SETTINGS, PandocPluginSettings, ProfileSettings } from "../MdTexPluginSettings";

export interface ProfileState {
  profiles: Record<string, ProfileSettings>;
  activeProfile: string;
}

export function createDefaultProfile(): ProfileSettings {
  return { ...DEFAULT_PROFILE };
}

export function addProfile(
  state: ProfileState,
  newProfileName: string,
  baseProfile?: ProfileSettings
): ProfileState {
  const name = newProfileName.trim();
  if (!name || state.profiles[name]) return state;

  const nextProfiles = { ...state.profiles, [name]: cloneProfile(baseProfile) };
  return {
    profiles: nextProfiles,
    activeProfile: name,
  };
}

export function removeProfile(state: ProfileState, targetName: string): ProfileState {
  if (!state.profiles[targetName] || Object.keys(state.profiles).length <= 1) return state;

  const nextProfiles = { ...state.profiles } as Record<string, ProfileSettings>;
  delete nextProfiles[targetName];
  const fallback = state.activeProfile === targetName
    ? Object.keys(nextProfiles)[0] || "Default"
    : state.activeProfile;

  return {
    profiles: nextProfiles,
    activeProfile: fallback,
  };
}

export function migrateSettings(raw: any): PandocPluginSettings {
  if (!raw) {
    return {
      ...DEFAULT_SETTINGS,
      profiles: { Default: createDefaultProfile() },
      activeProfile: "Default",
    };
  }

  const profiles = buildProfiles(raw);
  const activeProfile = raw.currentProfileName
    || raw.activeProfile
    || Object.keys(profiles)[0]
    || "Default";

  return {
    profiles,
    activeProfile,
    suppressDeveloperLogs: valueOrDefault(raw.suppressDeveloperLogs, DEFAULT_SETTINGS.suppressDeveloperLogs),
    enableMarkdownlintFix: valueOrDefault(raw.enableMarkdownlintFix, DEFAULT_SETTINGS.enableMarkdownlintFix),
    markdownlintCli2Path: valueOrDefault(raw.markdownlintCli2Path, DEFAULT_SETTINGS.markdownlintCli2Path),
    enableExperimentalMermaid: valueOrDefault(raw.enableExperimentalMermaid, DEFAULT_SETTINGS.enableExperimentalMermaid),
    latexCommandsYaml: raw.latexCommandsYaml ?? DEFAULT_SETTINGS.latexCommandsYaml,
    enableLatexPalette: valueOrDefault(raw.enableLatexPalette, DEFAULT_SETTINGS.enableLatexPalette),
    enableLatexGhost: valueOrDefault(raw.enableLatexGhost, DEFAULT_SETTINGS.enableLatexGhost),
  };
}

const buildProfiles = (raw: any): Record<string, ProfileSettings> => {
  if (Array.isArray(raw.profilesArray)) {
    return fromArray(raw.profilesArray);
  }
  if (Array.isArray(raw.profiles)) {
    return fromArray(raw.profiles);
  }
  if (raw.profiles && typeof raw.profiles === "object") {
    const obj: Record<string, ProfileSettings> = {};
    for (const [name, profile] of Object.entries(raw.profiles)) {
      obj[name] = cloneProfile(profile as ProfileSettings);
    }
    return ensureAtLeastDefault(obj);
  }

  return {
    Default: cloneProfile(raw as ProfileSettings),
  };
};

const fromArray = (arr: any[]): Record<string, ProfileSettings> => {
  const profilesObj: Record<string, ProfileSettings> = {};
  for (const p of arr) {
    const name = (p as any)?.name || "Default";
    profilesObj[name] = cloneProfile(p as ProfileSettings);
  }
  return ensureAtLeastDefault(profilesObj);
};

const ensureAtLeastDefault = (profiles: Record<string, ProfileSettings>): Record<string, ProfileSettings> => {
  if (Object.keys(profiles).length > 0) return profiles;
  return { Default: createDefaultProfile() };
};

const cloneProfile = (profile?: ProfileSettings): ProfileSettings => ({
  ...createDefaultProfile(),
  ...(profile || {}),
});

const valueOrDefault = <T>(value: T, fallback: T): T => (value !== undefined ? value : fallback);
