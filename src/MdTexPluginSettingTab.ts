// File: src/MdTexPluginSettingTab.ts
// Purpose: プラグインの設定画面UIを提供する。
// Reason: ユーザーがプロファイルを管理し、各パラメータ（パス、ラベル、LaTeXプリアンブル等）をGUIで変更可能にするため。
// Related: src/MdTexPlugin.ts, src/MdTexPluginSettings.ts

import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import MdTexPlugin from "./MdTexPlugin";
import { DEFAULT_LATEX_PREAMBLE, ProfileSettings } from "./MdTexPluginSettings";

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
    containerEl.createEl("h2", { text: "MdTex Plugin Settings" });

    const settings = this.plugin.settings;
    const activeProfileKey = settings.activeProfile;
    const currentProfile = settings.profiles[activeProfileKey];

    // =================================================================
    // 1. プロファイル管理セクション
    // =================================================================
    containerEl.createEl("h3", { text: "Profile Management" });

    new Setting(containerEl)
      .setName("Active Profile")
      .setDesc("Select the profile to use for conversion.")
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
      .setName("Create New Profile")
      .setDesc("Enter a name for the new profile.")
      .addText((text) =>
        text
          .setPlaceholder("New Profile Name")
          .onChange((value) => {
            newProfileName = value;
          })
      )
      .addButton((button) =>
        button
          .setButtonText("Add Profile")
          .setCta()
          .onClick(async () => {
            if (!newProfileName || settings.profiles[newProfileName]) {
              new Notice("Invalid or duplicate profile name.");
              return;
            }
            // 現在のプロファイルをコピーして作成
            settings.profiles[newProfileName] = { ...currentProfile };
            settings.activeProfile = newProfileName;
            await this.plugin.saveSettings();
            newProfileName = "";
            this.display();
            new Notice(`Profile "${newProfileName}" created.`);
          })
      );

    // プロファイル削除
    new Setting(containerEl)
      .setName("Delete Current Profile")
      .setDesc("Delete the currently active profile (cannot delete if it's the only one).")
      .addButton((button) => {
        button
          .setButtonText("Delete Profile")
          .setWarning()
          .setDisabled(Object.keys(settings.profiles).length <= 1)
          .onClick(async () => {
            if (Object.keys(settings.profiles).length <= 1) return;
            if (!confirm(`Are you sure you want to delete profile "${activeProfileKey}"?`)) return;

            delete settings.profiles[activeProfileKey];
            const remainingKeys = Object.keys(settings.profiles);
            settings.activeProfile = remainingKeys[0];
            await this.plugin.saveSettings();
            this.display();
            new Notice(`Profile "${activeProfileKey}" deleted.`);
          });
      });

    // =================================================================
    // 2. 変換・出力設定 (General)
    // =================================================================
    containerEl.createEl("h3", { text: "General Output Settings" });

    new Setting(containerEl)
      .setName("Output Format")
      .setDesc("Target format for conversion.")
      .addDropdown((dropdown) => {
        dropdown.addOption("pdf", "PDF");
        dropdown.addOption("docx", "Word (docx)");
        dropdown.addOption("latex", "LaTeX Source (.tex)");
        dropdown.setValue(currentProfile.outputFormat)
        .onChange(async (value) => {
            currentProfile.outputFormat = value;
            await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Pandoc Path")
      .setDesc("Absolute path to the pandoc executable (e.g. /usr/local/bin/pandoc).")
      .addText((text) =>
        text
          .setValue(currentProfile.pandocPath)
          .onChange(async (value) => {
            currentProfile.pandocPath = value;
            await this.plugin.saveSettings();
          })
      );
    
    new Setting(containerEl)
        .setName("Output Directory")
        .setDesc("Directory where generated files will be saved. Leave empty for Vault root.")
        .addText((text) =>
            text.setValue(currentProfile.outputDirectory)
            .onChange(async (value) => {
                currentProfile.outputDirectory = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
        .setName("Resource Search Directory")
        .setDesc("Directory to search for images and resources (--resource-path). If empty, uses the input file's directory.")
        .addText((text) => 
            text.setValue(currentProfile.searchDirectory)
            .onChange(async (value) => {
                currentProfile.searchDirectory = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
      .setName("Delete Intermediate Files")
      .setDesc("Delete .tex or .temp.md files after successful conversion.")
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
    containerEl.createEl("h3", { text: "LaTeX / PDF Engine Settings" });

    new Setting(containerEl)
      .setName("LaTeX Engine")
      .setDesc("Engine used for PDF generation (e.g. lualatex, xelatex, pdflatex).")
      .addText((text) =>
        text
          .setValue(currentProfile.latexEngine)
          .onChange(async (value) => {
            currentProfile.latexEngine = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Document Class")
      .setDesc("LaTeX document class (e.g. ltjarticle, article, book).")
      .addText((text) =>
        text
          .setValue(currentProfile.documentClass)
          .onChange(async (value) => {
            currentProfile.documentClass = value;
            await this.plugin.saveSettings();
          })
      );
    
    new Setting(containerEl)
        .setName("Document Class Options")
        .setDesc("Options for document class (e.g. a4paper, twocolumn).")
        .addText((text) =>
            text.setValue(currentProfile.documentClassOptions)
            .onChange(async (value) => {
                currentProfile.documentClassOptions = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
      .setName("Font Size")
      .setDesc("Base font size (e.g. 11pt, 12pt).")
      .addText((text) =>
        text
          .setValue(currentProfile.fontSize)
          .onChange(async (value) => {
            currentProfile.fontSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
        .setName("Use Margin Size")
        .setDesc("Enable custom margin settings.")
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
            .setName("Margin Size")
            .setDesc("Geometry margin (e.g. 25mm, 1in).")
            .addText((text) =>
                text.setValue(currentProfile.marginSize)
                .onChange(async (value) => {
                    currentProfile.marginSize = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
        .setName("Page Numbers")
        .setDesc("Enable page numbering.")
        .addToggle((toggle) => 
            toggle.setValue(currentProfile.usePageNumber)
            .onChange(async (value) => {
                currentProfile.usePageNumber = value;
                await this.plugin.saveSettings();
            })
        );

    new Setting(containerEl)
        .setName("Image Scale")
        .setDesc("Default image scaling (e.g. width=0.8\\textwidth).")
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
    containerEl.createEl("h3", { text: "LaTeX Preamble" });
    
    const preambleDesc = containerEl.createDiv({ cls: "setting-item-description" });
    preambleDesc.setText("Enter pure LaTeX code only. YAML delimiters (---) and 'header-includes:' are injected automatically. This field supports full-width editing.");
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
    textArea.placeholder = "\\usepackage{...}";
    
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

    const fullscreenBtn = btnContainer.createEl("button", { text: "Open Fullscreen" });
    fullscreenBtn.onclick = async () => {
      await this.plugin.saveSettings();
      const modal = new PreambleModal(this.app, currentProfile.headerIncludes, async (val) => {
        currentProfile.headerIncludes = val;
        textArea.value = val;
        await this.plugin.saveSettings();
      });
      modal.open();
    };

    const resetBtn = btnContainer.createEl("button", { text: "Reset Preamble to Default" });
    resetBtn.addEventListener("click", async () => {
        if(confirm("Are you sure you want to reset the LaTeX Preamble to the default template? This will overwrite your current changes.")) {
            currentProfile.headerIncludes = DEFAULT_LATEX_PREAMBLE;
            textArea.value = DEFAULT_LATEX_PREAMBLE;
            await this.plugin.saveSettings();
            new Notice("LaTeX Preamble reset to default.");
        }
    });

    const copyBtn = btnContainer.createEl("button", { text: "Copy" });
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(textArea.value);
      new Notice("Preamble copied to clipboard.");
    };

    // =================================================================
    // 5. Localization (Labels & Prefixes)
    // =================================================================
    containerEl.createEl("h3", { text: "Localization (Labels & Prefixes)" });
    containerEl.createEl("p", { text: "Set the labels used for captions and cross-references.", cls: "setting-item-description" });

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
        labelInput.placeholder = "Label";
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
        prefixInput.placeholder = "Prefix";
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

    createLabelSetting("Figures (Label / Prefix)", "figureLabel", "figPrefix");
    createLabelSetting("Tables (Label / Prefix)", "tableLabel", "tblPrefix");
    createLabelSetting("Listings (Label / Prefix)", "codeLabel", "lstPrefix");
    createLabelSetting("Equations (Label / Prefix)", "equationLabel", "eqnPrefix"); // Added Equation

    // =================================================================
    // 6. Cross-referencing & Filters
    // =================================================================
    containerEl.createEl("h3", { text: "Extensions & Filters" });

    new Setting(containerEl)
      .setName("Use Pandoc Crossref")
      .setDesc("Enable pandoc-crossref filter.")
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
            .setName("Pandoc Crossref Path")
            .setDesc("Path to pandoc-crossref executable.")
            .addText((text) =>
                text.setValue(currentProfile.pandocCrossrefPath)
                .onChange(async (value) => {
                    currentProfile.pandocCrossrefPath = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
      .setName("Enable Advanced LaTeX Commands")
      .setDesc("Enable Lua filters (e.g. for docx raw output).")
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
            .setName("Lua Filter Path")
            .setDesc("Path to custom lua filter.")
            .addText((text) => 
                text.setValue(currentProfile.luaFilterPath)
                .onChange(async (value) => {
                    currentProfile.luaFilterPath = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
        .setName("Pandoc Extra Arguments")
        .setDesc("Any other arguments to pass to pandoc.")
        .addText((text) =>
            text.setValue(currentProfile.pandocExtraArgs)
            .setPlaceholder("--toc --number-sections")
            .onChange(async (value) => {
                currentProfile.pandocExtraArgs = value;
                await this.plugin.saveSettings();
            })
        );
    
    new Setting(containerEl)
        .setName("Use Standalone")
        .setDesc("Pass --standalone flag (produces full document with header).")
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
    containerEl.createEl("h3", { text: "Global Settings" });

    new Setting(containerEl)
        .setName("Enable Markdownlint Fix")
        .setDesc("Run 'markdownlint-cli2 --fix' before conversion.")
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
            .setName("Markdownlint-cli2 Path")
            .setDesc("Path to markdownlint-cli2 executable.")
            .addText((text) =>
                text.setValue(settings.markdownlintCli2Path)
                .onChange(async (value) => {
                    settings.markdownlintCli2Path = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    new Setting(containerEl)
      .setName("Suppress Developer Logs")
      .setDesc("Hide detailed logs in the developer console.")
      .addToggle((toggle) =>
        toggle
          .setValue(settings.suppressDeveloperLogs)
          .onChange(async (value) => {
            settings.suppressDeveloperLogs = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable Experimental Mermaid")
      .setDesc("Render mermaid blocks via DOM-to-PNG (experimental; may be slow).")
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
    contentEl.createEl("h2", { text: "Edit LaTeX Preamble" });

    const area = contentEl.createEl("textarea", { text: this.initial });
    area.style.width = "100%";
    area.style.height = "70vh";
    area.style.fontFamily = "var(--font-monospace)";
    area.style.fontSize = "13px";
    area.style.lineHeight = "1.45";
    area.style.resize = "vertical";
    area.spellcheck = false;

    const note = contentEl.createEl("p", { text: "Enter pure LaTeX only. YAML will be injected automatically." });
    note.style.opacity = "0.8";

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";
    buttons.style.marginTop = "12px";

    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.close();

    const save = buttons.createEl("button", { text: "Save" });
    save.classList.add("mod-cta");
    save.onclick = async () => {
      await this.onSave(area.value);
      this.close();
    };
  }
}
