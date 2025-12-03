// File: src/MdTexPluginSettingTab.ts
// Purpose: プラグインの設定画面UIを提供する。
// Reason: ユーザーがプロファイルを管理し、各パラメータ（パス、ラベル、LaTeXプリアンブル等）をGUIで変更可能にするため。
// Related: src/MdTexPlugin.ts, src/MdTexPluginSettings.ts

import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import MdTexPlugin from "./MdTexPlugin";
import { DEFAULT_LATEX_PREAMBLE, ProfileSettings } from "./MdTexPluginSettings";
import { t } from "./lang/helpers";

export class PandocPluginSettingTab extends PluginSettingTab {
  plugin: MdTexPlugin;

  constructor(app: App, plugin: MdTexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // タイトル
    containerEl.createEl("h2", { text: t("settings_title") });

    const settings = this.plugin.settings;
    const activeProfileKey = settings.activeProfile;
    const currentProfile = settings.profiles[activeProfileKey];

    // =================================================================
    // 1. プロファイル管理セクション
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_profile") });

    new Setting(containerEl)
      .setName(t("setting_active_profile_name"))
      .setDesc(t("setting_active_profile_desc"))
      .addDropdown((dropdown) => {
        Object.keys(settings.profiles).forEach((key) => {
          dropdown.addOption(key, key);
        });
        dropdown.setValue(activeProfileKey);
        dropdown.onChange(async (value) => {
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
      .addText((text) =>
        text
          .setPlaceholder(t("placeholder_new_profile"))
          .onChange((value) => {
            newProfileName = value;
          })
      )
      .addButton((button) =>
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
            settings.profiles[createdName] = { ...currentProfile };
            settings.activeProfile = createdName;
            await this.plugin.saveSettings();
            newProfileName = "";
            this.display();
            new Notice(t("notice_profile_created", [createdName]));
          })
      );

    // プロファイル削除
    new Setting(containerEl)
      .setName(t("setting_delete_profile_name"))
      .setDesc(t("setting_delete_profile_desc"))
      .addButton((button) => {
        button
          .setButtonText(t("button_delete_profile"))
          .setWarning()
          .setDisabled(Object.keys(settings.profiles).length <= 1)
          .onClick(async () => {
            if (Object.keys(settings.profiles).length <= 1) return;
            if (!confirm(t("confirm_delete_profile", [activeProfileKey]))) return;

            delete settings.profiles[activeProfileKey];
            const remainingKeys = Object.keys(settings.profiles);
            settings.activeProfile = remainingKeys[0];
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
      .addDropdown((dropdown) => {
        dropdown.addOption("pdf", t("option_pdf"));
        dropdown.addOption("docx", t("option_docx"));
        dropdown.addOption("latex", t("option_latex"));
        dropdown.setValue(currentProfile.outputFormat)
        .onChange(async (value) => {
            currentProfile.outputFormat = value;
            await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("setting_pandoc_path_name"))
      .setDesc(t("setting_pandoc_path_desc"))
      .addText((text) =>
        text
          .setValue(currentProfile.pandocPath)
          .onChange(async (value) => {
            currentProfile.pandocPath = value;
            await this.plugin.saveSettings();
          })
      );
    
    new Setting(containerEl)
        .setName(t("setting_output_dir_name"))
        .setDesc(t("setting_output_dir_desc"))
        .addText((text) =>
            text.setValue(currentProfile.outputDirectory)
            .onChange(async (value) => {
                currentProfile.outputDirectory = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
        .setName(t("setting_resource_dir_name"))
        .setDesc(t("setting_resource_dir_desc"))
        .addText((text) => 
            text.setValue(currentProfile.searchDirectory)
            .onChange(async (value) => {
                currentProfile.searchDirectory = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
      .setName(t("setting_delete_intermediate_name"))
      .setDesc(t("setting_delete_intermediate_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(currentProfile.deleteIntermediateFiles)
          .onChange(async (value) => {
            currentProfile.deleteIntermediateFiles = value;
            await this.plugin.saveSettings();
          })
      );

    // =================================================================
    // 3. LaTeX / PDF 設定
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_latex_engine") });

    new Setting(containerEl)
      .setName(t("setting_latex_engine_name"))
      .setDesc(t("setting_latex_engine_desc"))
      .addText((text) =>
        text
          .setValue(currentProfile.latexEngine)
          .onChange(async (value) => {
            currentProfile.latexEngine = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("setting_document_class_name"))
      .setDesc(t("setting_document_class_desc"))
      .addText((text) =>
        text
          .setValue(currentProfile.documentClass)
          .onChange(async (value) => {
            currentProfile.documentClass = value;
            await this.plugin.saveSettings();
          })
      );
    
    new Setting(containerEl)
        .setName(t("setting_document_class_opts_name"))
        .setDesc(t("setting_document_class_opts_desc"))
        .addText((text) =>
            text.setValue(currentProfile.documentClassOptions)
            .onChange(async (value) => {
                currentProfile.documentClassOptions = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
      .setName(t("setting_font_size_name"))
      .setDesc(t("setting_font_size_desc"))
      .addText((text) =>
        text
          .setValue(currentProfile.fontSize)
          .onChange(async (value) => {
            currentProfile.fontSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
        .setName(t("setting_use_margin_name"))
        .setDesc(t("setting_use_margin_desc"))
        .addToggle((toggle) => 
            toggle.setValue(currentProfile.useMarginSize)
            .onChange(async (value) => {
                currentProfile.useMarginSize = value;
                await this.plugin.saveSettings();
                this.display(); // 再描画でMargin Size入力を有効/無効化
            })
        );
    
    if (currentProfile.useMarginSize) {
        new Setting(containerEl)
            .setName(t("setting_margin_size_name"))
            .setDesc(t("setting_margin_size_desc"))
            .addText((text) =>
                text.setValue(currentProfile.marginSize)
                .onChange(async (value) => {
                    currentProfile.marginSize = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
        .setName(t("setting_page_numbers_name"))
        .setDesc(t("setting_page_numbers_desc"))
        .addToggle((toggle) => 
            toggle.setValue(currentProfile.usePageNumber)
            .onChange(async (value) => {
                currentProfile.usePageNumber = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
        .setName(t("setting_image_scale_name"))
        .setDesc(t("setting_image_scale_desc"))
        .addText((text) =>
            text.setValue(currentProfile.imageScale)
            .onChange(async (value) => {
                currentProfile.imageScale = value;
                await this.plugin.saveSettings();
            })
        );

    // =================================================================
    // 4. LaTeX Preamble (Custom Header) - Improved UI
    // =================================================================
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
    textArea.style.overflow = "auto";  // スクロールバー
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
      const modal = new PreambleModal(this.app, currentProfile.headerIncludes, async (val) => {
        currentProfile.headerIncludes = val;
        textArea.value = val;
        await this.plugin.saveSettings();
      });
      modal.open();
    };

    const resetBtn = btnContainer.createEl("button", { text: t("button_reset_preamble") });
    resetBtn.addEventListener("click", async () => {
        if(confirm(t("confirm_reset_preamble"))) {
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

    // =================================================================
    // 5. Localization (Labels & Prefixes)
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_localization") });
    containerEl.createEl("p", { text: t("heading_localization_desc"), cls: "setting-item-description" });

    // Helper to create label settings pair
    const createLabelSetting = (name: string, labelKey: keyof ProfileSettings, prefixKey: keyof ProfileSettings) => {
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

    // =================================================================
    // 6. Cross-referencing & Filters
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_extensions") });

    new Setting(containerEl)
      .setName(t("setting_use_crossref_name"))
      .setDesc(t("setting_use_crossref_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(currentProfile.usePandocCrossref)
          .onChange(async (value) => {
            currentProfile.usePandocCrossref = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
    
    if (currentProfile.usePandocCrossref) {
        new Setting(containerEl)
            .setName(t("setting_crossref_path_name"))
            .setDesc(t("setting_crossref_path_desc"))
            .addText((text) =>
                text.setValue(currentProfile.pandocCrossrefPath)
                .onChange(async (value) => {
                    currentProfile.pandocCrossrefPath = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
      .setName(t("setting_enable_advtex_name"))
      .setDesc(t("setting_enable_advtex_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(currentProfile.enableAdvancedTexCommands)
          .onChange(async (value) => {
            currentProfile.enableAdvancedTexCommands = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (currentProfile.enableAdvancedTexCommands) {
        new Setting(containerEl)
            .setName(t("setting_lua_filter_name"))
            .setDesc(t("setting_lua_filter_desc"))
            .addText((text) => 
                text.setValue(currentProfile.luaFilterPath)
                .onChange(async (value) => {
                    currentProfile.luaFilterPath = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
        .setName(t("setting_pandoc_extra_args_name"))
        .setDesc(t("setting_pandoc_extra_args_desc"))
        .addText((text) =>
            text.setValue(currentProfile.pandocExtraArgs)
            .setPlaceholder(t("placeholder_pandoc_extra_args"))
            .onChange(async (value) => {
                currentProfile.pandocExtraArgs = value;
                await this.plugin.saveSettings();
            })
        );
    
    new Setting(containerEl)
        .setName(t("setting_use_standalone_name"))
        .setDesc(t("setting_use_standalone_desc"))
        .addToggle((toggle) => 
            toggle.setValue(currentProfile.useStandalone)
            .onChange(async (value) => {
                currentProfile.useStandalone = value;
                await this.plugin.saveSettings();
            })
        );

    // =================================================================
    // 7. Global Settings
    // =================================================================
    containerEl.createEl("h3", { text: t("heading_global") });

    new Setting(containerEl)
        .setName(t("setting_enable_lint_fix_name"))
        .setDesc(t("setting_enable_lint_fix_desc"))
        .addToggle((toggle) => 
            toggle.setValue(settings.enableMarkdownlintFix)
            .onChange(async (value) => {
                settings.enableMarkdownlintFix = value;
                await this.plugin.saveSettings();
                this.display();
            })
        );
    
    if (settings.enableMarkdownlintFix) {
        new Setting(containerEl)
            .setName(t("setting_markdownlint_path_name"))
            .setDesc(t("setting_markdownlint_path_desc"))
            .addText((text) =>
                text.setValue(settings.markdownlintCli2Path)
                .onChange(async (value) => {
                    settings.markdownlintCli2Path = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
      .setName(t("setting_suppress_logs_name"))
      .setDesc(t("setting_suppress_logs_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(settings.suppressDeveloperLogs)
          .onChange(async (value) => {
            settings.suppressDeveloperLogs = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("setting_enable_mermaid_name"))
      .setDesc(t("setting_enable_mermaid_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(settings.enableExperimentalMermaid)
          .onChange(async (value) => {
            settings.enableExperimentalMermaid = value;
            await this.plugin.saveSettings();
          })
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
