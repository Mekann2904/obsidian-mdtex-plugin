// File: src/MdTexPluginSettingTab.ts
// Purpose: プラグインの設定画面UIを提供する。
// Reason: ユーザーがプロファイルを管理し、各パラメータ（パス、ラベル、LaTeXプリアンブル等）をGUIで変更可能にするため。
// Related: src/MdTexPlugin.ts, src/MdTexPluginSettings.ts

import { App, PluginSettingTab, Setting, Notice, Modal, debounce } from "obsidian";
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
  scaffoldSampleTemplatePacks,
  scaffoldTemplateDocs,
} from "./services/templatePackService";
import { t } from "./lang/helpers";
import { discoverTexEngines, type DiscoveredEngine } from "./utils/texDiscover";

export class PandocPluginSettingTab extends PluginSettingTab {
  plugin: MdTexPlugin;
  /** 設定タブ描画時に自動探索した TeX エンジン一覧。再描画を跨いで保持する。 */
  private discoveredEngines: DiscoveredEngine[] | undefined;

  constructor(app: App, plugin: MdTexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    void this.render();
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

    // =================================================================
    // 1. プロファイル管理セクション
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_profile") });

    new Setting(containerEl)
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
      });

    // 新規プロファイル作成
    let newProfileName = "";
    new Setting(containerEl)
      .setName(t("setting_create_profile_name"))
      .setDesc(t("setting_create_profile_desc"))
      .addText(text =>
        text.setPlaceholder(t("placeholder_new_profile")).onChange(value => {
          newProfileName = value;
        }),
      )
      .addButton(button =>
        button
          .setButtonText(t("button_add_profile"))
          .setCta()
          .onClick(async () => {
            if (!newProfileName || settings.profiles[newProfileName]) {
              new Notice(t("notice_invalid_profile"));
              return;
            }
            // 現在のプロファイルをコピーして作成
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
          }),
      );

    // プロファイル削除
    new Setting(containerEl)
      .setName(t("setting_delete_profile_name"))
      .setDesc(t("setting_delete_profile_desc"))
      .addButton(button => {
        button
          .setButtonText(t("button_delete_profile"))
          .setWarning()
          .setDisabled(Object.keys(settings.profiles).length <= 1)
          .onClick(async () => {
            if (Object.keys(settings.profiles).length <= 1) return;
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

    // =================================================================
    // 2. 変換・出力設定 (General)
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_general_output") });

    new Setting(containerEl)
      .setName(t("setting_output_format_name"))
      .setDesc(t("setting_output_format_desc"))
      .addDropdown(dropdown => {
        dropdown.addOption("pdf", t("option_pdf"));
        dropdown.addOption("docx", t("option_docx"));
        dropdown.addOption("latex", t("option_latex"));
        dropdown.setValue(currentProfile.outputFormat).onChange(async value => {
          currentProfile.outputFormat = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("setting_pandoc_path_name"))
      .setDesc(t("setting_pandoc_path_desc"))
      .addText(text =>
        text.setValue(currentProfile.pandocPath).onChange(async value => {
          currentProfile.pandocPath = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("setting_output_dir_name"))
      .setDesc(t("setting_output_dir_desc"))
      .addText(text =>
        text.setValue(currentProfile.outputDirectory).onChange(async value => {
          currentProfile.outputDirectory = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("setting_resource_dir_name"))
      .setDesc(t("setting_resource_dir_desc"))
      .addText(text =>
        text.setValue(currentProfile.searchDirectory).onChange(async value => {
          currentProfile.searchDirectory = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("setting_delete_intermediate_name"))
      .setDesc(t("setting_delete_intermediate_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.deleteIntermediateFiles).onChange(async value => {
          currentProfile.deleteIntermediateFiles = value;
          await this.plugin.saveSettings();
        }),
      );

    // =================================================================
    // 3. LaTeX / PDF 設定
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_latex_engine") });

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

    if (isDefaultsMode) {
      await this.renderDefaultsModeSettings(currentProfile);
    }

    // ADR-009: latexEngine は「自動検出＋ドロップダウン選択」が基本。ドロップダウンの末尾に
    // 「カスタム」を用意し、それを選んだときだけテキスト入力を出す（漸進的開示）。
    // どちらを選んでも実行時は normalizeLatexEngine で basename に正規化され PATH 解決される
    // ため、年度更新に強い（texDiscover.ts）。TeX が見つからない環境ではテキスト入力で手動指定。
    const engines = this.discoveredEngines ?? [];
    const hasDetected = engines.length > 0;
    const currentBinPaths = engines.map(e => e.binPath);
    const isCustomValue = currentProfile.latexEngine !== "" && !currentBinPaths.includes(currentProfile.latexEngine);

    const engineSetting = new Setting(containerEl)
      .setName(t("setting_latex_engine_name"))
      .setDesc(t("setting_latex_engine_desc"))
      .addDropdown(dropdown => {
        if (!hasDetected) {
          // TeX が見つからない環境：ドロップダウンは無効化し、テキスト入力で手動指定を促す。
          dropdown.setDisabled(true);
          dropdown.addOption("", t("setting_latex_engine_not_found_dropdown"));
          dropdown.setValue("");
        } else {
          for (const e of engines) {
            dropdown.addOption(e.binPath, `${e.engine} (${e.dir})`);
          }
          dropdown.addOption("__custom__", t("setting_latex_engine_custom"));
          // 現在値が検出済み binPath に一致すればそれ、さもなくば「カスタム」。
          dropdown.setValue(isCustomValue ? "__custom__" : currentProfile.latexEngine);
        }
        dropdown.onChange(async value => {
          if (value === "__custom__") {
            // latexEngine は維持したままテキスト入力を表示するため再描画。
            this.display();
          } else if (value) {
            currentProfile.latexEngine = value;
            await this.plugin.saveSettings();
            this.display();
          }
        });
      });
    // テキスト入力は「カスタム」選択時、または検出0件（TeX未検出）で手動指定が必要な場合のみ表示。
    // 通常は非表示にして「入力が必須」感を消す。
    if (!hasDetected || isCustomValue) {
      engineSetting.addText(text =>
        text
          .setPlaceholder(t("setting_latex_engine_placeholder"))
          .setValue(currentProfile.latexEngine)
          .onChange(async value => {
            currentProfile.latexEngine = value;
            await this.plugin.saveSettings();
          }),
      );
    }

    // ADR-009: latexmk 等の PDF エンジンに追加オプション（--pdf-engine-opt）を渡す。
    // bibtex/biber のラウンドトリップを通す学会論文などで latexmk + -lualatex を使う場合に必要。
    new Setting(containerEl)
      .setName(t("setting_pdf_engine_opts_name"))
      .setDesc(t("setting_pdf_engine_opts_desc"))
      .addText(text =>
        text
          .setValue(currentProfile.pdfEngineOpts ?? "")
          .setPlaceholder("-lualatex")
          .onChange(async value => {
            currentProfile.pdfEngineOpts = value;
            await this.plugin.saveSettings();
          }),
      );

    // 委譲対象の GUI 項目（ドキュメントクラス・フォントサイズ・マージン・ページ番号・画像スケール）は
    // defaults 方式では defaults file 側で管理するため非表示。builtin 方式のみ表示する。
    if (!isDefaultsMode) {
      new Setting(containerEl)
        .setName(t("setting_document_class_name"))
        .setDesc(t("setting_document_class_desc"))
        .addText(text =>
          text.setValue(currentProfile.documentClass).onChange(async value => {
            currentProfile.documentClass = value;
            await this.plugin.saveSettings();
          }),
        );

      new Setting(containerEl)
        .setName(t("setting_document_class_opts_name"))
        .setDesc(t("setting_document_class_opts_desc"))
        .addText(text =>
          text.setValue(currentProfile.documentClassOptions).onChange(async value => {
            currentProfile.documentClassOptions = value;
            await this.plugin.saveSettings();
          }),
        );

      new Setting(containerEl)
        .setName(t("setting_font_size_name"))
        .setDesc(t("setting_font_size_desc"))
        .addText(text =>
          text.setValue(currentProfile.fontSize).onChange(async value => {
            currentProfile.fontSize = value;
            await this.plugin.saveSettings();
          }),
        );

      new Setting(containerEl)
        .setName(t("setting_use_margin_name"))
        .setDesc(t("setting_use_margin_desc"))
        .addToggle(toggle =>
          toggle.setValue(currentProfile.useMarginSize).onChange(async value => {
            currentProfile.useMarginSize = value;
            await this.plugin.saveSettings();
            this.display(); // 再描画でMargin Size入力を有効/無効化
          }),
        );

      if (currentProfile.useMarginSize) {
        new Setting(containerEl)
          .setName(t("setting_margin_size_name"))
          .setDesc(t("setting_margin_size_desc"))
          .addText(text =>
            text.setValue(currentProfile.marginSize).onChange(async value => {
              currentProfile.marginSize = value;
              await this.plugin.saveSettings();
            }),
          );
      }

      new Setting(containerEl)
        .setName(t("setting_page_numbers_name"))
        .setDesc(t("setting_page_numbers_desc"))
        .addToggle(toggle =>
          toggle.setValue(currentProfile.usePageNumber).onChange(async value => {
            currentProfile.usePageNumber = value;
            await this.plugin.saveSettings();
          }),
        );

      new Setting(containerEl)
        .setName(t("setting_image_scale_name"))
        .setDesc(t("setting_image_scale_desc"))
        .addText(text =>
          text.setValue(currentProfile.imageScale).onChange(async value => {
            currentProfile.imageScale = value;
            await this.plugin.saveSettings();
          }),
        );
    }

    // =================================================================
    // 4. LaTeX Preamble (Custom Header) - Improved UI
    // defaults 方式では headerIncludes も defaults file 側で管理するため非表示。
    // =================================================================
    if (!isDefaultsMode) {
      containerEl.createEl("h3", { text: t("heading_preamble") });

      const preambleDesc = containerEl.createDiv({ cls: "setting-item-description" });
      preambleDesc.setText(t("preamble_desc"));
      preambleDesc.style.marginBottom = "8px";

      // Create a container for the textarea to give it specific styling
      const editorContainer = containerEl.createDiv();
      editorContainer.style.width = "100%";

      const textArea = editorContainer.createEl("textarea");
      textArea.style.width = "100%";
      textArea.style.height = "400px"; // 十分な高さを確保
      textArea.style.fontFamily = "var(--font-monospace)"; // 等幅フォント
      textArea.style.fontSize = "13px";
      textArea.style.whiteSpace = "pre"; // 自動折り返しを無効化（コードとして表示）
      textArea.style.overflow = "auto"; // スクロールバー
      textArea.style.resize = "vertical"; // 縦方向のみリサイズ可
      textArea.spellcheck = false; // スペルチェック無効

      textArea.value = currentProfile.headerIncludes;
      textArea.placeholder = t("placeholder_preamble");

      textArea.addEventListener("change", async () => {
        currentProfile.headerIncludes = textArea.value;
        await this.plugin.saveSettings();
      });

      // Reset / Copy / Fullscreen Buttons
      const btnContainer = containerEl.createDiv();
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
    // 5. LaTeX Command Palette (YAML)
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_latex_palette") });
    containerEl.createEl("p", {
      text: t("setting_latex_yaml_desc"),
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName(t("setting_enable_latex_palette_name"))
      .setDesc(t("setting_enable_latex_palette_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableLatexPalette).onChange(async value => {
          settings.enableLatexPalette = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("setting_enable_latex_ghost_name"))
      .setDesc(t("setting_enable_latex_ghost_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableLatexGhost).onChange(async value => {
          settings.enableLatexGhost = value;
          await this.plugin.saveSettings();
        }),
      );

    const yamlArea = containerEl.createEl("textarea");
    yamlArea.style.width = "100%";
    yamlArea.style.height = "220px";
    yamlArea.style.fontFamily = "var(--font-monospace)";
    yamlArea.style.fontSize = "13px";
    yamlArea.style.whiteSpace = "pre";
    yamlArea.style.overflow = "auto";
    yamlArea.spellcheck = false;
    yamlArea.value = settings.latexCommandsYaml;
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

    const yamlBtnRow = containerEl.createDiv({ cls: "setting-item" });
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
    // 5. Localization (Labels & Prefixes)
    // defaults 方式ではキャプション語／参照接頭辞も defaults file 側の metadata で管理するため非表示。
    // =================================================================
    if (!isDefaultsMode) {
      containerEl.createEl("h3", { text: t("heading_localization") });
      containerEl.createEl("p", {
        text: t("heading_localization_desc"),
        cls: "setting-item-description",
      });

      // Helper to create label settings pair
      const createLabelSetting = (
        name: string,
        labelKey: keyof ProfileSettings,
        prefixKey: keyof ProfileSettings,
      ) => {
        const div = containerEl.createDiv({ cls: "setting-item" });
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        div.style.padding = "0.75em 0";
        div.style.borderTop = "1px solid var(--background-modifier-border)";

        const info = div.createDiv({ cls: "setting-item-info" });
        info.createDiv({ cls: "setting-item-name", text: name });

        const control = div.createDiv({ cls: "setting-item-control" });
        control.style.gap = "10px";

        // Label Input
        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.placeholder = t("placeholder_label");
        labelInput.value = String(currentProfile[labelKey]);
        labelInput.style.width = "120px";
        labelInput.onchange = async () => {
          // @ts-ignore
          currentProfile[labelKey] = labelInput.value;
          await this.plugin.saveSettings();
        };

        // Prefix Input
        const prefixInput = document.createElement("input");
        prefixInput.type = "text";
        prefixInput.placeholder = t("placeholder_prefix");
        prefixInput.value = String(currentProfile[prefixKey]);
        prefixInput.style.width = "120px";
        prefixInput.onchange = async () => {
          // @ts-ignore
          currentProfile[prefixKey] = prefixInput.value;
          await this.plugin.saveSettings();
        };

        control.appendChild(labelInput);
        control.appendChild(prefixInput);
      };

      createLabelSetting(t("label_figures"), "figureLabel", "figPrefix");
      createLabelSetting(t("label_tables"), "tableLabel", "tblPrefix");
      createLabelSetting(t("label_listings"), "codeLabel", "lstPrefix");
      createLabelSetting(t("label_equations"), "equationLabel", "eqnPrefix"); // Added Equation
    } // end localization section (defaults 方式では非表示)

    // =================================================================
    // 6. Cross-referencing & Filters
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_extensions") });

    new Setting(containerEl)
      .setName(t("setting_use_crossref_name"))
      .setDesc(t("setting_use_crossref_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.usePandocCrossref).onChange(async value => {
          currentProfile.usePandocCrossref = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    if (currentProfile.usePandocCrossref) {
      new Setting(containerEl)
        .setName(t("setting_crossref_path_name"))
        .setDesc(t("setting_crossref_path_desc"))
        .addText(text =>
          text.setValue(currentProfile.pandocCrossrefPath).onChange(async value => {
            currentProfile.pandocCrossrefPath = value;
            await this.plugin.saveSettings();
          }),
        );
    }

    new Setting(containerEl)
      .setName(t("setting_enable_advtex_name"))
      .setDesc(t("setting_enable_advtex_desc"))
      .addToggle(toggle =>
        toggle.setValue(currentProfile.enableAdvancedTexCommands).onChange(async value => {
          currentProfile.enableAdvancedTexCommands = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName(t("setting_pandoc_extra_args_name"))
      .setDesc(t("setting_pandoc_extra_args_desc"))
      .addText(text =>
        text
          .setValue(currentProfile.pandocExtraArgs)
          .setPlaceholder(t("placeholder_pandoc_extra_args"))
          .onChange(async value => {
            currentProfile.pandocExtraArgs = value;
            await this.plugin.saveSettings();
          }),
      );

    // --standalone 制御は defaults 方式では defaults file の standalone: で管理するため非表示。
    // builtin 方式のみ表示（本文フラグメント出力は defaults 方式の defaults file で行う）。
    if (!isDefaultsMode) {
      new Setting(containerEl)
        .setName(t("setting_use_standalone_name"))
        .setDesc(t("setting_use_standalone_desc"))
        .addToggle(toggle =>
          toggle.setValue(currentProfile.useStandalone).onChange(async value => {
            currentProfile.useStandalone = value;
            await this.plugin.saveSettings();
          }),
        );
    }

    // =================================================================
    // 7. Global Settings
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_global") });

    new Setting(containerEl)
      .setName(t("setting_enable_lint_fix_name"))
      .setDesc(t("setting_enable_lint_fix_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableMarkdownlintFix).onChange(async value => {
          settings.enableMarkdownlintFix = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    if (settings.enableMarkdownlintFix) {
      new Setting(containerEl)
        .setName(t("setting_markdownlint_path_name"))
        .setDesc(t("setting_markdownlint_path_desc"))
        .addText(text =>
          text.setValue(settings.markdownlintCli2Path).onChange(async value => {
            settings.markdownlintCli2Path = value;
            await this.plugin.saveSettings();
          }),
        );
    }

    new Setting(containerEl)
      .setName(t("setting_suppress_logs_name"))
      .setDesc(t("setting_suppress_logs_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.suppressDeveloperLogs).onChange(async value => {
          settings.suppressDeveloperLogs = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("setting_enable_mermaid_name"))
      .setDesc(t("setting_enable_mermaid_desc"))
      .addToggle(toggle =>
        toggle.setValue(settings.enableExperimentalMermaid).onChange(async value => {
          settings.enableExperimentalMermaid = value;
          await this.plugin.saveSettings();
        }),
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
        text.setValue(currentProfile.templateFolder ?? "").onChange(async value => {
          currentProfile.templateFolder = value;
          await this.plugin.saveSettings();
        }),
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
            .onChange(async value => {
              currentProfile.defaultsFilePath = value;
              await this.plugin.saveSettings();
            }),
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
        dropdown.onChange(async value => {
          currentProfile.selectedTemplatePack = value;
          await this.plugin.saveSettings();
        });
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
        const created = await scaffoldSampleTemplatePacks(
          this.app,
          currentProfile.templateFolder,
        );
        await this.display();
        new Notice(t("notice_sample_packs_installed", [created.join(", ") || "（既存）"]));
      }),
    );
  }
}

class PreambleModal extends Modal {
  private initial: string;
  private onSave: (val: string) => Promise<void> | void;

  constructor(app: App, initial: string, onSave: (val: string) => Promise<void> | void) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("modal_preamble_title") });

    const area = contentEl.createEl("textarea", { text: this.initial });
    area.style.width = "100%";
    area.style.height = "70vh";
    area.style.fontFamily = "var(--font-monospace)";
    area.style.fontSize = "13px";
    area.style.lineHeight = "1.45";
    area.style.resize = "vertical";
    area.spellcheck = false;

    const note = contentEl.createEl("p", { text: t("modal_note") });
    note.style.opacity = "0.8";

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";
    buttons.style.marginTop = "12px";

    const cancel = buttons.createEl("button", { text: t("modal_cancel") });
    cancel.onclick = () => this.close();

    const save = buttons.createEl("button", { text: t("modal_save") });
    save.classList.add("mod-cta");
    save.onclick = async () => {
      await this.onSave(area.value);
      this.close();
    };
  }
}
