// File: src/assets/docxTexFilter.ts
// Purpose: DOCX 変換専用の Pandoc Lua フィルタ（AST ベース）を文字列定数として保持する。
// Reason: 従来 docx 変換時に使っていた LaTeX→Markdown 正規表現逆変換は波括弧のネスト・
//   `\{` エスケープ・複数行に対応できず、ネストした LaTeX（例: `\footnote{\textbf{重要}}`）
//   を破壊していた。正規表現経路を完全に廃止し、Pandoc の AST を直接処理する Lua フィルタへ
//   一本化するため、フィルタ本体を配布物（main.js）に埋め込んで loose ファイル依存をなくす。
// Related: src/services/convertService.ts, src/services/pandocCommandBuilder.ts,
//   src/assets/callout-filter.ts, tex-to-docx.lua（廃止）

// 実行時に一時ファイルへ書き出して `--lua-filter` で渡す。
// TS のテンプレートリテラル内では `\` は `\\` にエスケープする必要がある点に注意
// （Lua 側の `\\textbf` を表現するには TS では `\\\\textbf` と書く）。
export const DOCX_TEX_LUA_FILTER = `
-- docx-tex-filter.lua
-- DOCX 出力時に raw TeX（RawInline/RawBlock）を Pandoc AST へ変換するフィルタ。
-- 正規表現による文字列破壊を避けるため、全て AST ベースで処理する。

local function is_tex(el)
  return el.format == "tex" or el.format == "latex"
end

-- XML の特殊文字をエスケープする。
local function escape_xml(s)
  s = s:gsub("&", "&amp;")
  s = s:gsub("<", "&lt;")
  s = s:gsub(">", "&gt;")
  s = s:gsub('"', "&quot;")
  return s
end

-- 文字列を空白で分割し、単語間に pandoc.Space を挟んだ inline リストへ変換する。
-- 先頭/末尾の空白も Space として保持する（連続 Space は docx writer 側で整理される）。
local function text_to_inlines(text)
  local inlines = {}
  if text == "" then return inlines end
  local has_leading = text:sub(1, 1):match("%s") ~= nil
  local has_trailing = text:sub(#text, #text):match("%s") ~= nil
  if has_leading then inlines[#inlines + 1] = pandoc.Space() end
  local started = false
  for word in text:gmatch("%S+") do
    if started then inlines[#inlines + 1] = pandoc.Space() end
    inlines[#inlines + 1] = pandoc.Str(word)
    started = true
  end
  if not started then inlines[#inlines + 1] = pandoc.Space() end
  if has_trailing then inlines[#inlines + 1] = pandoc.Space() end
  return inlines
end

-- インラインの TeX 文字列を再帰的にパースし Pandoc inline リストへ変換する。
-- 波括弧のネストは Lua の %b{}（釣り合い括弧）で正確に扱う。
local parse_tex_inlines

-- 引数グループ {...} を pos（開き括弧位置）から取り出す。
-- 戻り値: 内容文字列, 次の位置。括弧が無ければ nil。
local function read_group(s, pos)
  local rest = s:sub(pos)
  local matched = rest:match("^%b{}")
  if not matched then return nil, pos end
  local content = matched:sub(2, #matched - 1)
  return content, pos + #matched
end

-- 位置 pos から空白を読み飛ばす。
local function skip_spaces(s, pos)
  local n = #s
  while pos <= n and s:sub(pos, pos):match("%s") do pos = pos + 1 end
  return pos
end

-- \\textcolor{color}{content} を色付き openxml run で表現する。
-- inner が持つ内部装飾（太字など）は失われるが、文字列破壊は起きない。
local function make_color_inline(inlines, color)
  local text = pandoc.utils.stringify(inlines)
  local openxml = '<w:r><w:rPr><w:color w:val="' .. escape_xml(color) .. '"/></w:rPr>'
    .. '<w:t xml:space="preserve">' .. escape_xml(text) .. '</w:t></w:r>'
  return pandoc.RawInline("openxml", openxml)
end

parse_tex_inlines = function(s)
  local inlines = {}
  local text_buf = {}
  local i = 1
  local n = #s

  local function flush_text()
    if #text_buf == 0 then return end
    local text = table.concat(text_buf)
    text_buf = {}
    for _, il in ipairs(text_to_inlines(text)) do
      inlines[#inlines + 1] = il
    end
  end

  while i <= n do
    local ch = s:sub(i, i)
    if ch == "\\\\" then
      -- コマンド名（英字連続）を取り出す
      local name = s:match("^\\\\([%a]+)", i)
      if name then
        local after_name = i + 1 + #name
        local j = skip_spaces(s, after_name)

        if name == "textbf" or name == "textit" or name == "emph"
            or name == "underline" or name == "texttt" then
          local content, next_pos = read_group(s, j)
          if content then
            flush_text()
            local inner = parse_tex_inlines(content)
            local node
            if name == "textbf" then node = pandoc.Strong(inner)
            elseif name == "textit" or name == "emph" then node = pandoc.Emph(inner)
            elseif name == "underline" then node = pandoc.Underline(inner)
            elseif name == "texttt" then node = pandoc.Code(content) end
            if node then inlines[#inlines + 1] = node end
            i = next_pos
          else
            flush_text()
            inlines[#inlines + 1] = pandoc.RawInline("tex", "\\\\" .. name)
            i = after_name
          end

        elseif name == "textcolor" then
          local color, p1 = read_group(s, j)
          if color then
            local k = skip_spaces(s, p1)
            local content, p2 = read_group(s, k)
            if content then
              flush_text()
              inlines[#inlines + 1] = make_color_inline(parse_tex_inlines(content), color)
              i = p2
            else
              flush_text()
              i = p1
            end
          else
            flush_text()
            inlines[#inlines + 1] = pandoc.RawInline("tex", "\\\\textcolor")
            i = after_name
          end

        elseif name == "footnote" then
          local content, next_pos = read_group(s, j)
          if content then
            flush_text()
            local inner = parse_tex_inlines(content)
            inlines[#inlines + 1] = pandoc.Note({ pandoc.Para(inner) })
            i = next_pos
          else
            flush_text()
            inlines[#inlines + 1] = pandoc.RawInline("tex", "\\\\footnote")
            i = after_name
          end

        elseif name == "ruby" then
          local kanji, p1 = read_group(s, j)
          if kanji then
            local k2 = skip_spaces(s, p1)
            local furi, p2 = read_group(s, k2)
            if furi then
              flush_text()
              if pandoc.Ruby then
                inlines[#inlines + 1] = pandoc.Ruby({ pandoc.Str(kanji) }, { pandoc.Str(furi) })
              else
                inlines[#inlines + 1] = pandoc.Span(
                  { pandoc.Str(kanji) }, pandoc.Attr("", {}, { ruby = furi }))
              end
              i = p2
            else
              flush_text()
              inlines[#inlines + 1] = pandoc.RawInline("tex", "\\\\ruby")
              i = p1
            end
          else
            flush_text()
            inlines[#inlines + 1] = pandoc.RawInline("tex", "\\\\ruby")
            i = after_name
          end

        elseif name == "kenten" then
          local content, next_pos = read_group(s, j)
          if content then
            flush_text()
            inlines[#inlines + 1] = pandoc.Span(
              { pandoc.Str(content) }, { ["custom-style"] = "Kenten" })
            i = next_pos
          else
            flush_text()
            inlines[#inlines + 1] = pandoc.RawInline("tex", "\\\\kenten")
            i = after_name
          end

        else
          -- 未対応コマンド: 生 TeX としてそのまま残す（AST を壊さない）
          flush_text()
          inlines[#inlines + 1] = pandoc.RawInline("tex", "\\\\" .. name)
          i = after_name
        end
      else
        -- \\ の直後に英字以外（\\{ \\} \\% などのエスケープ）
        local esc = s:match("^\\\\(.)", i)
        if esc then
          text_buf[#text_buf + 1] = esc
          i = i + 2
        else
          text_buf[#text_buf + 1] = "\\\\"
          i = i + 1
        end
      end
    else
      text_buf[#text_buf + 1] = ch
      i = i + 1
    end
  end
  flush_text()
  return inlines
end

-- DOCX ページ区切り（openxml）。
local function docx_page_break()
  return pandoc.RawBlock("openxml",
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
end

function Div(div)
  if div.classes:includes("center") then
    div.attributes["custom-style"] = "Center"
    return div
  elseif div.classes:includes("right") then
    div.attributes["custom-style"] = "Right"
    return div
  end
end

function RawBlock(el)
  if not is_tex(el) then return nil end
  local text = el.text
  local stripped = text:gsub("%s", "")

  if stripped == "\\\\newpage" or stripped == "\\\\clearpage" then
    return docx_page_break()
  end

  local center_text = text:match("\\\\centerline%s*%b{}")
  if center_text then
    local inner = center_text:match("%{(.*)%}")
    return pandoc.Div({ pandoc.Para({ pandoc.Str(inner or "") }) },
      { ["custom-style"] = "Center" })
  end

  local right_text = text:match("\\\\rightline%s*%b{}")
  if right_text then
    local inner = right_text:match("%{(.*)%}")
    return pandoc.Div({ pandoc.Para({ pandoc.Str(inner or "") }) },
      { ["custom-style"] = "Right" })
  end

  if text:match("^%s*\\\\vspace") then
    return pandoc.Para({})
  end

  return nil
end

function RawInline(el)
  if not is_tex(el) then return nil end
  local parsed = parse_tex_inlines(el.text)
  if #parsed > 0 then return parsed end
  return nil
end

return {
  Div = Div,
  RawBlock = RawBlock,
  RawInline = RawInline,
}
`;
