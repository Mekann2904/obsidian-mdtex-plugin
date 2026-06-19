-- aozora-ruby.lua
-- 青空文庫風の簡易ルビ記法を LaTeX の luatexja-ruby コマンドへ変換する。
--
-- 対応記法:
--   ｜親文字《よみ》 -> \ruby{親文字}{よみ}
--
-- Markdown 本文を LaTeX コマンドだらけにしないためのサンプル用フィルタ。

local function escape_latex(s)
  s = s:gsub('\\', '\\textbackslash{}')
  s = s:gsub('([%%#$&_{}])', '\\%1')
  s = s:gsub('%^', '\\textasciicircum{}')
  s = s:gsub('~', '\\textasciitilde{}')
  return s
end

local function convert_text(text)
  local out = {}
  local pos = 1

  while pos <= #text do
    local marker = text:find('｜', pos, true)
    if not marker then
      table.insert(out, pandoc.Str(text:sub(pos)))
      break
    end

    local open = text:find('《', marker + #'｜', true)
    local close = open and text:find('》', open + #'《', true) or nil
    if not open or not close then
      table.insert(out, pandoc.Str(text:sub(pos)))
      break
    end

    if marker > pos then
      table.insert(out, pandoc.Str(text:sub(pos, marker - 1)))
    end

    local base = text:sub(marker + #'｜', open - 1)
    local ruby = text:sub(open + #'《', close - 1)
    table.insert(out, pandoc.RawInline('latex', '\\ruby{' .. escape_latex(base) .. '}{' .. escape_latex(ruby) .. '}'))
    pos = close + #'》'
  end

  return out
end

function Str(el)
  local text = el.text
  if not text:find('｜', 1, true) then
    return nil
  end
  return convert_text(text)
end

local function stringify_blocks(blocks)
  local doc = pandoc.Pandoc(blocks)
  return pandoc.utils.stringify(doc)
end

local function stringify_block(block)
  return pandoc.utils.stringify(pandoc.Pandoc({ block }))
end

function Div(el)
  if el.classes:includes('novel-title') then
    local title = escape_latex(el.content[1] and stringify_block(el.content[1]) or '')
    local subtitle = escape_latex(el.content[2] and stringify_block(el.content[2]) or '')
    return pandoc.RawBlock('latex', '\\noveltitle[' .. subtitle .. ']{' .. title .. '}')
  end

  if el.classes:includes('novel-chapter') then
    local title = escape_latex(stringify_blocks(el.content))
    return pandoc.RawBlock('latex', '\\novelchapter{' .. title .. '}')
  end

  return nil
end
