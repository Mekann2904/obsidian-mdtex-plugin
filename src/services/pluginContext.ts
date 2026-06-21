// File: src/services/pluginContext.ts
// Purpose: サービス群が共有する依存注入の根（PluginContext）を定義する。
// Reason: これまで lintService.ts が PluginContext を「所有」し、convertService が lint 専用
//   service から型を輸入する依存の向きの逆転が起きていた。共通 DI 根は中立的な home に置き、
//   各サービス（convert / lint）双方から参照させることで向きを整理する（architecture review 候補 5）。
// Related: src/services/lintService.ts, src/services/convertService.ts, src/MdTexPlugin.ts, src/MdTexPluginSettings.ts

import { App } from "obsidian";
import { PandocPluginSettings, ProfileSettings } from "../MdTexPluginSettings";

/**
 * プラグインのサービス群（変換・Lint 等）が共有する実行コンテキスト。
 *
 * アプリ状態・プラグイン設定・アクティブプロファイルへのアクセサを束ねる。
 * MdTexPlugin が構築し、各サービス関数の第 1 引数として受け渡される。
 */
export interface PluginContext {
  app: App;
  settings: PandocPluginSettings;
  getActiveProfileSettings(): ProfileSettings;
}
