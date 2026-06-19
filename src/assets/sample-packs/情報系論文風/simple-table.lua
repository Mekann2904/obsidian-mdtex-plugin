-- simple-table.lua
-- Pandoc の Markdown table は LaTeX で longtable になりやすく、twocolumn では失敗する。
-- 情報系論文風サンプルでは、単純な表を table + tabular に変換する。

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

  local caption = pandoc.utils.stringify(el.caption or '')
  if caption ~= '' then
    table.insert(lines, '\\caption{' .. esc(caption) .. '}')
  end

  table.insert(lines, '\\end{table}')
  return pandoc.RawBlock('latex', table.concat(lines, '\n'))
end
