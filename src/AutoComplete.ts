import {
  EditorSuggest,
  EditorPosition,
  EditorSuggestContext,
  Editor,
  TFile,
  App,
  EventRef, // 追加
} from "obsidian";

/**
 * 補完候補の型
 */
interface MyCompletion {
  label: string; // 補完候補の表示ラベル
  detail?: string; // 補完候補の詳細（任意）
}

/**
 * MyLabelEditorSuggest
 * - Obsidian の推奨する `EditorSuggest` クラスを継承し、補完を行う
 */
export class MyLabelEditorSuggest extends EditorSuggest<MyCompletion> {
  public app: App;
  private suppressNextTrigger: boolean = false; // 再度補完を抑制するフラグ

  constructor(app: App) {
    super(app);
    this.app = app;
    console.log("MyLabelEditorSuggest initialized.");
  }

  /**
   * 補完をトリガーする条件を定義
   */
  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile
  ): EditorSuggestContext | null {
    if (this.suppressNextTrigger) {
      console.log("[MyLabelEditorSuggest:onTrigger] Trigger suppressed.");
      this.suppressNextTrigger = false; // 次回は通常動作に戻す
      return null;
    }

    const line = editor.getLine(cursor.line);
    console.log("[MyLabelEditorSuggest:onTrigger] Current line:", line);

    // `{#` または `{#}` に一致する正規表現
    const match = line.match(/(\{#[a-zA-Z0-9:]*\}?)/);
    if (!match || !match[0]) {
      console.log("[MyLabelEditorSuggest:onTrigger] No valid match found.");
      return null;
    }

    const foundText = match[0];
    console.log("[MyLabelEditorSuggest:onTrigger] Match found:", foundText);

    const startCh = line.indexOf(foundText);
    const endCh = startCh + foundText.length;

    // endCh が行の長さを超えていないかチェック
    if (endCh < line.length) {
      const nextChar = line[endCh];
      // 補完直後が英数字の場合は抑制
      if (nextChar?.match(/[\w]/)) {
        console.log(
          "[MyLabelEditorSuggest:onTrigger] Suppress: Alphanumeric after label."
        );
        return null;
      }
      // 補完直後がその他の非英数字の場合も抑制
      if (nextChar?.match(/[^a-zA-Z0-9]/)) {
        console.log(
          "[MyLabelEditorSuggest:onTrigger] Suppress: Non-alphanumeric after label."
        );
        return null;
      }
    }

    console.log("[MyLabelEditorSuggest:onTrigger] Triggering suggestion.");
    return {
      editor,
      file,
      query: foundText, // 現在の入力文字列
      start: { line: cursor.line, ch: startCh },
      end: { line: cursor.line, ch: endCh },
    };
  }

  /**
   * 補完候補を提供
   */
  getSuggestions(context: EditorSuggestContext): MyCompletion[] {
    console.log("[MyLabelEditorSuggest:getSuggestions] query:", context.query);
    const allSuggestions: MyCompletion[] = [
      { label: "{#fig:}", detail: "Figure Label" },
      { label: "{#tbl:}", detail: "Table Label" },
      { label: "{#lst: caption=\"\"}", detail: "Code Label" },
      { label: "{#eq:}", detail: "Equation Label" },
    ];

    // 入力中の文字列に基づいて部分一致でフィルタリング
    // 例: `{#fig:` と入力している場合、後ろの `}` は除外
    const queryWithoutCurly = context.query.replace(/\}$/, "");
    const filtered = allSuggestions.filter((item) =>
      item.label.startsWith(queryWithoutCurly)
    );

    console.log("[MyLabelEditorSuggest:getSuggestions] filtered:", filtered);
    return filtered;
  }

  /**
   * 補完候補の表示
   */
  renderSuggestion(suggestion: MyCompletion, el: HTMLElement): void {
    console.log("[MyLabelEditorSuggest:renderSuggestion]", suggestion.label);

    const labelEl = el.createDiv({ cls: "autocomplete-label" });
    labelEl.setText(suggestion.label);

    if (suggestion.detail) {
      const detailEl = el.createDiv({ cls: "autocomplete-detail" });
      detailEl.setText(suggestion.detail);
    }
  }

  /**
   * 補完候補を選択したときの動作
   */
  selectSuggestion(
    suggestion: MyCompletion,
    evt: MouseEvent | KeyboardEvent
  ): void {
    const { editor, start, end } = this.context ?? {};
    if (!editor || !start || !end) {
      console.error("[MyLabelEditorSuggest:selectSuggestion] Missing context.");
      return;
    }

    console.log("[MyLabelEditorSuggest:selectSuggestion] Insert:", suggestion.label);
    editor.replaceRange(suggestion.label, start, end);

    // カーソルを `:` の後ろに移動
    const colonIndex = suggestion.label.indexOf(":");
    if (colonIndex !== -1) {
      const cursorPos: EditorPosition = {
        line: start.line,
        ch: start.ch + colonIndex + 1, // `:` の直後
      };
      editor.setCursor(cursorPos);
      console.log(
        "[MyLabelEditorSuggest:selectSuggestion] Cursor moved to:",
        cursorPos
      );
    }

    // ポップアップを閉じる
    this.close();
    console.log("[MyLabelEditorSuggest:selectSuggestion] Popup closed.");

    // 次回のトリガーを抑制
    this.suppressNextTrigger = true;
    console.log("[MyLabelEditorSuggest:selectSuggestion] Trigger suppressed.");
  }
}

/**
 * MyLabelSuggest
 * - 現在のファイル内に記載されたラベルを取得し、
 *   `[@` または `[@...` を入力した際に補完候補を提供
 */
export class MyLabelSuggest extends EditorSuggest<MyCompletion> {
  private labels: MyCompletion[] = []; // ファイル内のラベル一覧

  // イベントリファレンスを保持して、あとで offref() するために使用
  private fileModifyEventRef: EventRef | null = null;

  constructor(public app: App) {
    super(app);
    console.log("MyLabelSuggest initialized.");

    // ファイルが更新されるたびに呼ばれるイベントをフック
    this.fileModifyEventRef = this.app.vault.on("modify", async (modifiedFile) => {
      if (modifiedFile instanceof TFile) {
        // ▼ すべてのファイル更新でラベル一覧を更新したい場合
        await this.updateLabels(modifiedFile);

        // ▼ 特定のファイルのみ更新したい場合は、こんな感じで条件分岐
        /*
        if (this.context?.file && modifiedFile.path === this.context.file.path) {
          await this.updateLabels(modifiedFile);
        }
        */
      }
    });
  }

  /**
   * （オプション）
   * このサジェストが完全に破棄されるタイミングでイベントを解除したい場合
   * Plugin 内の onUnload() などでも構いません。
   */
  public onunload() {
    if (this.fileModifyEventRef) {
      this.app.vault.offref(this.fileModifyEventRef);
      this.fileModifyEventRef = null;
      console.log("[MyLabelSuggest] File modify event offref done.");
    }
  }

  /**
   * 補完をトリガーする条件を定義
   * Obsidian の仕様により、同期的に EditorSuggestTriggerInfo | null を返す必要がある
   */
  public onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile
  ): EditorSuggestContext | null {
    const lineText = editor.getLine(cursor.line);
    console.log("[MyLabelSuggest:onTrigger] line:", lineText);

    // `[@` または `[@...` に一致する正規表現
    const match = lineText.match(/(\[@[a-zA-Z0-9:_-]*\]?)/);
    if (!match || !match[0]) {
      console.log("[MyLabelSuggest:onTrigger] No valid match found.");
      return null;
    }

    const foundText = match[0];
    console.log("[MyLabelSuggest:onTrigger] Match found:", foundText);

    const startCh = lineText.indexOf(foundText);
    const endCh = startCh + foundText.length;

    // `[@` を除外し、末尾の `]` を除外
    const query = foundText.slice(2).replace(/\]$/, "");

    // ここでも updateLabels を呼んでおくと、トリガー瞬間に最新情報を取得できる
    // ただし、既にファイル更新イベントで updateLabels は実行されているので重複呼び出しはお好みで
    // this.updateLabels(file);

    return {
      editor,
      file,
      query,
      start: { line: cursor.line, ch: startCh },
      end: { line: cursor.line, ch: endCh },
    };
  }

  /**
   * サジェスト候補を提供
   */
  getSuggestions(context: EditorSuggestContext): MyCompletion[] {
    console.log("[MyLabelSuggest:getSuggestions] query:", context.query);

    // クエリで始まるラベルをフィルタリング
    const matched = this.labels.filter((item) =>
      item.label.startsWith(context.query)
    );

    console.log("[MyLabelSuggest:getSuggestions] matched:", matched);
    return matched;
  }

  /**
   * サジェスト候補を描画
   */
  renderSuggestion(suggestion: MyCompletion, el: HTMLElement): void {
    console.log("[MyLabelSuggest:renderSuggestion]", suggestion.label);

    const labelEl = el.createDiv({ cls: "autocomplete-label" });
    labelEl.setText(suggestion.label);

    if (suggestion.detail) {
      const detailEl = el.createDiv({ cls: "autocomplete-detail" });
      detailEl.setText(suggestion.detail);
    }
  }

  /**
   * サジェスト候補を選択（確定）したときの動作
   */
  selectSuggestion(
    suggestion: MyCompletion,
    evt: MouseEvent | KeyboardEvent
  ): void {
    const { editor, start, end } = this.context ?? {};
    if (!editor || !start || !end) {
      console.error("[MyLabelSuggest:selectSuggestion] Missing context.");
      return;
    }

    console.log("[MyLabelSuggest:selectSuggestion] Insert:", suggestion.label);

    // 候補を挿入する (例: `lst:label` → `[@lst:label]`)
    editor.replaceRange(`[@${suggestion.label}]`, start, end);

    // カーソルを `]` の直後に移動
    const cursorPos: EditorPosition = {
      line: start.line,
      ch: start.ch + suggestion.label.length + 3, // `[@` + label + `]`
    };
    editor.setCursor(cursorPos);
    console.log("[MyLabelSuggest:selectSuggestion] Cursor moved:", cursorPos);

    // サジェストウィンドウを閉じる
    this.close();
    console.log("[MyLabelSuggest:selectSuggestion] Popup closed.");
  }

  /**
   * ファイル内にある `{#...}` ラベルを抽出し、this.labels に格納
   */
  private async updateLabels(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      this.labels = this.extractLabels(content);
      console.log("[MyLabelSuggest:updateLabels] Updated labels:", this.labels);
    } catch (err) {
      this.labels = [];
      console.error("[MyLabelSuggest:updateLabels] Failed to read file:", err);
    }
  }

  /**
   * ファイル内容からラベルを抽出する共通処理
   * - コードブロック内: ```... {#(lst|fig|eq|tbl):label ...} ```
   * - インライン: {#(lst|fig|eq|tbl):label}
   */
  private extractLabels(content: string): MyCompletion[] {
    // コードブロック内にある `{#...}` 付きの行
    const blockMatches =
      content.match(
        /```[a-zA-Z0-9]*\s*\{#(lst|fig|eq|tbl):[a-zA-Z0-9:_-]+(?:\s+caption=".*?")?\}/g
      ) || [];

    // インラインの `{#...}`
    const inlineMatches =
      content.match(/\{#(lst|fig|eq|tbl):[a-zA-Z0-9:_-]+\}/g) || [];

    // コードブロック + インライン 全部まとめる
    const allMatches = [...blockMatches, ...inlineMatches];

    // 重複を取り除きつつ MyCompletion 形式に変換
    const labelSet = new Set<string>();
    const results: MyCompletion[] = [];

    for (const match of allMatches) {
      const labelInfo = this.parseLabel(match);
      if (labelInfo && !labelSet.has(labelInfo.label)) {
        labelSet.add(labelInfo.label);
        results.push(labelInfo);
      }
    }
    return results;
  }

  /**
   * `{#(lst|fig|eq|tbl):...}` 形式からラベルとキャプションを取り出す
   */
  private parseLabel(labelStr: string): MyCompletion | null {
    // コードブロック用: ```... {#(lst|fig|eq|tbl):xxx caption="..."}```
    const blockRegex = /\{#(lst|fig|eq|tbl):([a-zA-Z0-9:_-]+)(?:\s+caption="(.*?)")?\}/;
    // インライン用: {#(lst|fig|eq|tbl):xxx}
    const inlineRegex = /\{#(lst|fig|eq|tbl):([a-zA-Z0-9:_-]+)\}/;

    const blockMatch = labelStr.match(blockRegex);
    if (blockMatch) {
      const [_, type, labelId, caption] = blockMatch;
      return {
        label: `${type}:${labelId}`,
        detail: caption ?? `Label of type ${type}`,
      };
    }

    const inlineMatch = labelStr.match(inlineRegex);
    if (inlineMatch) {
      const [_, type, labelId] = inlineMatch;
      return {
        label: `${type}:${labelId}`,
        detail: `Label of type ${type}`,
      };
    }
    return null;
  }
}
