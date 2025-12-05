// File: tests/__mocks__/obsidian.ts
// Purpose: Vitest 実行時に Obsidian API 依存を切り離す軽量スタブを提供する。
// Reason: 本番 API を読み込まずにドメインロジックの単体テストを可能にするため。
// Related: vitest.config.ts, src/services/pandocCommandBuilder.test.ts, src/services/profileManager.test.ts, plans.md

import path from "path";

export class Plugin {
  app: any;
  manifest: any;
  constructor(app?: any) { this.app = app; }
  addCommand() {}
  addRibbonIcon() {}
  addSettingTab() {}
  registerEditorSuggest() {}
  registerEditorExtension() {}
}

export class Notice {
  static messages: Array<string | undefined> = [];
  constructor(message?: string) {
    Notice.messages.push(message);
  }
}

export class MarkdownView {
  file?: { path: string };
}

export class FileSystemAdapter {
  basePath: string;
  constructor(basePath: string = "/") {
    this.basePath = basePath;
  }
  getFullPath(p: string) {
    return path.isAbsolute(p) ? p : path.join(this.basePath, p);
  }
  getBasePath() { return this.basePath; }
}

export class App {
  workspace: any = {
    getActiveFile: () => null,
    activeLeaf: null,
  };
  vault: any = { adapter: new FileSystemAdapter() };
}

export class Modal {
  constructor(public app?: App) {}
  open() {}
  close() {}
}

export class Editor {}
export class FuzzySuggestModal<T> { constructor(public app?: App) {} }
export class EditorSuggest<T> {}
export class EditorPosition { line = 0; ch = 0; }
export class EditorSuggestContext { editor?: Editor; start?: EditorPosition; end?: EditorPosition; query?: string; }
export class TFile { constructor(public path: string = "") {} }
export class Component {}

export class MarkdownRenderer {
  static async render() { return ""; }
}

export const debounce = (fn: any) => fn;

export const moment = (..._args: any[]) => ({
  format: () => "",
  fromNow: () => "",
  add: () => moment(),
  subtract: () => moment(),
  toDate: () => new Date(),
  unix: () => moment(),
  utc: () => moment(),
  locale: () => moment(),
  valueOf: () => Date.now(),
});

export const parseYaml = (_input: string) => ({ parsed: true });
