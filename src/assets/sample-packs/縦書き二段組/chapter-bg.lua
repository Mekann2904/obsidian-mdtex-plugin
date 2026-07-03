-- chapter-bg.lua
-- 章扉・表題の装飾背景画像（chapter-bg-image メタデータ）を堅牢に \includegraphics に渡す。
--
-- 【なぜこのフィルタが必要か】
-- テンプレートが出力する \includegraphics{chapter-bg.png} は LaTeX の検索パス
-- （TEXINPUTS / 作業ディレクトリ）で解決される。MdTex プラグイン経由では pandoc の
-- 作業ディレクトリが「元の .md のある場所」になるため、パックフォルダに置いた画像が
-- 見つからず、luatex.def がドラフトモードでファイル名をテキスト描画してしまう。
--
-- 【なぜ絶対パスを直接メタデータに渡さないか（v2 の改良点）】
-- 長い絶対パスをメタデータ経由で \includegraphics{...} に埋め込むと、pandoc の
-- 行折り返し（既定72桁）でパスの途中に改行が入り、スペースが改行に置換されて
-- lualatex が画像を見失う（wrap: none で回避できるが、環境依存の脆さが残る）。
--
-- 【本フィルタの方式（wrap 設定に依存しない堅牢化）】
--   1. 画像を実ファイルとして探索し、絶対パスを得る
--   2. その絶対パスを埋め込んだ \renewcommand{\chapterbg}{...} をテンプレートファイル
--      （/tmp/mdtex-chapterbg-include.tex）に書き出す
--   3. メタデータ chapter-bg-image には「そのテンポラリファイルの短いパス」をセットする
--   4. テンプレートは \input{$chapter-bg-image$} で読み込む
-- 長い絶対パスはテンポラリファイル内にしか存在せず、pandoc の行折り返し対象に
-- ならない。\input{/tmp/...} は十分に短く折り返されない。これで wrap 設定・作業
-- ディレクトリ・TEXINPUTS のいずれにも依存せず安定する。
--
-- 注意: chapter-bg-image は defaults.yaml の *metadata:* に書くこと
-- （Lua フィルタが読めるのは metadata のみ）。

-- テンポラリファイル（\renewcommand を書き出す先）。固定名で毎回上書き。
local INCLUDE_TEX = '/tmp/mdtex-chapterbg-include.tex'
-- 診断ログ。実環境の状況を取り出すため常に書く（トラブル収束後にverbose化予定）。
local DIAG_LOG = '/tmp/mdtex-chapterbg-diag.log'

-- パスを絶対パスにする。既に絶対ならそのまま、相対なら作業ディレクトリを結合する。
local function absolutize(p)
  if p:sub(1, 1) == '/' then return p end
  if p:sub(2, 2) == ':' then return p end -- Windows ドライブレター
  local cwd = (pandoc.system and pandoc.system.get_working_directory)
    and pandoc.system.get_working_directory() or ''
  if cwd == '' then return p end
  if cwd:sub(-1) == '/' then return cwd .. p end
  return cwd .. '/' .. p
end

-- 画像を探索する候補ディレクトリを集める（優先度順）。
local function candidate_dirs()
  local dirs = {}
  local ti = os.getenv('TEXINPUTS') or ''
  for d in (ti .. ':'):gmatch('([^:]*):') do
    if d ~= '' then dirs[#dirs + 1] = d end
  end
  if PANDOC_STATE and PANDOC_STATE.resource_path then
    for _, d in ipairs(PANDOC_STATE.resource_path) do
      if d and d ~= '' then dirs[#dirs + 1] = d end
    end
  end
  dirs[#dirs + 1] = '.'
  return dirs
end

-- 診断ログを書く。
local function write_diag(fields)
  local f = io.open(DIAG_LOG, 'w')
  if not f then return end
  for _, line in ipairs(fields) do f:write(line .. '\n') end
  f:close()
end

function Pandoc(doc)
  local diag = {}
  diag[#diag + 1] = '=== chapter-bg.lua diagnostic ==='
  diag[#diag + 1] = 'pandoc_version=' .. tostring(PANDOC_VERSION)
  diag[#diag + 1] = 'verbosity=' .. tostring(PANDOC_STATE and PANDOC_STATE.verbosity)
  diag[#diag + 1] = 'wrap(writer_options)=' .. tostring(PANDOC_WRITER_OPTIONS and PANDOC_WRITER_OPTIONS.wrap)
  diag[#diag + 1] = 'cwd=' .. ((pandoc.system and pandoc.system.get_working_directory) and pandoc.system.get_working_directory() or '?')
  diag[#diag + 1] = 'TEXINPUTS=' .. (os.getenv('TEXINPUTS') or '(unset)')

  local name = pandoc.utils.stringify(doc.meta['chapter-bg-image'] or '')
  diag[#diag + 1] = 'incoming chapter-bg-image=' .. name
  if name == '' then
    diag[#diag + 1] = 'result=not-set (no image metadata); TikZ default'
    write_diag(diag)
    return doc
  end

  local resolved = nil
  local tried = {}
  for _, d in ipairs(candidate_dirs()) do
    local candidate = d .. '/' .. name
    local f = io.open(candidate, 'r')
    table.insert(tried, candidate .. (f and ' [FOUND]' or ''))
    if f then
      f:close()
      resolved = absolutize(candidate)
      break
    end
  end
  diag[#diag + 1] = 'candidates_tried:\n  ' .. table.concat(tried, '\n  ')

  if not resolved then
    io.stderr:write('[chapter-bg] WARNING: image "' .. name .. '" not found in search path; '
      .. 'falling back to default TikZ decoration.\n')
    diag[#diag + 1] = 'result=NOT FOUND; fallback TikZ'
    doc.meta['chapter-bg-image'] = nil
    write_diag(diag)
    return doc
  end

  -- 絶対パスを埋め込んだ \renewcommand をテンポラリファイルに書き出す。
  -- ここにだけ長いパスが存在し、pandoc の行折り返し対象にならない。
  local out = io.open(INCLUDE_TEX, 'w')
  if not out then
    io.stderr:write('[chapter-bg] WARNING: cannot write ' .. INCLUDE_TEX .. '; fallback TikZ\n')
    diag[#diag + 1] = 'result=cannot write temp ' .. INCLUDE_TEX
    doc.meta['chapter-bg-image'] = nil
    write_diag(diag)
    return doc
  end
  out:write('\\renewcommand{\\chapterbg}{%\n')
  out:write('  \\includegraphics[width=\\paperwidth,height=\\paperheight]{' .. resolved .. '}%\n')
  out:write('}\n')
  out:close()

  -- メタデータには短いテンポラリファイルのパスをセット（折り返されない長さ）。
  doc.meta['chapter-bg-image'] = INCLUDE_TEX
  diag[#diag + 1] = 'resolved_abspath=' .. resolved
  diag[#diag + 1] = 'temp_include_file=' .. INCLUDE_TEX
  diag[#diag + 1] = 'result=OK (image written to temp, \\input used)'
  write_diag(diag)
  return doc
end
