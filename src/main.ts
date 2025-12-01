// File: src/main.ts
// Purpose: Obsidian にプラグインを登録するエントリポイント。
// Reason: Obsidian が読み込むデフォルトエクスポートを提供するため。
// Related: src/MdTexPlugin.ts, src/MdTexPluginSettings.ts, src/services/convertService.ts, src/services/lintService.ts

import MdTexPlugin from "./MdTexPlugin";

export default MdTexPlugin;
