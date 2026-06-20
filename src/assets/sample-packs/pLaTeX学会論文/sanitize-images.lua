-- sanitize-images.lua
-- pLaTeX + dvipdfmx 経路で画像ファイル名にスペース・特殊文字が含まれると、graphicx が
-- 起動する extractbb がシェル経由でファイル名をトークン分割し、.xbb(BoundingBox)生成に
-- 失敗する（! LaTeX Error: Cannot determine size of graphic in ... (no BoundingBox)）。
-- lualatex 経路は画像サイズを自前で読むためこの問題は起きないが、ipsj.cls は pLaTeX 専用。
--
-- 本フィルタは各 Image の src をスペース/特殊文字を含まない安全な名前に書き換え、
-- 元画像をその安全な名前へコピーする。pandoc が安全な名前の画像を temp ビルドdirへ
-- コピーするため、extractbb の auto-run が正常に動作する。
--
-- 【画像の発見】MdTex は画像 src を vault ルート相対（例: "Pasted image.png"）に変換し、
-- --resource-path に vault ルートを渡す。一方 pandoc の CWD はノートのディレクトリ
-- （サブフォルダの場合あり）。よって io.open(src) を CWD で行うと、vault ルートにある
-- 画像を見つけられない。本フィルタは CWD およびその親ディレクトリ（最大6階層）を順に
-- 探し、pandoc と同じく画像を発見する。

local function url_decode(s)
  return (s:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end

-- ファイル名として安全な文字種以外を _ に置換。拡張子は保持。
local function sanitize_name(base)
  local ext = base:match("(%.[^%.%/\\]+)$") or ""
  local stem = ext ~= "" and base:sub(1, #base - #ext) or base
  local safe = stem:gsub("[^%w%-]", "_")
  if safe == "" then safe = "img" end
  return "_mdtex_" .. safe .. ext
end

-- 一時キャッシュディレクトリ（vault 汚染回避）。環境変数 TMPDIR 既定。
local cache_dir = (os.getenv("TMPDIR") or "/tmp") .. "mdtex-imgcache"
os.execute('mkdir -p "' .. cache_dir:gsub('"', "") .. '"')

-- CWD とその親ディレクトリ（最大6階層）で src を探し、最初に見つかったパスを返す。
-- vault 構造ではノートがサブフォルダにあり、画像が vault ルートにある場合、親を上がれば
-- 画像に到達できる（pandoc の --resource-path=vaultRoot と同等の探索）。
local function find_image(src)
  -- 1. src そのまま（CWD 相対）。絶対パスの場合もここで解決する。
  local f = io.open(src, "rb")
  if f then f:close() return src end

  -- 2. basename を CWD の親で順に（src にディレクトリ要素があっても相対で辿る）
  for depth = 1, 6 do
    local prefix = string.rep("../", depth)
    local candidate = prefix .. src
    local g = io.open(candidate, "rb")
    if g then g:close() return candidate end
  end
  return nil
end

-- 重複コピーを避けるため、処理済み src をキャッシュ。
local done = {}

function Image(el)
  local raw = el.src or ""
  if raw == "" then return nil end
  local decoded = url_decode(raw)

  -- 安全な名前（英数字・_-/.\/:\ 以外を含まない）なら何もしない。
  if not decoded:find("[^%w%-%_%.%/\\:]") then
    return nil
  end

  if done[decoded] then
    el.src = done[decoded]
    return el
  end

  -- 元画像を発見（CWD + 親ディレクトリ探索）。
  local found = find_image(decoded)
  if not found then
    -- 見つからなければ触らない（pandoc が "Could not fetch resource" で知らせる）。
    return nil
  end

  local base = found:match("([^/\\]+)$") or found
  local dst = cache_dir .. "/" .. sanitize_name(base)

  -- 安全な名前のコピーを作成（既存なら再利用）。
  local existing = io.open(dst, "rb")
  if not existing then
    local i = io.open(found, "rb")
    local o = io.open(dst, "wb")
    if i and o then
      o:write(i:read("*a"))
    end
    if i then i:close() end
    if o then o:close() end
  else
    existing:close()
  end

  el.src = dst
  done[decoded] = dst
  return el
end
