// File: src/services/profileManager.ts
// Purpose: プロファイル管理の純粋ロジックを集約し、UI やストレージから切り離す。
// Reason: 追加・削除・マイグレーションをテストしやすくし、重複実装を防ぐため。
// Related: src/MdTexPluginSettings.ts, src/MdTexPluginSettingTab.ts, src/services/settingsService.ts, src/services/pandocCommandBuilder.ts

import {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  PandocPluginSettings,
  ProfileSettings,
} from "../MdTexPluginSettings";

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
  baseProfile?: ProfileSettings,
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
  const fallback =
    state.activeProfile === targetName
      ? Object.keys(nextProfiles)[0] || "Default"
      : state.activeProfile;

  return {
    profiles: nextProfiles,
    activeProfile: fallback,
  };
}

export function migrateSettings(raw: unknown): PandocPluginSettings {
  if (!raw) {
    return {
      ...DEFAULT_SETTINGS,
      profiles: { Default: createDefaultProfile() },
      activeProfile: "Default",
    };
  }

  const obj = raw as Record<string, unknown>;
  const profiles = buildProfiles(obj);
  const activeProfile =
    (obj.currentProfileName as string) ||
    (obj.activeProfile as string) ||
    Object.keys(profiles)[0] ||
    "Default";

  return {
    profiles,
    activeProfile,
    suppressDeveloperLogs: valueOrDefault(
      obj.suppressDeveloperLogs as unknown as boolean,
      DEFAULT_SETTINGS.suppressDeveloperLogs,
    ),
    enableMarkdownlintFix: valueOrDefault(
      obj.enableMarkdownlintFix as unknown as boolean,
      DEFAULT_SETTINGS.enableMarkdownlintFix,
    ),
    markdownlintCli2Path: valueOrDefault(
      obj.markdownlintCli2Path as unknown as string,
      DEFAULT_SETTINGS.markdownlintCli2Path,
    ),
    enableExperimentalMermaid: valueOrDefault(
      obj.enableExperimentalMermaid as unknown as boolean,
      DEFAULT_SETTINGS.enableExperimentalMermaid,
    ),
    latexCommandsYaml: (obj.latexCommandsYaml as string) ?? DEFAULT_SETTINGS.latexCommandsYaml,
    enableLatexPalette: valueOrDefault(
      obj.enableLatexPalette as unknown as boolean,
      DEFAULT_SETTINGS.enableLatexPalette,
    ),
    enableLatexGhost: valueOrDefault(
      obj.enableLatexGhost as unknown as boolean,
      DEFAULT_SETTINGS.enableLatexGhost,
    ),
    sampleTemplatesScaffolded: valueOrDefault(
      obj.sampleTemplatesScaffolded as unknown as boolean,
      DEFAULT_SETTINGS.sampleTemplatesScaffolded,
    ),
  };
}

const buildProfiles = (raw: unknown): Record<string, ProfileSettings> => {
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.profilesArray)) {
    return fromArray(obj.profilesArray);
  }
  if (Array.isArray(obj.profiles)) {
    return fromArray(obj.profiles);
  }
  if (obj.profiles && typeof obj.profiles === "object") {
    const profilesObj: Record<string, ProfileSettings> = {};
    for (const [name, profile] of Object.entries(obj.profiles)) {
      profilesObj[name] = cloneProfile(profile as unknown as ProfileSettings);
    }
    return ensureAtLeastDefault(profilesObj);
  }

  return {
    Default: cloneProfile(obj as unknown as ProfileSettings),
  };
};

const fromArray = (arr: unknown[]): Record<string, ProfileSettings> => {
  const profilesObj: Record<string, ProfileSettings> = {};
  for (const p of arr) {
    const profile = p as { name?: string };
    const name = profile?.name || "Default";
    profilesObj[name] = cloneProfile(p as ProfileSettings);
  }
  return ensureAtLeastDefault(profilesObj);
};

const ensureAtLeastDefault = (
  profiles: Record<string, ProfileSettings>,
): Record<string, ProfileSettings> => {
  if (Object.keys(profiles).length > 0) return profiles;
  return { Default: createDefaultProfile() };
};

const cloneProfile = (profile?: ProfileSettings): ProfileSettings => ({
  ...createDefaultProfile(),
  ...(profile || {}),
});

const valueOrDefault = <T>(value: T, fallback: T): T => (value !== undefined ? value : fallback);
