// File: src/MdTexPluginSettingTab.ts
// Purpose: プラグインの設定画面UIを提供する。
// Reason: ユーザーがプロファイルを管理し、各パラメータ（パス、ラベル、LaTeXプリアンブル等）をGUIで変更可能にするため。
// Related: src/MdTexPlugin.ts, src/MdTexPluginSettings.ts

import { App, PluginSettingTab, Setting, Notice, debounce } from "obsidian";
import MdTexPlugin from "./MdTexPlugin";
import {
  DEFAULT_LATEX_PREAMBLE,
  isDefaultsTemplateMode,
  ProfileSettings,
} from "./MdTexPluginSettings";
import { DEFAULT_LATEX_COMMANDS_YAML } from "./data/latexCommands";
import { addProfile, removeProfile } from "./services/profileManager";
import {
  listTemplatePacks,
  readPackMetadata,
  scaffoldSampleTemplatePacks,
  scaffoldTemplateDocs,
} from "./services/templatePackService";
import { t } from "./lang/helpers";
import {
  discoverTexEngines,
  discoverPandoc,
  discoverPandocCrossref,
  discoverMarkdownlint,
  type DiscoveredBinary,
} from "./utils/binDiscover";
import { renderTemplatePackInfoPanel } from "./settings/templatePackPanel";
import { setupCli } from "./services/cliSetup";
import { PreambleModal } from "./settings/PreambleModal";

/**
 * 折りたたみセクションの「既定の開閉」。
 * `true` = 既定で開、`false` = 既定で閉。
 * `settings.collapsedSections[key]` でユーザーが明示的に変えた状態が優先される
 * （`true` = 折りたたまれている = 閉、`false` = 展開されている = 開）。
 *
 * Profile / Output / LaTeX engine は設定の入口なので常時展開（この表に含めない）。
 * Preamble / YAML palette / Localization / Extensions / Advanced は既定で閉じ、
 * 必要なときだけ開く漸進的開示とする。
 */
const COLLAPSIBLE_DEFAULT_OPEN: Record<string, boolean> = {
  preamble: false,
  "latex-palette": false,
  localization: false,
  extensions: false,
  advanced: false,
  // セクション3 内の builtin 既定モード用サブセクション。
  "document-frame": false, // 文書の体裁（ドキュメントクラス・フォントサイズ・マージン等）
  "pdf-engine-advanced": false, // PDF エンジン追加オプション（latexmk 上級者向け）
};

export class PandocPluginSettingTab extends PluginSettingTab {
  plugin: MdTexPlugin;
  /** 設定タブ描画時に自動探索した外部バイナリ一覧。再描画を跨いで保持する。 */
  private discoveredEngines: DiscoveredBinary[] | undefined;
  private discoveredPandoc: DiscoveredBinary[] | undefined;
  private discoveredPandocCrossref: DiscoveredBinary[] | undefined;
  private discoveredMarkdownlint: DiscoveredBinary[] | undefined;

  constructor(app: App, plugin: MdTexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    void this.render();
  }

  /**
   * 自動検出＋ドロップダウン式の「外部ツールのパス」設定行を描画する（共通ヘルパー）。
   *
   * pandoc / TeX エンジン / pandoc-crossref / markdownlint-cli2 で同じ UX を提供する:
   * - 検出された binPath をドロップダウンで選べる
   * - 末尾に「カスタム」を置き、選ぶとテキスト入力を出す（漸進的開示）
   * - 1件も検出されなければドロップダウンは無効化し、テキスト入力で手動指定を促す
   *
   * pandoc/TeX 専用の i18n キーが既にあるため、各 i18n キーはリテラル型に絞って安全に受け取る。
   * 返り値の Setting は、呼び出し側で settingEl.toggle() 等の後処理（連動表示）が必要な場合に使う。
   */
  private addDiscoveredBinarySetting(
    parent: HTMLElement,
    discovered: DiscoveredBinary[],
    currentValue: string,
    nameKey:
      | "setting_pandoc_path_name"
      | "setting_latex_engine_name"
      | "setting_crossref_path_name"
      | "setting_markdownlint_path_name",
    descKey:
      | "setting_pandoc_path_desc"
      | "setting_latex_engine_desc"
      | "setting_crossref_path_desc"
      | "setting_markdownlint_path_desc",
    notFoundKey:
      | "setting_pandoc_path_not_found_dropdown"
      | "setting_latex_engine_not_found_dropdown"
      | "setting_crossref_path_not_found_dropdown"
      | "setting_markdownlint_path_not_found_dropdown",
    customKey:
      | "setting_pandoc_path_custom"
      | "setting_latex_engine_custom"
      | "setting_crossref_path_custom"
      | "setting_markdownlint_path_custom",
    placeholderKey:
      | "setting_pandoc_path_placeholder"
      | "setting_latex_engine_placeholder"
      | "setting_crossref_path_placeholder"
      | "setting_markdownlint_path_placeholder",
    onApply: (value: string) => Promise<void>,
  ): Setting {
    const hasDetected = discovered.length > 0;
    const currentBinPaths = discovered.map(b => b.binPath);
    const isCustomValue = currentValue !== "" && !currentBinPaths.includes(currentValue);

    const setting = new Setting(parent)
      .setName(t(nameKey))
      .setDesc(t(descKey))
      .addDropdown(dropdown => {
        if (!hasDetected) {
          dropdown.setDisabled(true);
          dropdown.addOption("", t(notFoundKey));
          dropdown.setValue("");
        } else {
          for (const b of discovered) {
            dropdown.addOption(b.binPath, `${b.name} (${b.dir})`);
          }
          dropdown.addOption("__custom__", t(customKey));
          dropdown.setValue(isCustomValue ? "__custom__" : currentValue);
        }
        dropdown.onChange(async value => {
          if (value === "__custom__") {
            // 設定値は維持したままテキスト入力を表示するため再描画。
            this.display();
          } else if (value) {
            await onApply(value);
            this.display();
          }
        });
      });
    // テキスト入力は「カスタム」選択時、または検出0件で手動指定が必要な場合のみ表示。
    if (!hasDetected || isCustomValue) {
      setting.addText(text =>
        text
          .setPlaceholder(t(placeholderKey))
          .setValue(currentValue)
          .onChange(async value => {
            await onApply(value);
          }),
      );
    }
    return setting;
  }

