-- tex-to-docx.lua
-- Pandoc Lua filter to convert various TeX commands into DOCX-compatible elements.
-- This version handles all specified commands, including both block and inline page breaks.

--------------------------------------------------------------------------------
-- ヘルパー関数 (Helper Functions)
--------------------------------------------------------------------------------
-- 対象要素がTeX/LaTeXフォーマットか判定します。
local function is_tex(el)
  return el.format == "tex" or el.format == "latex"
end



--------------------------------------------------------------------------------
-- フィルター関数 (Filter Functions)
--------------------------------------------------------------------------------
-- 1. Div: Fenced Div (`:::`) のクラスをカスタムスタイルに変換します。
function Div(div)
  if div.classes:includes("center") then
    div.attributes["custom-style"] = "Center"
    return div
  elseif div.classes:includes("right") then
    div.attributes["custom-style"] = "Right"
    return div
  end
end

-- 2. RawBlock: ブロックレベルのTeXコマンドを処理します。
function RawBlock(el)
  if not is_tex(el) then return nil end
  local text = el.text



  -- \centerline{...}
  local center_text = text:match("\\centerline%s*%{(.*)%}")
  if center_text then
    return pandoc.Div({ pandoc.Para(pandoc.Str(center_text)) },
                     { ["custom-style"] = "Center" })
  end

  -- \rightline{...}
  local right_text = text:match("\\rightline%s*%{(.*)%}")
  if right_text then
    return pandoc.Div({ pandoc.Para(pandoc.Str(right_text)) },
                     { ["custom-style"] = "Right" })
  end
  
  -- \vspace{...}
  if text:match("^%s*\\vspace") then
    return pandoc.Para({})
  end
end

-- 3. RawInline: インラインのTeXコマンドを処理します。
function RawInline(el)
  if not is_tex(el) then return nil end
  local text = el.text


  
  -- \ruby{漢字}{ふりがな}
  local k, f = text:match("\\ruby%s*%{([^}]+)%}%s*%{([^}]+)%}")
  if k and f then
    if pandoc.Ruby then -- for Pandoc 2.12+
      return pandoc.Ruby({pandoc.Str(k)}, {pandoc.Str(f)})
    else -- Fallback
      return pandoc.Span({pandoc.Str(k)}, pandoc.Attr("", {}, {ruby = f}))
    end
  end

  -- \kenten{...}
  local kt = text:match("\\kenten%s*%{([^}]+)%}")
  if kt then
    return pandoc.Span({pandoc.Str(kt)}, { ["custom-style"] = "Kenten" })
  end

  -- \noindent
  if text:match("^\\noindent$") then
    return pandoc.Str("")
  end
end

-- すべてのフィルターをPandocに登録して返します。
return {
  Div = Div,
  RawBlock = RawBlock,
  RawInline = RawInline,
}