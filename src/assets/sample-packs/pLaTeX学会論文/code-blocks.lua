-- code-blocks.lua
-- Pandoc 3.8+ は --listings + キャプション付きコードブロックで codelisting 浮動体 +
-- lstlisting[caption=...] の両方を出し、キャプションが2重になる（"Listing 1" が2回）。
-- また codelisting 浮動体は twocolumn の狭い段内に配置されるとキャプション幅が潰れ、
-- 縦1文字ずつに折れる。本フィルタはキャプション/ID付き CodeBlock を RawBlock に変換し、
-- codelisting を使わず captionof + lstlisting で出力する。
--   * 2重キャプション解消（codelisting を使わない + lstlisting に caption を付けない）
--   * 縦割れ解消（浮動体でなく本文中に配置、段内幅いっぱいにキャプションが広がる）
--   * pandoc-crossref の [@lst:id] 参照は \label + \ref で解決（captionof も番号を振る）
-- キャプション/ID なしの plain コードブロックは nil を返して Pandoc に任せる（単独 lstlisting）。

-- LaTeX キャプション内のエスケープ。コードの caption は Markdown 由来だが、Pandoc が
-- トークン分割済みの文字列を attributes.caption に入れる。最小限のエスケープ。
local function esc_caption(s)
  s = s:gsub("\\", "\\textbackslash{}")
  s = s:gsub("([%%#$&_{}])", "\\%1")
  s = s:gsub("%^", "\\textasciicircum{}")
  s = s:gsub("~", "\\textasciitilde{}")
  return s
end

function CodeBlock(el)
  local caption = el.attributes and el.attributes.caption
  local id = el.identifier and el.identifier ~= "" and el.identifier or nil
  local lang = el.classes and el.classes[1]

  -- キャプションも ID もなければ Pandoc に任せる（単独 lstlisting、codelisting なし）。
  if not caption and not id then
    return nil
  end

  -- 言語の正規化: listings は先頭大文字を期待（python → Python, c++ → C++）。
  local lang_opt = ""
  if lang and lang ~= "" then
    lang_opt = "language=" .. lang:gsub("^%l", string.upper)
  end

  local parts = {}
  -- captionof は浮動体を使わず「現在位置」に番号付きキャプションを出す（caption パッケージ）。
  -- lstlisting 型のカウンタを進めるため、参照番号が lst.1, lst.2… と連番になる。
  if caption and caption ~= "" then
    table.insert(parts, "\\captionof{lstlisting}{" .. esc_caption(caption) .. "}")
  else
    -- ID のみ（キャプションなし）でも参照用に番号を振る。
    table.insert(parts, "\\captionof{lstlisting}{}")
  end
  if id then
    table.insert(parts, "\\label{" .. id .. "}")
  end
  -- lstlisting には caption オプションを付けない（2重キャプション回避）。
  local open = "\\begin{lstlisting}"
  if lang_opt ~= "" then open = open .. "[" .. lang_opt .. "]" end
  table.insert(parts, open)
  table.insert(parts, el.text or "")
  table.insert(parts, "\\end{lstlisting}")

  return pandoc.RawBlock("latex", table.concat(parts, "\n"))
end