  /**
   * セクションを開くべきか（ユーザー設定 > 既定値）。
   * `collapsedSections[key]` は「折りたたまれている（閉）」を意味するので、
   * 開状態はその否定。未設定なら `COLLAPSIBLE_DEFAULT_OPEN` に従う。
   */
  private sectionOpen(sectionKey: string): boolean {
    const collapsed = this.plugin.settings.collapsedSections[sectionKey];
    if (collapsed !== undefined) return !collapsed;
    return COLLAPSIBLE_DEFAULT_OPEN[sectionKey] ?? true;
  }

  private async persistSectionOpen(sectionKey: string, open: boolean): Promise<void> {
    this.plugin.settings.collapsedSections[sectionKey] = !open;
    await this.plugin.saveSettings();
  }

  /**
   * 折りたたみセクション（`<details>/<summary>`）を生成し、内容を入れる body を返す。
   *
   * `<summary>` の中に `Setting#setHeading()` を置くことで Obsidian 公式の見出しスタイル
   * （`.setting-item-heading`）をそのまま再利用し、テーマ間で外観が揃う。矢印は
   * `summary::before`（styles.css）で出し、開閉で 90° 回転する。開閉状態は
   * `data.json`（`collapsedSections`）へ永続化される。
   */
  private createCollapsibleSection(title: string, sectionKey: string): HTMLElement {
    const details = this.containerEl.createEl("details", { cls: "mdtex-nested-settings" });
    details.open = this.sectionOpen(sectionKey);
    details.addEventListener("toggle", () => {
      void this.persistSectionOpen(sectionKey, details.open);
    });

    // summary 自体を Obsidian の見出し行（setting-item-heading）として描画する。
    // summary の中に Setting をネストすると、テーマ側の .setting-item レイアウトと
    // details/summary のレイアウトが干渉して矢印と見出しがずれて見えるため、
    // ここだけは最小限の DOM を明示的に作る。
    const summary = details.createEl("summary", {
      cls: "mdtex-settings-summary setting-item setting-item-heading",
    });
    const info = summary.createDiv({ cls: "setting-item-info" });
    info.createDiv({ cls: "setting-item-name", text: title });
    summary.createDiv({ cls: "setting-item-control" });

    return details.createDiv({ cls: "mdtex-nested-settings-body" });
  }

  /**
   * プロファイル/設定フィールドへの代入 + saveSettings のみを行う onChange ハンドラを返す
   * （architecture review 候補 D）。これまで `onChange(async value => { target.X = value;
   * await this.plugin.saveSettings(); })` という closure が render() 内に ~20 箇所重複していた。
   * 副作用（連動表示の toggle / this.display() の再描画）を持つ closure は引き続き明示的に書く。
   *
   * text/dropdown の onChange は `string`、toggle は `boolean` を渡すため、T[K] で呼び出し側の
   * フィールド型に追従する（leverage: 1 つの binder で string/boolean 両対応）。
   */
  private bindField<T extends object, K extends keyof T>(target: T, key: K) {
    return async (value: T[K]) => {
      target[key] = value;
      await this.plugin.saveSettings();
    };
  }

