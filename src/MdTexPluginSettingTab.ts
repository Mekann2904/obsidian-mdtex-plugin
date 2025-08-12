// MdTexPluginSettingTab.ts

import { App, PluginSettingTab, Setting, Modal, Notice, Menu, TextComponent, TextAreaComponent } from "obsidian";
import type PandocPlugin from "./MdTexPlugin";
import { DEFAULT_PROFILE, ProfileSettings } from "./MdTexPluginSettings";

/**
 * プロファイル名を入力するためのモーダル
 */
class ProfileNameModal extends Modal {
  result: string;
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void, public currentName: string = "") {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Profile Name" });
    const text = contentEl.createEl("input", { type: "text", value: this.currentName });
    text.style.width = "100%";
    
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.textAlign = "right";
    buttonContainer.style.marginTop = "1rem";
    
    const saveButton = buttonContainer.createEl("button", { text: "Save" });
    saveButton.onclick = () => {
      this.result = text.value.trim();
      if (this.result) {
        this.close();
        this.onSubmit(this.result);
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * 設定タブクラス
 */
export class PandocPluginSettingTab extends PluginSettingTab {
  plugin: PandocPlugin;
  language: "en" | "jp";

  constructor(app: App, plugin: PandocPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.language = "jp";
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Pandoc Plugin Settings" });

    // --- Profile Management UI ---
    containerEl.createEl("h3", { text: "Profiles / プロファイル" });

    new Setting(containerEl)
      .setName("Active Profile / アクティブなプロファイル")
      .setDesc("Select the setting profile to use. / 使用する設定プロファイルを選択します。")
      .addDropdown(dropdown => {
        const profiles = this.plugin.settings.profiles;
        Object.keys(profiles).forEach(name => {
          dropdown.addOption(name, name);
        });
        dropdown
          .setValue(this.plugin.settings.activeProfile)
          .onChange(async (value) => {
            this.plugin.settings.activeProfile = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh the settings tab
          });
      });

    new Setting(containerEl)
        .setName("Manage Profiles / プロファイル管理")
        .addButton(btn => btn.setButtonText("New / 新規作成").onClick(() => {
            new ProfileNameModal(this.app, async (name) => {
                if (this.plugin.settings.profiles[name]) {
                    new Notice(`Profile "${name}" already exists.`);
                    return;
                }
                this.plugin.settings.profiles[name] = JSON.parse(JSON.stringify(DEFAULT_PROFILE)); // Deep copy
                this.plugin.settings.activeProfile = name;
                await this.plugin.saveSettings();
                this.display();
            }).open();
        }))
        .addButton(btn => btn.setButtonText("Rename / 名前変更").onClick(() => {
            const oldName = this.plugin.settings.activeProfile;
            new ProfileNameModal(this.app, async (newName) => {
                if (this.plugin.settings.profiles[newName]) {
                    new Notice(`Profile "${newName}" already exists.`);
                    return;
                }
                this.plugin.settings.profiles[newName] = this.plugin.settings.profiles[oldName];
                delete this.plugin.settings.profiles[oldName];
                this.plugin.settings.activeProfile = newName;
                await this.plugin.saveSettings();
                this.display();
            }, oldName).open();
        }))
        .addButton(btn => btn.setButtonText("Delete / 削除").setIcon("trash").onClick(async () => {
            if (Object.keys(this.plugin.settings.profiles).length <= 1) {
                new Notice("Cannot delete the last profile.");
                return;
            }
            const nameToDelete = this.plugin.settings.activeProfile;
            delete this.plugin.settings.profiles[nameToDelete];
            this.plugin.settings.activeProfile = Object.keys(this.plugin.settings.profiles)[0];
            await this.plugin.saveSettings();
            this.display();
        }));


    // --- General Settings UI ---
    containerEl.createEl("h3", { text: "Active Profile Settings / アクティブなプロファイル設定" });
    
    new Setting(containerEl)
      .setName("Language / 言語")
      .setDesc("Switch between English and Japanese. / 英語と日本語を切り替えます。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.language === "jp")
          .onChange((value) => {
            this.language = value ? "jp" : "en";
            this.display();
          })
      );
    
    // 現在アクティブなプロファイルの設定を取得
    const activeSettings = this.plugin.getActiveProfileSettings();
    if (!activeSettings) {
        containerEl.createEl('p', {text: 'Error: Active profile not found. Please create a new profile.'});
        return;
    }
    
    const createSetting = (key: keyof ProfileSettings, name: {en: string, jp: string}, desc: {en: string, jp: string}, type: 'text' | 'textarea' | 'toggle' | 'dropdown', options?: any) => {
        const setting = new Setting(containerEl)
            .setName(this.language === 'jp' ? name.jp : name.en)
            .setDesc(this.language === 'jp' ? desc.jp : desc.en);
        
        const changeHandler = async (value: any) => {
            (activeSettings[key] as any) = typeof value === 'string' ? value.trim() : value;
            await this.plugin.saveSettings();
        };

        // 他プロファイルの値を取得
        const otherProfiles = Object.entries(this.plugin.settings.profiles)
            .filter(([profileName]) => profileName !== this.plugin.settings.activeProfile);
        const otherProfileValues = otherProfiles
            .map(([_, profile]) => profile[key])
            .filter((v, i, arr) => typeof v === 'string' && v && arr.indexOf(v) === i) as string[];
        const shouldShowSuggestButton = otherProfiles.length > 0;

        switch (type) {
            case 'textarea': {
                let textAreaComponent: TextAreaComponent;
                setting.addTextArea((tc: TextAreaComponent) => {
                    textAreaComponent = tc;
                    tc.setValue(activeSettings[key] as string).onChange(changeHandler);
                    tc.inputEl.addEventListener('input', (e) => {
                        const value = tc.inputEl.value;
                        if (value.endsWith('@') && shouldShowSuggestButton && otherProfileValues.length > 0) {
                            const menu = new Menu();
                            otherProfileValues.forEach(val => {
                                menu.addItem((item: any) => item.setTitle(val).onClick(() => {
                                    tc.setValue(val);
                                    changeHandler(val);
                                }));
                            });
                            const rect = tc.inputEl.getBoundingClientRect();
                            const event = new MouseEvent('click', {clientX: rect.left, clientY: rect.bottom});
                            menu.showAtMouseEvent(event);
                        }
                    });
                });
                if (shouldShowSuggestButton) {
                    setting.addExtraButton(btn => {
                        btn.setIcon('down-chevron')
                           .setTooltip(this.language === 'jp' ? '他プロファイルから選択' : 'Select from other profiles')
                           .onClick(() => {
                               const menu = new Menu();
                               otherProfileValues.forEach(val => {
                                   menu.addItem((item: any) => item.setTitle(val).onClick(() => {
                                       textAreaComponent.inputEl.value = val;
                                       textAreaComponent.inputEl.dispatchEvent(new Event('input'));
                                       changeHandler(val);
                                   }));
                               });
                               const rect = btn.extraSettingsEl.getBoundingClientRect();
                               const event = new MouseEvent('click', {clientX: rect.left, clientY: rect.bottom});
                               menu.showAtMouseEvent(event);
                           });
                    });
                }
                break;
            }
            case 'toggle':
                setting.addToggle(tg => tg.setValue(activeSettings[key] as boolean).onChange(changeHandler));
                break;
            case 'dropdown':
                 setting.addDropdown(dd => {
                     options.forEach((opt: [string, string]) => dd.addOption(opt[0], opt[1]));
                     dd.setValue(activeSettings[key] as string).onChange(changeHandler);
                 });
                 break;
            default: { // text
                let textComponent: TextComponent;
                setting.addText((txt: TextComponent) => {
                    textComponent = txt;
                    txt.setValue(activeSettings[key] as string).onChange(changeHandler);
                    txt.inputEl.addEventListener('input', (e) => {
                        const value = txt.inputEl.value;
                        if (value.endsWith('@') && shouldShowSuggestButton && otherProfileValues.length > 0) {
                            const menu = new Menu();
                            otherProfileValues.forEach(val => {
                                menu.addItem((item: any) => item.setTitle(val).onClick(() => {
                                    txt.setValue(val);
                                    changeHandler(val);
                                }));
                            });
                            const rect = txt.inputEl.getBoundingClientRect();
                            const event = new MouseEvent('click', {clientX: rect.left, clientY: rect.bottom});
                            menu.showAtMouseEvent(event);
                        }
                    });
                });
                if (shouldShowSuggestButton) {
                    setting.addExtraButton(btn => {
                        btn.setIcon('down-chevron')
                           .setTooltip(this.language === 'jp' ? '他プロファイルから選択' : 'Select from other profiles')
                           .onClick(() => {
                               const menu = new Menu();
                               otherProfileValues.forEach(val => {
                                   menu.addItem((item: any) => item.setTitle(val).onClick(() => {
                                       textComponent.inputEl.value = val;
                                       textComponent.inputEl.dispatchEvent(new Event('input'));
                                       changeHandler(val);
                                   }));
                               });
                               const rect = btn.extraSettingsEl.getBoundingClientRect();
                               const event = new MouseEvent('click', {clientX: rect.left, clientY: rect.bottom});
                               menu.showAtMouseEvent(event);
                           });
                    });
                }
                break;
            }
        }
    }

    // 各種設定項目
    createSetting('pandocPath', { en: 'Pandoc Path', jp: 'Pandocパス' }, { en: 'Path to Pandoc executable.', jp: 'Pandoc実行ファイルのパス。' }, 'text');
    createSetting('pandocExtraArgs', { en: 'Pandoc Extra Args', jp: 'Pandoc追加オプション' }, { en: 'Extra arguments for Pandoc (space-separated).', jp: 'Pandoc追加オプション（スペース区切り）。' }, 'text');
    createSetting('pandocCrossrefPath', { en: 'pandoc-crossref Path', jp: 'pandoc-crossrefパス' }, { en: 'Path to pandoc-crossref executable.', jp: 'pandoc-crossref実行ファイルのパス。' }, 'text');
    createSetting('luaFilterPath', { en: 'Lua Filter Path', jp: 'Luaフィルタパス' }, { en: 'Path to Lua filter for advanced TeX command conversion (e.g., tex-to-docx.lua).', jp: '高度なTeXコマンド変換用Luaフィルタのパス（例: tex-to-docx.lua）。' }, 'text');
    createSetting('searchDirectory', { en: 'Search Directory', jp: '検索ディレクトリ' }, { en: 'Root directory for searching images.', jp: '画像を検索するルートディレクトリ。' }, 'text');
    createSetting('outputDirectory', { en: 'Output Directory', jp: '出力ディレクトリ' }, { en: 'Directory for generated files (blank = vault root).', jp: '生成ファイルの保存先（空欄=Vaultルート）。' }, 'text');
    createSetting('latexEngine', { en: 'LaTeX Engine', jp: 'LaTeXエンジン' }, { en: 'e.g., lualatex, xelatex', jp: '例: lualatex, xelatex' }, 'text');
    createSetting('documentClass', { en: 'Document Class', jp: 'ドキュメントクラス' }, { en: 'e.g., ltjarticle, beamer', jp: '例: ltjarticle, beamer' }, 'text');
    createSetting('documentClassOptions', { en: 'Document Class Options', jp: 'ドキュメントクラスオプション' }, { en: 'e.g., dvipdfmx,12pt', jp: '例: dvipdfmx,12pt' }, 'text');
    createSetting('fontSize', { en: 'Font Size', jp: 'フォントサイズ' }, { en: 'e.g., 12pt', jp: '例: 12pt' }, 'text');
    createSetting('marginSize', { en: 'Margin Size', jp: '余白サイズ' }, { en: 'e.g., 25mm', jp: '例: 25mm' }, 'text');
    createSetting('imageScale', { en: 'Image Scale', jp: '画像スケール' }, { en: 'e.g., width=0.8\\textwidth', jp: '例: width=0.8\\textwidth' }, 'text');

    createSetting('outputFormat', {en: 'Default Output Format', jp: 'デフォルト出力形式'}, {en: 'Default format for ribbon icon.', jp: 'リボンアイコンのデフォルト形式。'}, 'dropdown', [['pdf', 'pdf'], ['latex', 'latex'], ['docx', 'docx']]);
    
    // Toggles
    createSetting('useStandalone', { en: 'Use --standalone', jp: '--standaloneを使う' }, { en: 'Pass --standalone option to pandoc.', jp: 'pandocに--standaloneオプションを渡す。' }, 'toggle');
    createSetting('usePandocCrossref', { en: 'Use pandoc-crossref', jp: 'pandoc-crossrefを使う' }, { en: 'Enable pandoc-crossref filter.', jp: 'pandoc-crossrefフィルタを有効にする。' }, 'toggle');
    createSetting('usePageNumber', { en: 'Enable Page Numbering', jp: 'ページ番号を付ける' }, { en: 'Enable page numbering in PDF.', jp: 'PDFにページ番号を付ける。' }, 'toggle');
    createSetting('useMarginSize', { en: 'Enable Margin Size', jp: '余白サイズを有効にする' }, { en: 'Enable geometry:margin option.', jp: 'geometry:marginオプションを有効にする。' }, 'toggle');
    createSetting('deleteIntermediateFiles', { en: 'Delete Intermediate Files', jp: '中間ファイルを削除' }, { en: '.temp.md after conversion.', jp: '変換後に.temp.mdを削除。' }, 'toggle');
    createSetting('enableAdvancedTexCommands', { en: 'Enable Advanced TeX Commands', jp: '高度なTeXコマンドを有効にする' }, { en: 'Enable advanced TeX command conversion for docx (\\centerline, \\rightline, \\ruby, etc.).', jp: 'docx変換時に高度なTeXコマンド変換を有効にする（\\centerline、\\rightline、\\ruby等）。' }, 'toggle');

    // Labels and Prefixes
    containerEl.createEl("h4", { text: "Labels & Prefixes / ラベルとプレフィックス" });
    createSetting('figureLabel', { en: 'Figure Label', jp: '図のラベル' }, { en: 'e.g., Figure', jp: '例: 図' }, 'text');
    createSetting('figPrefix', { en: 'Figure Prefix', jp: '図のプレフィックス' }, { en: 'e.g., Fig.', jp: '例: 図' }, 'text');
    createSetting('tableLabel', { en: 'Table Label', jp: '表のラベル' }, { en: 'e.g., Table', jp: '例: 表' }, 'text');
    createSetting('tblPrefix', { en: 'Table Prefix', jp: '表のプレフィックス' }, { en: 'e.g., Table', jp: '例: 表' }, 'text');
    createSetting('codeLabel', { en: 'Code Label', jp: 'コードのラベル' }, { en: 'e.g., Code', jp: '例: コード' }, 'text');
    createSetting('lstPrefix', { en: 'Code Prefix', jp: 'コードのプレフィックス' }, { en: 'e.g., Code', jp: '例: コード' }, 'text');
    createSetting('equationLabel', { en: 'Equation Label', jp: '数式のラベル' }, { en: 'e.g., Equation', jp: '例: 式' }, 'text');
    createSetting('eqnPrefix', { en: 'Equation Prefix', jp: '数式のプレフィックス' }, { en: 'e.g., Eq.', jp: '例: 式' }, 'text');

    // Header Includes
    containerEl.createEl("h4", { text: "Header Includes" });
    createSetting('headerIncludes', { en: 'Header Includes', jp: 'ヘッダIncludes' }, { en: 'Custom LaTeX header includes (YAML).', jp: 'カスタムLaTeXヘッダ（YAML形式）。' }, 'textarea');

    // Global Settings
    containerEl.createEl("h4", { text: "Global Settings / グローバル設定" });
    new Setting(containerEl)
      .setName("markdownlint-cli2 Path / 実行パス")
      .setDesc("Absolute path to markdownlint-cli2 binary. 空欄は自動解決（node_modules/.bin優先→PATH）。")
      .addText((txt) =>
        txt
          .setPlaceholder("/usr/local/bin/markdownlint-cli2 など")
          .setValue(this.plugin.settings.markdownlintCli2Path || "")
          .onChange(async (value) => {
            this.plugin.settings.markdownlintCli2Path = value.trim();
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Auto-fix Markdown Lint / Markdown Lint自動修正")
      .setDesc("Run markdownlint-cli2 --fix before Pandoc. / Pandoc実行前にmarkdownlint-cli2 --fixを実行する。")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableMarkdownlintFix)
        .onChange(async (value) => {
          this.plugin.settings.enableMarkdownlintFix = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Suppress Developer Logs / 開発者ログを抑制")
      .setDesc("Suppress console.log messages (errors will still be shown in console). / console.logメッセージを抑制（エラーは引き続きコンソールに表示）。")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.suppressDeveloperLogs)
        .onChange(async (value) => {
          this.plugin.settings.suppressDeveloperLogs = value;
          await this.plugin.saveSettings();
        }));
  }
}
