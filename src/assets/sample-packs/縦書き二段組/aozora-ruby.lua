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

-- UTF-8 文字列を1字（コードポイント）ごとの配列に分ける。
local function utf8_chars(s)
  local out = {}
  local i = 1
  while i <= #s do
    local b = s:byte(i)
    local n = 1
    if b >= 0xF0 then n = 4
    elseif b >= 0xE0 then n = 3
    elseif b >= 0xC0 then n = 2 end
    out[#out + 1] = s:sub(i, i + n - 1)
    i = i + n
  end
  return out
end

-- 1行の文字列を「1字 \\ 1字 \\ ...」に変換する。
-- 旧版の縦中央タイトル用に残しているが、現在の \novelchapter / \noveltitle は
-- 参照デザインに合わせた横組エディトリアル配置なので、通常は escape_latex を使う。
local function to_vert(s)
  local parts = {}
  for _, ch in ipairs(utf8_chars(s)) do
    parts[#parts + 1] = escape_latex(ch)
  end
  return table.concat(parts, '\\\\')
end

local function escaped_block_at(blocks, n)
  return escape_latex(blocks[n] and stringify_block(blocks[n]) or '')
end

local function list_lines(block)
  if not block or block.t ~= 'BulletList' then return '' end
  local lines = {}
  for _, item in ipairs(block.content) do
    lines[#lines + 1] = escape_latex(stringify_blocks(item))
  end
  return table.concat(lines, '\\\\')
end

local function tex_arg(s)
  return '{' .. (s or '') .. '}'
end

function Div(el)
  if el.classes:includes('novel-title') then
    -- すべての表示文字列は Markdown 側で定義する。
    -- 1: タイトル / 2: サブタイトル / 3: 左上ラベル / 4: 大きな番号
    -- 5: 上部キャプション / 6: 下部キャプション
    local title = escaped_block_at(el.content, 1)
    local subtitle = escaped_block_at(el.content, 2)
    local part_label = escaped_block_at(el.content, 3)
    local big_number = escaped_block_at(el.content, 4)
    local top_caption = escaped_block_at(el.content, 5)
    local footer_caption = escaped_block_at(el.content, 6)
    return pandoc.RawBlock('latex', '\\noveltitle'
      .. tex_arg(title)
      .. tex_arg(subtitle)
      .. tex_arg(part_label)
      .. tex_arg(big_number)
      .. tex_arg(top_caption)
      .. tex_arg(footer_caption))
  end

  if el.classes:includes('novel-chapter') then
    -- すべての表示文字列は Markdown 側で定義する。
    -- 1: 章題 / 2: リード見出し / 3: 説明文 / 4: 箇条書き / 5: 左上ラベル
    -- 6: 上部キャプション / 7: 右上番号 / 8: 右端回転キャプション
    local title = escaped_block_at(el.content, 1)
    local subtitle = escaped_block_at(el.content, 2)
    local lead = escaped_block_at(el.content, 3)
    local items = list_lines(el.content[4])
    local part_label = escaped_block_at(el.content, 5)
    local top_caption = escaped_block_at(el.content, 6)
    local top_right = escaped_block_at(el.content, 7)
    local side_caption = escaped_block_at(el.content, 8)
    return pandoc.RawBlock('latex', '\\novelchapter'
      .. tex_arg(title)
      .. tex_arg(subtitle)
      .. tex_arg(lead)
      .. tex_arg(items)
      .. tex_arg(part_label)
      .. tex_arg(top_caption)
      .. tex_arg(top_right)
      .. tex_arg(side_caption))
  end

  return nil
end