  private async render(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    // タイトル
    containerEl.createEl("h2", { text: t("settings_title") });

    const settings = this.plugin.settings;
    const activeProfileKey = settings.activeProfile;
    const currentProfile = settings.profiles[activeProfileKey];

    // ADR-009: 設定タブ描画時に TeX エンジンを自動探索（初回のみ、以降キャッシュ）。
    // 検出ボタンは廃止し「開いたら自動で選べる」ようにする。同期だが実測 1ms 未満で UI を固めない。
    // Obsidian 再起動で再探索されるため、TeX をインストールし直しても次回起動で反映される。
    if (this.discoveredEngines === undefined) {
      this.discoveredEngines = discoverTexEngines(process.platform, process.env.PATH ?? "");
    }
    // 外部バイナリも設定タブ描画時に自動探索（初回のみキャッシュ）。TeX エンジンと同じ仕組み。
    if (this.discoveredPandoc === undefined) {
      this.discoveredPandoc = discoverPandoc(process.platform, process.env.PATH ?? "");
    }
    if (this.discoveredPandocCrossref === undefined) {
      this.discoveredPandocCrossref = discoverPandocCrossref(
        process.platform,
        process.env.PATH ?? "",
      );
    }
    if (this.discoveredMarkdownlint === undefined) {
      this.discoveredMarkdownlint = discoverMarkdownlint(process.platform, process.env.PATH ?? "");
    }

    // =================================================================
    // 1. プロファイル管理セクション（常時展開）
    // =================================================================
    this.renderProfileSection(currentProfile);

    // =================================================================
    // 2. 変換・出力設定 (General)（常時展開）
    // =================================================================
    new Setting(containerEl).setName(t("heading_general_output")).setHeading();

    new Setting(containerEl)
      .setName(t("setting_output_format_name"))
      .setDesc(t("setting_output_format_desc"))
      .addDropdown(dropdown => {
        dropdown.addOption("pdf", t("option_pdf"));
        dropdown.addOption("docx", t("option_docx"));
        dropdown.addOption("latex", t("option_latex"));
        dropdown.setValue(currentProfile.outputFormat).onChange(this.bindField(currentProfile, "outputFormat"));
      });

    // ADR-009: pandoc のパスも TeX エンジンと同じ「自動検出＋ドロップダウン選択」。
    // 実行時は pandocCommandBuilder で trim のみ（basename 正規化しない）。フルパス（検出で選んだ
    // binPath、または手入力した特定バージョン）をそのまま尊重する。TeX と違い pandoc は年度更新で
    // パスが消滅しないため、正規化の安全網は不要（TeX 専用）。空なら PATH の `pandoc`。
    this.addDiscoveredBinarySetting(
      containerEl,
      this.discoveredPandoc ?? [],
      currentProfile.pandocPath,
      "setting_pandoc_path_name",
      "setting_pandoc_path_desc",
      "setting_pandoc_path_not_found_dropdown",
      "setting_pandoc_path_custom",
      "setting_pandoc_path_placeholder",
      async value => {
        currentProfile.pandocPath = value;
        await this.plugin.saveSettings();
      },
    );

    new Setting(containerEl)
      .setName(t("setting_output_dir_name"))
      .setDesc(t("setting_output_dir_desc"))
      .addText(text =>
        text.setValue(currentProfile.outputDirectory).onChange(this.bindField(currentProfile, "outputDirectory")),
      );

    new Setting(containerEl)
      .setName(t("setting_resource_dir_name"))
      .setDesc(t("setting_resource_dir_desc"))
      .addText(text =>
        text.setValue(currentProfile.searchDirectory).onChange(this.bindField(currentProfile, "searchDirectory")),
      );

    new Setting(containerEl)
      .setName(t("setting_delete_intermediate_name"))
      .setDesc(t("setting_delete_intermediate_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.deleteIntermediateFiles).onChange(this.bindField(currentProfile, "deleteIntermediateFiles")),
      );

    // =================================================================
    // 3. LaTeX / PDF 設定（常時展開：テンプレート方式の入口なので）
    // =================================================================
    new Setting(containerEl).setName(t("heading_latex_engine")).setHeading();

    // 文書テンプレート方式（ADR-007）: このセクションの他項目の意味を決める「入口」。
    // builtin → GUI 設定値で枠を構築、defaults → defaults file に枠を委譲。
    // defaults 選択時は委譲対象の GUI 項目（ドキュメントクラス・フォントサイズ・プリアンブル等）
    // を折りたたみ、defaults file パス入力だけを表示する（漸進的開示）。
    new Setting(containerEl)
      .setName(t("setting_template_mode_name"))
      .setDesc(t("setting_template_mode_desc"))
      .addDropdown(dropdown => {
        dropdown.addOption("builtin", t("option_template_builtin"));
        dropdown.addOption("defaults", t("option_template_defaults"));
        dropdown.setValue(currentProfile.documentTemplateMode ?? "builtin");
        dropdown.onChange(async value => {
          currentProfile.documentTemplateMode = value as "builtin" | "defaults";
          await this.plugin.saveSettings();
          this.display(); // 漸進的開示のために再描画
        });
      });

    const isDefaultsMode = isDefaultsTemplateMode(currentProfile);

    // 方式（ADR-007）で分岐: defaults は defaults file 構成 UI、builtin は PDF エンジン + 文書体裁 UI。
    // 方式固有の設定を1つのメソッドに集約し、この位置の分岐を対称にする（thermo-nuclear review #9）。
    // preamble / localization / standalone の builtin 限定項目はトピックセクション内に留める（co-location を優先）。
    if (isDefaultsMode) {
      await this.renderDefaultsModeSettings(currentProfile);
    } else {
      this.renderBuiltinEngineSettings(currentProfile);
    }

    // =================================================================
    // 4. LaTeX Preamble (Custom Header) - 折りたたみ
    // defaults 方式では headerIncludes も defaults file 側で管理するため非表示。
    // =================================================================
    if (!isDefaultsMode) {
      const preambleBody = this.createCollapsibleSection(t("heading_preamble"), "preamble");

      const preambleDesc = preambleBody.createDiv({ cls: "setting-item-description" });
      preambleDesc.setText(t("preamble_desc"));
      preambleDesc.style.marginBottom = "8px";

      // 大きなコード編集領域は Setting API（control 領域が狭くなる想定）ではなく
      // 直接 textarea を置く。スタイルは共通クラス .mdtex-code-area に集約（インラインstyle排除）。
      const textArea = preambleBody.createEl("textarea", { cls: "mdtex-code-area" });
      textArea.value = currentProfile.headerIncludes;
      textArea.placeholder = t("placeholder_preamble");
      textArea.spellcheck = false; // スペルチェック無効

      textArea.addEventListener("change", async () => {
        currentProfile.headerIncludes = textArea.value;
        await this.plugin.saveSettings();
      });

      // Reset / Copy / Fullscreen Buttons
      const btnContainer = preambleBody.createDiv();
      btnContainer.style.marginTop = "8px";
      btnContainer.style.display = "flex";
      btnContainer.style.gap = "8px";
      btnContainer.style.justifyContent = "flex-end";

      const fullscreenBtn = btnContainer.createEl("button", { text: t("button_open_fullscreen") });
      fullscreenBtn.onclick = async () => {
        await this.plugin.saveSettings();
        const modal = new PreambleModal(this.app, currentProfile.headerIncludes, async val => {
          currentProfile.headerIncludes = val;
          textArea.value = val;
          await this.plugin.saveSettings();
        });
        modal.open();
      };

      const resetBtn = btnContainer.createEl("button", { text: t("button_reset_preamble") });
      resetBtn.addEventListener("click", async () => {
        if (confirm(t("confirm_reset_preamble"))) {
          currentProfile.headerIncludes = DEFAULT_LATEX_PREAMBLE;
          textArea.value = DEFAULT_LATEX_PREAMBLE;
          await this.plugin.saveSettings();
          new Notice(t("notice_preamble_reset"));
        }
      });

      const copyBtn = btnContainer.createEl("button", { text: t("button_copy") });
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(textArea.value);
        new Notice(t("notice_preamble_copied"));
      };
    } // end preamble section (defaults 方式では非表示)

    // =================================================================
    // 5. LaTeX Command Palette (YAML) - 折りたたみ
    // =================================================================
    const paletteBody = this.createCollapsibleSection(t("heading_latex_palette"), "latex-palette");
    paletteBody.createEl("p", {
      text: t("setting_latex_yaml_desc"),
      cls: "setting-item-description",
    });

    new Setting(paletteBody)
      .setName(t("setting_enable_latex_palette_name"))
      .setDesc(t("setting_enable_latex_palette_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableLatexPalette).onChange(this.bindField(settings, "enableLatexPalette")),
      );

    new Setting(paletteBody)
      .setName(t("setting_enable_latex_ghost_name"))
      .setDesc(t("setting_enable_latex_ghost_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableLatexGhost).onChange(this.bindField(settings, "enableLatexGhost")),
      );

    const yamlArea = paletteBody.createEl("textarea", {
      cls: "mdtex-code-area mdtex-code-area--small",
    });
    yamlArea.value = settings.latexCommandsYaml;
    yamlArea.spellcheck = false;
    const saveYaml = debounce(
      async () => {
        await this.plugin.saveSettings();
      },
      400,
      false,
    );

    yamlArea.addEventListener("input", () => {
      settings.latexCommandsYaml = yamlArea.value;
      saveYaml();
    });

    const yamlBtnRow = paletteBody.createDiv({ cls: "setting-item" });
    yamlBtnRow.style.display = "flex";
    yamlBtnRow.style.justifyContent = "flex-end";
    yamlBtnRow.style.gap = "8px";

    const resetYaml = yamlBtnRow.createEl("button", { text: t("button_reset_latex_yaml") });
    resetYaml.onclick = async () => {
      settings.latexCommandsYaml = DEFAULT_LATEX_COMMANDS_YAML;
      yamlArea.value = DEFAULT_LATEX_COMMANDS_YAML;
      await this.plugin.saveSettings();
      new Notice(t("notice_latex_yaml_reset"));
    };

    // =================================================================
    // 6. Localization (Labels & Prefixes) - 折りたたみ
    // defaults 方式ではキャプション語／参照接頭辞も defaults file 側の metadata で管理するため非表示。
    // =================================================================
    if (!isDefaultsMode) {
      const locBody = this.createCollapsibleSection(t("heading_localization"), "localization");
      locBody.createEl("p", {
        text: t("heading_localization_desc"),
        cls: "setting-item-description",
      });

      // 公式 Setting API で「ラベル / プレフィックス」の2入力を1行に並べる。
      // リテラル型に絞ることで @ts-ignore を使わず型安全に ProfileSettings の string フィールドへ代入できる。
      const createLabelSetting = (
        name: string,
        labelKey: "figureLabel" | "tableLabel" | "codeLabel" | "equationLabel",
        prefixKey: "figPrefix" | "tblPrefix" | "lstPrefix" | "eqnPrefix",
      ) => {
        new Setting(locBody)
          .setName(name)
          .addText(text => {
            text.setPlaceholder(t("placeholder_label")).setValue(currentProfile[labelKey]);
            text.inputEl.style.width = "120px";
            text.onChange(this.bindField(currentProfile, labelKey));
          })
          .addText(text => {
            text.setPlaceholder(t("placeholder_prefix")).setValue(currentProfile[prefixKey]);
            text.inputEl.style.width = "120px";
            text.onChange(this.bindField(currentProfile, prefixKey));
          });
      };

      createLabelSetting(t("label_figures"), "figureLabel", "figPrefix");
      createLabelSetting(t("label_tables"), "tableLabel", "tblPrefix");
      createLabelSetting(t("label_listings"), "codeLabel", "lstPrefix");
      createLabelSetting(t("label_equations"), "equationLabel", "eqnPrefix");
    } // end localization section (defaults 方式では非表示)

    // =================================================================
    // 7. Cross-referencing & Filters - 折りたたみ
    // =================================================================
    const extBody = this.createCollapsibleSection(t("heading_extensions"), "extensions");

    // Use Crossref トグル → Crossref パス入力を局所的に表示/非表示。
    // 遅延参照：margin と同様に toggle を先に作り、path を後から作ってクロージャで捕捉する。
    new Setting(extBody)
      .setName(t("setting_use_crossref_name"))
      .setDesc(t("setting_use_crossref_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.usePandocCrossref).onChange(async value => {
          currentProfile.usePandocCrossref = value;
          crossrefPathSetting.settingEl.toggle(value);
          await this.plugin.saveSettings();
        }),
      );
    const crossrefPathSetting = this.addDiscoveredBinarySetting(
      extBody,
      this.discoveredPandocCrossref ?? [],
      currentProfile.pandocCrossrefPath,
      "setting_crossref_path_name",
      "setting_crossref_path_desc",
      "setting_crossref_path_not_found_dropdown",
      "setting_crossref_path_custom",
      "setting_crossref_path_placeholder",
      async value => {
        currentProfile.pandocCrossrefPath = value;
        await this.plugin.saveSettings();
      },
    );
    crossrefPathSetting.settingEl.toggle(currentProfile.usePandocCrossref);

    new Setting(extBody)
      .setName(t("setting_enable_advtex_name"))
      .setDesc(t("setting_enable_advtex_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.enableAdvancedTexCommands).onChange(this.bindField(currentProfile, "enableAdvancedTexCommands")),
      );

    new Setting(extBody)
      .setName(t("setting_pandoc_extra_args_name"))
      .setDesc(t("setting_pandoc_extra_args_desc"))
      .addText(text =>
        text
          .setValue(currentProfile.pandocExtraArgs)
          .setPlaceholder(t("placeholder_pandoc_extra_args"))
          .onChange(this.bindField(currentProfile, "pandocExtraArgs")),
      );

    // --standalone 制御は defaults 方式では defaults file の standalone: で管理するため非表示。
    // builtin 方式のみ表示（本文フラグメント出力は defaults 方式の defaults file で行う）。
    if (!isDefaultsMode) {
      new Setting(extBody)
        .setName(t("setting_use_standalone_name"))
        .setDesc(t("setting_use_standalone_desc"))
        .addToggle(toggle =>
          toggle.setValue(currentProfile.useStandalone).onChange(this.bindField(currentProfile, "useStandalone")),
        );
    }

    // =================================================================
    // 8. Global Settings - 折りたたみ（Advanced）
    // =================================================================
    const advBody = this.createCollapsibleSection(t("heading_global"), "advanced");

    // Markdownlint Fix トグル → markdownlint-cli2 パス入力を局所的に表示/非表示。
    new Setting(advBody)
      .setName(t("setting_enable_lint_fix_name"))
      .setDesc(t("setting_enable_lint_fix_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableMarkdownlintFix).onChange(async value => {
          settings.enableMarkdownlintFix = value;
          markdownlintPathSetting.settingEl.toggle(value);
          await this.plugin.saveSettings();
        }),
      );
    const markdownlintPathSetting = this.addDiscoveredBinarySetting(
      advBody,
      this.discoveredMarkdownlint ?? [],
      settings.markdownlintCli2Path,
      "setting_markdownlint_path_name",
      "setting_markdownlint_path_desc",
      "setting_markdownlint_path_not_found_dropdown",
      "setting_markdownlint_path_custom",
      "setting_markdownlint_path_placeholder",
      async value => {
        settings.markdownlintCli2Path = value;
        await this.plugin.saveSettings();
      },
    );
    markdownlintPathSetting.settingEl.toggle(settings.enableMarkdownlintFix);

    new Setting(advBody)
      .setName(t("setting_suppress_logs_name"))
      .setDesc(t("setting_suppress_logs_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.suppressDeveloperLogs).onChange(this.bindField(settings, "suppressDeveloperLogs")),
      );

    new Setting(advBody)
      .setName(t("setting_enable_mermaid_name"))
      .setDesc(t("setting_enable_mermaid_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableExperimentalMermaid).onChange(this.bindField(settings, "enableExperimentalMermaid")),
      );

    // =================================================================
    // mdtex CLI（コマンドライン・エージェント経路）
    // =================================================================
    new Setting(containerEl).setName(t("heading_cli")).setHeading();
    new Setting(containerEl)
      .setName(t("setting_cli_setup_name"))
      .setDesc(t("setting_cli_setup_desc"))
      .addButton(button =>
        button.setButtonText(t("setting_cli_setup_button")).onClick(async () => {
          const cliPath = `${this.plugin.manifest.dir}/cli.js`;
          const result = await setupCli(cliPath);
          new Notice(result.message, result.ok ? 8000 : 12000);
        }),
      );
  }

  /**
   * builtin 方式（ADR-007）の PDF エンジン + 文書体裁（ドキュメントクラス・フォントサイズ・
   * マージン・ページ番号・画像スケール）の設定 UI を描画する（thermo-nuclear review #9）。
   *
   * renderDefaultsModeSettings と対称で、render() の方式分岐位置から呼ばれる。これらは全て
   * defaults 方式では defaults file 側で管理されるため builtin 専用となる。PDF エンジン追加
   * オプションと文書体裁はユーザーが滅多に変えない上級者向けなので折りたたむ（漸進的開示）。
   */
  private renderBuiltinEngineSettings(currentProfile: ProfileSettings): void {
    // ADR-009: latexEngine は「自動検出＋ドロップダウン選択」が基本（他の外部バイナリと共通 UX）。
    // 実行時は normalizeLatexEngine で basename に正規化され PATH 解決されるため、年度更新に強い
    // （binDiscover.ts）。TeX が見つからない環境ではドロップダウンが無効化されテキスト入力で手動指定。
    this.addDiscoveredBinarySetting(
      this.containerEl,
      this.discoveredEngines ?? [],
      currentProfile.latexEngine,
      "setting_latex_engine_name",
      "setting_latex_engine_desc",
      "setting_latex_engine_not_found_dropdown",
      "setting_latex_engine_custom",
      "setting_latex_engine_placeholder",
      async value => {
        currentProfile.latexEngine = value;
        await this.plugin.saveSettings();
      },
    );

    // ADR-009: latexmk 等の PDF エンジンに追加オプション（--pdf-engine-opt）を渡す。
    // bibtex/biber のラウンドトリップを通す学会論文などで latexmk + -lualatex を使う場合に必要。
    // ほとんどのユーザーは使わない上級者向け設定なので、折りたたみで隠す。
    const pdfAdvBody = this.createCollapsibleSection(
      t("heading_pdf_engine_advanced"),
      "pdf-engine-advanced",
    );
    new Setting(pdfAdvBody)
      .setName(t("setting_pdf_engine_opts_name"))
      .setDesc(t("setting_pdf_engine_opts_desc"))
      .addText(text =>
        text
          .setValue(currentProfile.pdfEngineOpts ?? "")
          .setPlaceholder("-lualatex")
          .onChange(this.bindField(currentProfile, "pdfEngineOpts")),
      );

    // 委譲対象の GUI 項目（ドキュメントクラス・フォントサイズ・マージン・ページ番号・画像スケール）は
    // defaults 方式では defaults file 側で管理するため非表示。builtin 方式のみ折りたたみ「文書の体裁」に表示。
    const frameBody = this.createCollapsibleSection(
      t("heading_document_frame"),
      "document-frame",
    );

    new Setting(frameBody)
      .setName(t("setting_document_class_name"))
      .setDesc(t("setting_document_class_desc"))
      .addText(text =>
        text.setValue(currentProfile.documentClass).onChange(this.bindField(currentProfile, "documentClass")),
      );

    new Setting(frameBody)
      .setName(t("setting_document_class_opts_name"))
      .setDesc(t("setting_document_class_opts_desc"))
      .addText(text =>
        text.setValue(currentProfile.documentClassOptions).onChange(this.bindField(currentProfile, "documentClassOptions")),
      );

    new Setting(frameBody)
      .setName(t("setting_font_size_name"))
      .setDesc(t("setting_font_size_desc"))
      .addText(text =>
        text.setValue(currentProfile.fontSize).onChange(this.bindField(currentProfile, "fontSize")),
      );

    // マージン指定トグル → マージン幅入力を局所的に表示/非表示（全再描画しない）。
    // marginSizeSetting をクロージャで遅延参照し、フォーカス・スクロール位置を保持したまま表示切替。
    new Setting(frameBody)
      .setName(t("setting_use_margin_name"))
      .setDesc(t("setting_use_margin_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.useMarginSize).onChange(async value => {
          currentProfile.useMarginSize = value;
          marginSizeSetting.settingEl.toggle(value);
          await this.plugin.saveSettings();
        }),
      );
    const marginSizeSetting = new Setting(frameBody)
      .setName(t("setting_margin_size_name"))
      .setDesc(t("setting_margin_size_desc"))
      .addText(text =>
        text.setValue(currentProfile.marginSize).onChange(this.bindField(currentProfile, "marginSize")),
      );
    marginSizeSetting.settingEl.toggle(currentProfile.useMarginSize);

    new Setting(frameBody)
      .setName(t("setting_page_numbers_name"))
      .setDesc(t("setting_page_numbers_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.usePageNumber).onChange(this.bindField(currentProfile, "usePageNumber")),
      );

    new Setting(frameBody)
      .setName(t("setting_image_scale_name"))
      .setDesc(t("setting_image_scale_desc"))
      .addText(text =>
        text.setValue(currentProfile.imageScale).onChange(this.bindField(currentProfile, "imageScale")),
      );
  }

  /**
   * セクション1: プロファイル管理（アクティブ選択・削除・新規作成）。常時展開。
   * render() のセクション分割パターン（thermo-nuclear review 第3ラウンド #2）。
   */
  private renderProfileSection(currentProfile: ProfileSettings): void {
    const settings = this.plugin.settings;
    new Setting(this.containerEl).setName(t("heading_profile")).setHeading();

    const profileCount = Object.keys(settings.profiles).length;
    const activeProfileKey = settings.activeProfile;
    new Setting(this.containerEl)
      .setName(t("setting_active_profile_name"))
      .setDesc(t("setting_active_profile_desc"))
      .addDropdown(dropdown => {
        Object.keys(settings.profiles).forEach(key => {
          dropdown.addOption(key, key);
        });
        dropdown.setValue(activeProfileKey);
        dropdown.onChange(async value => {
          settings.activeProfile = value;
          await this.plugin.saveSettings();
          this.display(); // 再描画して値を更新
        });
      })
      .addExtraButton(btn => {
        btn
          .setIcon("trash")
          .setTooltip(t("button_delete_profile"))
          .setDisabled(profileCount <= 1)
          .onClick(async () => {
            if (profileCount <= 1) return;
            if (!confirm(t("confirm_delete_profile", [activeProfileKey]))) return;

            const nextState = removeProfile(
              { profiles: settings.profiles, activeProfile: settings.activeProfile },
              activeProfileKey,
            );
            settings.profiles = nextState.profiles;
            settings.activeProfile = nextState.activeProfile;
            await this.plugin.saveSettings();
            this.display();
            new Notice(t("notice_profile_deleted", [activeProfileKey]));
          });
      });

    let newProfileName = "";
    const createProfile = async () => {
      if (!newProfileName || settings.profiles[newProfileName]) {
        new Notice(t("notice_invalid_profile"));
        return;
      }
      const createdName = newProfileName;
      const nextState = addProfile(
        { profiles: settings.profiles, activeProfile: settings.activeProfile },
        createdName,
        currentProfile,
      );
      settings.profiles = nextState.profiles;
      settings.activeProfile = nextState.activeProfile;
      await this.plugin.saveSettings();
      newProfileName = "";
      this.display();
      new Notice(t("notice_profile_created", [createdName]));
    };
    new Setting(this.containerEl)
      .setName(t("setting_create_profile_name"))
      .setDesc(t("setting_create_profile_desc"))
      .addText(text => {
        text.setPlaceholder(t("placeholder_new_profile")).onChange(value => {
          newProfileName = value;
        });
        text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void createProfile();
          }
        });
      })
      .addButton(button =>
        button
          .setButtonText(t("button_add_profile"))
          .setCta()
          .onClick(() => void createProfile()),
      );
  }

