-- simple-table.lua
-- Pandoc の Markdown table は LaTeX で longtable になりやすく、twocolumn では失敗する。
-- 単純な表を table + tabular に変換する。
--
-- pandoc-crossref 連携: pandoc-crossref は `: caption {#tbl:id}` を Table ノードの
-- caption と identifier に分離するが、本フィルタが RawBlock へ変換する際にそれらを
-- 正しく LaTeX に翻訳する必要がある。以下を扱う:
--   * identifier (tbl:id) -> \label{tbl:id}（\caption の直後）
--   * caption 内の残存 {#...} 文字列 -> 除去（crossref 未使用時のフォールバック）

local function esc(s)
  s = s:gsub('\\', '\\textbackslash{}')
  s = s:gsub('([%%#$&_{}])', '\\%1')
  s = s:gsub('%^', '\\textasciicircum{}')
  s = s:gsub('~', '\\textasciitilde{}')
  return s
end

local function cell_text(cell)
  return esc(pandoc.utils.stringify(pandoc.Pandoc(cell.contents or cell.content or {})))
end

local function row_cells(row)
  local out = {}
  for _, cell in ipairs(row.cells) do
    table.insert(out, cell_text(cell))
  end
  return table.concat(out, ' & ') .. ' \\\\'
end

function Table(el)
  local ncols = #el.colspecs
  if ncols == 0 then return nil end

  local lines = {}
  table.insert(lines, '\\begin{table}[H]')
  table.insert(lines, '\\centering')
  table.insert(lines, '\\small')
  table.insert(lines, '\\begin{tabular}{' .. string.rep('l', ncols) .. '}')
  table.insert(lines, '\\toprule')

  if el.head and el.head.rows then
    for _, row in ipairs(el.head.rows) do
      table.insert(lines, row_cells(row))
    end
    table.insert(lines, '\\midrule')
  end

  for _, body in ipairs(el.bodies or {}) do
    for _, row in ipairs(body.body or body.rows or {}) do
      table.insert(lines, row_cells(row))
    end
  end

  table.insert(lines, '\\bottomrule')
  table.insert(lines, '\\end{tabular}')

  -- キャプションとラベルの取り出し。
  -- pandoc-crossref 使用時は identifier に "tbl:id" が入り、caption は純テキスト。
  -- 非使用時は caption 文字列内に "{#tbl:id}" が残るので正規表現で抽出する。
  local raw_caption = pandoc.utils.stringify(el.caption or '')
  local label = el.identifier and el.identifier ~= '' and el.identifier or nil

  if not label then
    -- caption 内の残存 {#...} を抽出して label にし、caption からは除去。
    local m = raw_caption:match('%{#([^}]+)%}')
    if m then
      label = m
      raw_caption = raw_caption:gsub('%s*%{#[^}]+%}%s*', '')
    end
  else
    -- identifier が取れている場合でも、caption に {#...} が残っていれば除去。
    raw_caption = raw_caption:gsub('%s*%{#[^}]+%}%s*', '')
  end

  raw_caption = raw_caption:gsub('^%s+', ''):gsub('%s+$', '')

  if raw_caption ~= '' then
    local cap_line = '\\caption{' .. esc(raw_caption) .. '}'
    if label then cap_line = cap_line .. '\\label{' .. label .. '}' end
    table.insert(lines, cap_line)
  elseif label then
    -- キャプションなしでラベルのみ（相互参照のため）。
    table.insert(lines, '\\caption{}\\label{' .. label .. '}')
  end

  table.insert(lines, '\\end{table}')
  return pandoc.RawBlock('latex', table.concat(lines, '\n'))
end
