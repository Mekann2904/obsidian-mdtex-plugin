// File: src/lang/locale/en.ts
// Purpose: i18n 辞書の英語版を定義する。
// Reason: プラグイン全体で参照する基準言語として型を提供するため。
// Related: src/lang/locale/ja.ts, src/lang/helpers.ts, src/MdTexPlugin.ts, src/MdTexPluginSettingTab.ts

const en = {
  ribbon_convert_active: "Convert current file (active profile)",
  cmd_convert_pdf: "Convert current file to PDF",
  cmd_convert_latex: "Convert current file to LaTeX",
  cmd_lint: "Lint current note (markdownlint-cli2)",
  cmd_fix: "Apply markdownlint --fix to current note",
  cmd_open_latex_palette: "Insert LaTeX command (fuzzy palette)",
  heading_latex_palette: "LaTeX Command Palette",
  setting_latex_yaml_desc:
    "Edit YAML to define commands shown in the fuzzy palette. Fields: cmd, desc, cursorOffset(optional).",
  button_reset_latex_yaml: "Reset to default commands",
  notice_latex_yaml_reset: "LaTeX command list reset to default.",
  setting_enable_latex_palette_name: "Enable LaTeX palette & inline suggest",
  setting_enable_latex_palette_desc: "Toggle LaTeX command palette and inline suggestions.",
  setting_enable_latex_ghost_name: "Enable inline ghost (experimental)",
  setting_enable_latex_ghost_desc: "Show inline ghost suggestions; accept with Tab or ArrowRight.",
  notice_latex_palette_disabled: "LaTeX command palette is disabled in settings.",

  notice_convert_done: "{0} conversion completed.",
  notice_lint_done: "Lint completed.",
  notice_no_active_file_fix: "No active file to fix.",
  notice_fix_done: "markdownlint --fix applied.",
  notice_operation_failed: "{0} failed: {1}",

  notice_no_active_file: "No active file selected.",
  notice_not_markdown: "The active file is not a Markdown file.",
  notice_converting: "Converting to {0}...",
  notice_output_dir_missing: "Output directory does not exist: {0}",
  notice_markdownlint_failed_continue: "markdownlint-cli2 failed; continuing the process.",
  notice_pandoc_stdin_failed: "Pandoc failed when using stdin pathway.",
  notice_error_generating: "Error generating output: {0}",
  notice_pandoc_stderr: "Pandoc: {0}... (check console for more logs)",
  notice_pandoc_more_logs: "Pandoc: additional logs are available in the console.",
  notice_generated: "Successfully generated: {0}",
  notice_pandoc_exit_code: "Error: Pandoc process exited with code {0}",
  notice_duplicate_labels: "Conversion aborted: duplicate cross-reference labels detected: {0}. Please make labels unique (fig:, tbl:, lst:, eq:, sec:).",
  notice_pandoc_launch_error: "Error launching Pandoc: {0}",
  notice_defaults_file_required:
    "Document template mode is 'Defaults file', but no defaults file path is set. Set the path in the profile settings.",

  notice_markdownlint_missing: "markdownlint-cli2 not found. Specify the path in settings.",
  notice_lint_ok: "Lint completed: no issues.",
  notice_lint_warn_code: "Lint completed: issues found (code={0})",
  notice_markdownlint_launch_failed:
    "Failed to launch markdownlint-cli2. Check the path and Node installation.",
  notice_lint_error: "Lint error: {0}",

  status_ready: "MdTex: ready",
  status_converting: "MdTex: converting to {0}…",
  status_linting: "MdTex: linting…",
  status_fixing: "MdTex: fixing…",
  status_done: "MdTex: done ({0}, {1} ms)",
  status_error: "MdTex: error in {0}",

  settings_title: "MdTex Plugin Settings",
  heading_profile: "Profile Management",
  setting_active_profile_name: "Active Profile",
  setting_active_profile_desc: "Select the profile to use for conversion.",
  setting_create_profile_name: "Create New Profile",
  setting_create_profile_desc: "Enter a name for the new profile.",
  placeholder_new_profile: "New Profile Name",
  button_add_profile: "Add Profile",
  notice_invalid_profile: "Invalid or duplicate profile name.",
  notice_profile_created: 'Profile "{0}" created.',
  setting_delete_profile_name: "Delete Current Profile",
  setting_delete_profile_desc:
    "Delete the currently active profile (cannot delete if it's the only one).",
  button_delete_profile: "Delete Profile",
  confirm_delete_profile: 'Are you sure you want to delete profile "{0}"?',
  notice_profile_deleted: 'Profile "{0}" deleted.',

  heading_general_output: "General Output Settings",
  setting_output_format_name: "Output Format",
  setting_output_format_desc: "Target format for conversion.",
  option_pdf: "PDF",
  option_docx: "Word (docx)",
  option_latex: "LaTeX Source (.tex)",
  setting_pandoc_path_name: "Pandoc Path",
  setting_pandoc_path_desc: "Absolute path to the pandoc executable (e.g. /usr/local/bin/pandoc).",
  setting_output_dir_name: "Output Directory",
  setting_output_dir_desc:
    "Directory where generated files will be saved. Leave empty for Vault root.",
  setting_resource_dir_name: "Resource Search Directory",
  setting_resource_dir_desc:
    "Directory to search for images and resources (--resource-path). If empty, uses the input file's directory.",
  setting_delete_intermediate_name: "Delete Intermediate Files",
  setting_delete_intermediate_desc: "Delete .tex or .temp.md files after successful conversion.",

  heading_latex_engine: "LaTeX / PDF Engine Settings",
  setting_latex_engine_name: "LaTeX Engine",
  setting_latex_engine_desc:
    "Engine used for PDF generation. TeX engines are auto-discovered when you open this settings tab — pick from the dropdown, or type an engine name (lualatex) or a full path manually. Full paths are normalized to the basename and resolved via PATH, so they survive TeX Live upgrades.",
  setting_latex_engine_custom: "Custom (enter path)",
  setting_latex_engine_not_found_dropdown:
    "(no TeX engine found — enter path below)",
  setting_latex_engine_placeholder: "lualatex, latexmk, or full path",
  setting_pdf_engine_opts_name: "PDF Engine Extra Options",
  setting_pdf_engine_opts_desc:
    "Extra options passed to the PDF engine via --pdf-engine-opt (space-separated). Use for a latexmk sub-engine (e.g. -lualatex) and latexmk-specific options (e.g. -interaction=nonstopmode). Enables bibtex/biber round-trips for references. Effective for PDF output only.",
  setting_document_class_name: "Document Class",
  setting_document_class_desc: "LaTeX document class (e.g. ltjarticle, article, book).",
  setting_document_class_opts_name: "Document Class Options",
  setting_document_class_opts_desc: "Options for document class (e.g. a4paper, twocolumn).",
  setting_font_size_name: "Font Size",
  setting_font_size_desc: "Base font size (e.g. 11pt, 12pt).",
  setting_use_margin_name: "Use Margin Size",
  setting_use_margin_desc: "Enable custom margin settings.",
  setting_margin_size_name: "Margin Size",
  setting_margin_size_desc: "Geometry margin (e.g. 25mm, 1in).",
  setting_page_numbers_name: "Page Numbers",
  setting_page_numbers_desc: "Enable page numbering.",
  setting_image_scale_name: "Image Scale",
  setting_image_scale_desc: "Default image scaling (e.g. width=0.8\\textwidth).",

  setting_template_mode_name: "Document Template Mode",
  setting_template_mode_desc:
    "Choose how the document frame is built. 'Built-in' injects the GUI settings as Pandoc variables; 'Defaults file' delegates the frame (document class, font size, preamble, etc.) to a Pandoc defaults file (-d).",
  option_template_builtin: "Built-in (GUI settings)",
  option_template_defaults: "Defaults file (advanced)",
  setting_defaults_file_path_name: "Defaults File Path",
  setting_defaults_file_path_desc:
    "Path to the Pandoc defaults YAML file passed with -d. Required when the mode is 'Defaults file'. Use ${.} inside the file to reference its own directory, so a template bundle can live in one folder.",
  placeholder_defaults_file_path: "/path/to/defaults.yaml",

  setting_defaults_selection_name: "Defaults File Source",
  setting_defaults_selection_desc:
    "Choose from template packs in the template folder, or specify a path directly. To add a new template, place a folder containing defaults.yaml in the template folder and click 'Rescan'.",
  option_defaults_selection_pack: "Select from template packs",
  option_defaults_selection_custom: "Specify path directly",
  setting_template_pack_name: "Template Pack",
  setting_template_pack_desc:
    "Choose from folders with defaults.yaml found in the template folder. After adding a folder, click 'Rescan' to refresh.",
  setting_template_pack_empty: "(No template packs found. Place a folder containing defaults.yaml in the template folder)",
  setting_template_folder_name: "Template Folder",
  setting_template_folder_desc:
    "Vault folder that stores template packs. Default is 'MdTex Templates'. Place each template pack (a folder with defaults.yaml) directly under it. Synced via Obsidian Sync / Git and preserved across plugin updates.",
  button_rescan_packs: "Rescan",
  notice_packs_rescanned: "Found {0} template packs",
  notice_packs_empty: "No template packs found. Check the template folder",
  notice_sample_packs_installed: "Installed sample templates: {0}",
  button_install_samples: "Reinstall samples",

  heading_preamble: "LaTeX Preamble",
  preamble_desc:
    "Enter pure LaTeX code only. YAML delimiters (---) and 'header-includes:' are injected automatically. This field supports full-width editing.",
  placeholder_preamble: "\\usepackage{...}",
  button_open_fullscreen: "Open Fullscreen",
  button_reset_preamble: "Reset Preamble to Default",
  confirm_reset_preamble:
    "Are you sure you want to reset the LaTeX Preamble to the default template? This will overwrite your current changes.",
  notice_preamble_reset: "LaTeX Preamble reset to default.",
  button_copy: "Copy",
  notice_preamble_copied: "Preamble copied to clipboard.",

  heading_localization: "Localization (Labels & Prefixes)",
  heading_localization_desc:
    "Set the labels used for captions and cross-references. You can override these per document via frontmatter keys (figureTitle / figPrefix / tableTitle / tblPrefix / listingTitle / lstPrefix / eqnPrefix), which take precedence over the profile settings.",
  placeholder_label: "Label",
  placeholder_prefix: "Prefix",
  label_figures: "Figures (Label / Prefix)",
  label_tables: "Tables (Label / Prefix)",
  label_listings: "Listings (Label / Prefix)",
  label_equations: "Equations (Label / Prefix)",

  heading_extensions: "Extensions & Filters",
  setting_use_crossref_name: "Use Pandoc Crossref",
  setting_use_crossref_desc: "Enable pandoc-crossref filter.",
  setting_crossref_path_name: "Pandoc Crossref Path",
  setting_crossref_path_desc: "Path to pandoc-crossref executable.",
  setting_enable_advtex_name: "Enable Advanced LaTeX Commands",
  setting_enable_advtex_desc: "Convert LaTeX commands (e.g. \\textbf, \\footnote) in DOCX output via AST.",
  setting_pandoc_extra_args_name: "Pandoc Extra Arguments",
  setting_pandoc_extra_args_desc: "Any other arguments to pass to pandoc.",
  placeholder_pandoc_extra_args: "--toc --number-sections",
  setting_use_standalone_name: "Use Standalone",
  setting_use_standalone_desc: "Pass --standalone flag (produces full document with header).",
  setting_citation_mode_name: "Citation Mode",
  setting_citation_mode_desc:
    "Convert @key / [@key] into LaTeX citation commands. natbib cooperates with natbib built into academic class files (acl.sty, acmart, etc.); it requires a template pack that resolves the bibliography-style conflict (ADR-009). Shown only in defaults file mode.",
  option_citation_none: "None",
  option_citation_natbib: "natbib (--natbib)",
  option_citation_citeproc: "citeproc (--citeproc)",

  heading_global: "Global Settings",
  setting_enable_lint_fix_name: "Enable Markdownlint Fix",
  setting_enable_lint_fix_desc: "Run 'markdownlint-cli2 --fix' before conversion.",
  setting_markdownlint_path_name: "Markdownlint-cli2 Path",
  setting_markdownlint_path_desc: "Path to markdownlint-cli2 executable.",
  setting_suppress_logs_name: "Suppress Developer Logs",
  setting_suppress_logs_desc: "Hide detailed logs in the developer console.",
  setting_enable_mermaid_name: "Enable Experimental Mermaid",
  setting_enable_mermaid_desc: "Render mermaid blocks via DOM-to-PNG (experimental; may be slow).",

  modal_preamble_title: "Edit LaTeX Preamble",
  modal_note: "Enter pure LaTeX only. YAML will be injected automatically.",
  modal_cancel: "Cancel",
  modal_save: "Save",
} as const;

export type TranslationKeys = keyof typeof en;

export default en;