  /**
   * defaults 方式（ADR-007/008）の設定 UI を描画する。
   *
   * テンプレートフォルダ・defaults file の指定方法（パック選択 / カスタムパス）・
   * テンプレートパックのドロップダウン・サンプル再展開を並べる。
   * 描画前にパック一覧をスキャンし、最初から正しい選択肢でドロップダウンを構築する。
   */
  private async renderDefaultsModeSettings(currentProfile: ProfileSettings): Promise<void> {
    const { containerEl } = this;

    // テンプレートフォルダ（パスのみを data.json に保持）
    new Setting(containerEl)
      .setName(t("setting_template_folder_name"))
      .setDesc(t("setting_template_folder_desc"))
      .addText(text =>
        text.setValue(currentProfile.templateFolder ?? "").onChange(this.bindField(currentProfile, "templateFolder")),
      );

    // ADR-009: 引用モード（@key / [@key] を LaTeX の引用コマンドに変換）。defaults 方式限定。
    // natbib は学会公式クラスが内蔵する natbib と協調する。bibstyle 衝突の解決はテンプレート
    // パック側（template: 参照の .tex から bibliographystyle 行を削除）で行う。
    new Setting(containerEl)
      .setName(t("setting_citation_mode_name"))
      .setDesc(t("setting_citation_mode_desc"))
      .addDropdown(dropdown => {
        dropdown.addOption("none", t("option_citation_none"));
        dropdown.addOption("natbib", t("option_citation_natbib"));
        dropdown.addOption("citeproc", t("option_citation_citeproc"));
        dropdown.setValue(currentProfile.citationMode ?? "none");
        dropdown.onChange(async value => {
          currentProfile.citationMode = value as "none" | "natbib" | "citeproc";
          await this.plugin.saveSettings();
        });
      });

    // defaults file の指定方法: パック選択 / カスタムパス
    new Setting(containerEl)
      .setName(t("setting_defaults_selection_name"))
      .setDesc(t("setting_defaults_selection_desc"))
      .addDropdown(dropdown => {
        dropdown.addOption("pack", t("option_defaults_selection_pack"));
        dropdown.addOption("custom", t("option_defaults_selection_custom"));
        dropdown.setValue(currentProfile.defaultsSelection ?? "pack");
        dropdown.onChange(async value => {
          currentProfile.defaultsSelection = value as "pack" | "custom";
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (currentProfile.defaultsSelection === "custom") {
      // 後方互換: 従来の絶対パス直接指定
      new Setting(containerEl)
        .setName(t("setting_defaults_file_path_name"))
        .setDesc(t("setting_defaults_file_path_desc"))
        .addText(text =>
          text
            .setValue(currentProfile.defaultsFilePath ?? "")
            .setPlaceholder(t("placeholder_defaults_file_path"))
          .onChange(this.bindField(currentProfile, "defaultsFilePath")),
        );
      return;
    }

    // パック選択モード: 描画前にパック一覧をスキャンし、最初から正しい選択肢で構築する。
    // これにより「初回表示が空 → 非同期補充」というちらつき・バグを防ぐ。
    let packs = await listTemplatePacks(this.app, currentProfile.templateFolder);
    // 選択中パックが一覧に無い場合は空に戻す（存在しないパックを保持しない）
    if (
      currentProfile.selectedTemplatePack &&
      !packs.includes(currentProfile.selectedTemplatePack)
    ) {
      currentProfile.selectedTemplatePack = "";
      await this.plugin.saveSettings();
    }

    const packSetting = new Setting(containerEl)
      .setName(t("setting_template_pack_name"))
      .setDesc(t("setting_template_pack_desc"))
      .addDropdown(dropdown => {
        if (packs.length === 0) {
          dropdown.addOption("", t("setting_template_pack_empty"));
        } else {
          for (const pack of packs) {
            dropdown.addOption(pack, pack);
          }
        }
        dropdown.setValue(currentProfile.selectedTemplatePack ?? "");
        dropdown.onChange(this.bindField(currentProfile, "selectedTemplatePack"));
      });

    packSetting.addButton(button =>
      button.setButtonText(t("button_rescan_packs")).onClick(async () => {
        const rescanned = await listTemplatePacks(this.app, currentProfile.templateFolder);
        packs = rescanned;
        await this.display();
        if (rescanned.length) {
          new Notice(t("notice_packs_rescanned", [rescanned.length]));
        } else {
          new Notice(t("notice_packs_empty"));
        }
      }),
    );

    packSetting.addButton(button =>
      button.setButtonText(t("button_install_samples")).onClick(async () => {
        await scaffoldTemplateDocs(this.app, currentProfile.templateFolder);
        const created = await scaffoldSampleTemplatePacks(this.app, currentProfile.templateFolder);
        await this.display();
        new Notice(t("notice_sample_packs_installed", [created.join(", ") || "（既存）"]));
      }),
    );

    // ADR-008 拡張: 選択中パックの自己記述メタ（_mdtex:）を表示。title/description で
    // 用途を明示し、requires の不足を警告し、recommendedProfile が現在のプロファイルと
    // ズレていれば「推奨設定を適用」を提案する。メタが無いパック（_mdtex: 未宣言）は
    // パネル自体を描画せず、フォルダ名だけで選択できる従来動作を維持する（後方互換）。
    const selectedPack = currentProfile.selectedTemplatePack?.trim();
    if (selectedPack && packs.includes(selectedPack)) {
      const metadata = await readPackMetadata(this.app, currentProfile.templateFolder, selectedPack);
      await renderTemplatePackInfoPanel({
        app: this.app,
        plugin: this.plugin,
        containerEl,
        currentProfile,
        packName: selectedPack,
        metadata,
        refresh: () => this.display(),
      });
    }
  }
}
