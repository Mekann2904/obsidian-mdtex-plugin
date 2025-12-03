// File: src/assets/callout-filter.ts
// Purpose: Obsidian形式のコールアウトをPandoc用Luaフィルタでtcolorboxへ変換する。
// Reason: Markdown→LaTeX変換時にASTで処理し、美しいPDF出力を実現するため。
// Related: src/services/convertService.ts, src/MdTexPluginSettings.ts, src/utils/latexPreamble.ts

export const CALLOUT_LUA_FILTER = `
-- callout.lua
-- Obsidianの > [!type] Title 構文を LaTeX の tcolorbox に変換する

local icons = {
  memo = "",
  note = "",
  info = "",
  todo = "",
  tip = "",
  success = "",
  question = "",
  warning = "",
  failure = "",
  danger = "",
  bug = "",
  example = "",
  quote = "",
}

local default_icon = ""

local function extract_callout(para)
  if not para or para.t ~= "Para" or #para.content == 0 then
    return nil
  end

  local first = para.content[1]
  if first.t ~= "Str" then
    return nil
  end

  -- Obsidian形式: [!type] Title （折りたたみ記号 [+]/[-] は無視）
  local type_mark = first.text:match("^%[!([%w%-]+)%][%+%-]?")
  if not type_mark then
    return nil
  end

  local type_lower = type_mark:lower()
  local title_inlines = { table.unpack(para.content, 2) }

  if #title_inlines == 0 then
    table.insert(title_inlines, pandoc.Str(type_mark:gsub("^%l", string.upper)))
  end

  return type_lower, title_inlines
end

function BlockQuote(el)
  local type_lower, title_inlines = extract_callout(el.content[1])
  if not type_lower then
    return nil
  end

  local body_blocks = { table.unpack(el.content, 2) }
  local color_name = "callout-" .. type_lower
  if not icons[type_lower] then
    color_name = "callout-note"
  end

  local icon_code = icons[type_lower] or default_icon

  local title_doc = pandoc.Pandoc({ pandoc.Para(title_inlines) })
  local title_tex = pandoc.write(title_doc, "latex"):gsub("^%s*(.-)%s*$", "%1")

  local result = pandoc.List()
  table.insert(result, pandoc.RawBlock("latex", "\\\\begin{obsidiancallout}{" .. color_name .. "}{" .. icon_code .. "}{" .. title_tex .. "}"))

  for _, block in ipairs(body_blocks) do
    table.insert(result, block)
  end

  table.insert(result, pandoc.RawBlock("latex", "\\\\end{obsidiancallout}"))
  return result
end
`;
