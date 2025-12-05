// File: src/utils/mermaidRasterizer.ts
// Purpose: MermaidコードブロックをObsidian内でレンダリングしPNGへ変換する。
// Reason: 依存追加なしでPDF出力時に確実なビットマップ化を行うため。
// Related: src/services/convertService.ts, src/Mermaid-PDF.ts, src/utils/markdownTransforms.ts

import { App, Component, MarkdownRenderer } from "obsidian";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

interface RasterizeOptions {
  app: App;
  sourcePath: string;
  imageScale?: string;
  suppressLogs?: boolean;
}

interface RasterizeResult {
  content: string;
  cleanupDirs: string[];
  used: boolean;
}

/**
 * Markdown内の ```mermaid フェンスをPNG画像へ置き換える。
 * 出力PNGはOSの一時ディレクトリ配下に作成し、呼び出し元がクリーンアップできるようにディレクトリを返す。
 */
export async function rasterizeMermaidBlocks(
  markdown: string,
  options: RasterizeOptions
): Promise<RasterizeResult> {
  if (!options.app || !options.sourcePath) {
    throw new Error("rasterizeMermaidBlocks requires app and sourcePath.");
  }

  // 後続の {#fig:... width=...}[caption] などの属性行をまとめて吸収する（改行・空行・CRLFを許容）。
  // 捕捉: 1: インデント（未使用） 2: フェンス記号 3: Mermaidコード本体 4: 属性ブロック中身 5: キャプション [text]（任意）
  const mermaidRegex =
    /^(\s*)(`{3,}|~{3,})mermaid[ \t]*\r?\n([\s\S]*?)\r?\n\2[ \t]*(?:[\r\n]+\s*)?(?:\{([^}\r\n]+)\}(\[[^\]]*\])?)?/gm;
  if (!mermaidRegex.test(markdown)) {
    return { content: markdown, cleanupDirs: [], used: false };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-mermaid-"));
  const cleanupDirs = [tempDir];
  const replacements: { original: string; replacement: string }[] = [];
  const container = createHiddenContainer();

  try {
    mermaidRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = mermaidRegex.exec(markdown)) !== null) {
      const [fullMatch, _indent, _fence, mermaidCode, attrContent, figCaptionRaw] = match;
      try {
        const svg = await renderMermaidInDom(options.app, mermaidCode, container, options.sourcePath);
        const pngBuffer = await svgToPngBuffer(svg, 2);
        const pngPath = await writePng(tempDir, pngBuffer);
        const attrBlock = buildAttributeBlock(attrContent, options.imageScale);
        const posixPath = pngPath.split(path.sep).join("/");
        const caption = figCaptionRaw ? figCaptionRaw.replace(/^\[|\]$/g, "").trim() : "";
        const replacement = `![${caption}](<${posixPath}>)${attrBlock}`;
        replacements.push({ original: fullMatch, replacement });
      } catch (error) {
        if (!options.suppressLogs) {
          console.error("[MdTex] Mermaid rasterize failed; keeping raw block.", error);
        }
        replacements.push({ original: fullMatch, replacement: fullMatch });
      }
    }
  } finally {
    container.remove();
  }

  let content = markdown;
  for (const item of replacements) {
    content = content.replace(item.original, item.replacement);
  }

  return { content, cleanupDirs, used: true };
}

function createHiddenContainer(): HTMLDivElement {
  const container = document.body.createDiv();
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = "1800px";
  container.style.height = "auto";
  container.style.minHeight = "1000px";
  container.style.pointerEvents = "none";
  return container;
}

async function renderMermaidInDom(
  app: App,
  code: string,
  container: HTMLDivElement,
  sourcePath: string
): Promise<SVGSVGElement> {
  const component = new Component();
  clearContainer(container);

  await MarkdownRenderer.render(app, `\`\`\`mermaid\n${code}\n\`\`\``, container, sourcePath, component);

  const svg = await waitForStableSvg(container, 5000, 100);
  component.unload();

  if (!svg) {
    throw new Error("Mermaid SVG not rendered.");
  }

  return svg;
}

function clearContainer(container: HTMLElement) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

/**
 * SVG が出現し、かつ DOM 変更が一定時間止まるまで待つ。
 */
async function waitForStableSvg(
  root: HTMLElement,
  timeoutMs = 5000,
  stableThresholdMs = 100
): Promise<SVGSVGElement> {
  const start = Date.now();

  // Phase 1: SVG 出現待ち
  let svg: SVGSVGElement | null = null;
  while (!svg) {
    svg = root.querySelector("svg");
    if (svg) break;
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timeout waiting for SVG element to appear.");
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  // Phase 2: DOM 変更が止まるまで待つ
  return new Promise((resolve) => {
    let lastMutation = Date.now();

    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
    });

    observer.observe(svg!, { attributes: true, childList: true, subtree: true });

    const check = () => {
      const now = Date.now();
      if (now - lastMutation >= stableThresholdMs) {
        observer.disconnect();
        resolve(svg!);
        return;
      }
      if (now - start > timeoutMs) {
        observer.disconnect();
        console.warn("[MdTex] Mermaid rendering timed out; using current SVG state.");
        resolve(svg!);
        return;
      }
      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  });
}

async function svgToPngBuffer(svg: SVGSVGElement, scale = 2): Promise<Buffer> {
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  injectSafeStyles(cloned, svg);

  const { width, height, viewBox } = getSvgSize(cloned);
  cloned.setAttribute("width", `${width}`);
  cloned.setAttribute("height", `${height}`);
  cloned.setAttribute("viewBox", viewBox ?? `0 0 ${width} ${height}`);

  const serialized = new XMLSerializer().serializeToString(cloned);
  const sanitizedSerialized = sanitizeSerializedSvg(serialized);
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(sanitizedSerialized).toString("base64")}`;

  try {
    const img = await loadImage(dataUri);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create PNG blob (canvas empty?)."))), "image/png");
      } catch (e) {
        reject(e);
      }
    });

    const buffer = Buffer.from(await pngBlob.arrayBuffer());
    return buffer;
  } catch (error) {
    console.warn("[MdTex] Mermaid rasterization failed (SecurityError likely). Using fallback image.", error);
    return createFallbackImageBuffer(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  }
}

function injectSafeStyles(clonedSvg: SVGSVGElement, _originalSvg: SVGSVGElement) {
  const cssVariables = collectCssVariables(document.body);
  const safeFontStack =
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;';

  const styleContent = `
    :root, svg { ${cssVariables} }
    * { ${safeFontStack} }
    .label, .node text, .messageText, .loopText, .sectionTitle, .actor, .legend, .title { ${safeFontStack} }
  `;

  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = styleContent;
  if (clonedSvg.firstChild) {
    clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);
  } else {
    clonedSvg.appendChild(styleEl);
  }

  const nodesToRemove: Element[] = [];
  const walker = document.createTreeWalker(clonedSvg, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    const tagName = el.tagName.toLowerCase();

    if (["script", "iframe", "object", "embed", "link"].includes(tagName)) {
      nodesToRemove.push(el);
      continue;
    }

    for (const name of el.getAttributeNames()) {
      const val = el.getAttribute(name);
      if (!val) continue;

      if (val.toLowerCase().includes("url(")) {
        const cleanVal = val.replace(/url\(\s*(?!['"]?(?:#|data:|blob:))[^)]+\)/gi, "none");
        if (val !== cleanVal) el.setAttribute(name, cleanVal);
      }

      if (["href", "xlink:href", "src"].includes(name)) {
        if (!/^(#|data:|blob:)/i.test(val)) {
          el.removeAttribute(name);
          if (["image", "img"].includes(tagName)) {
            nodesToRemove.push(el);
          }
        }
      }

      if (name.startsWith("on")) {
        el.removeAttribute(name);
      }
    }

    if (el.hasAttribute("style")) {
      const s = el.getAttribute("style") || "";
      if (s.toLowerCase().includes("url(")) {
        el.setAttribute("style", s.replace(/url\(\s*(?!['"]?(?:#|data:|blob:))[^)]+\)/gi, "none"));
      }
    }

    if (el.hasAttribute("srcset")) {
      el.removeAttribute("srcset");
    }

    if (tagName === "image") {
      const href = el.getAttribute("href") || el.getAttribute("xlink:href");
      if (href && !(href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("#"))) {
        nodesToRemove.push(el);
      }
    }

    if (tagName === "img") {
      const src = el.getAttribute("src");
      if (src && !(src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("#"))) {
        nodesToRemove.push(el);
      }
    }
  }

  nodesToRemove.forEach((el) => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });

  const existingStyles = clonedSvg.querySelectorAll("style");
  existingStyles.forEach((s) => {
    if (s === styleEl) return;
    if (s.textContent) {
      s.textContent = s.textContent
        .replace(/@import\s+url\([^)]+\);?/gi, "")
        .replace(/url\(\s*(?!['"]?(?:#|data:|blob:))[^)]+\)/gi, "none");
    }
  });
}

function collectCssVariables(element: HTMLElement): string {
  const style = window.getComputedStyle(element);
  let cssText = "";

  const colorRegex = /^(#[0-9a-fA-F]{3,8}|rgba?\s*\(|hsla?\s*\(|[a-zA-Z]+$)/;

  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (!prop.startsWith("--")) continue;

    const val = style.getPropertyValue(prop).trim();
    if (colorRegex.test(val) && !val.toLowerCase().includes("url(")) {
      cssText += `${prop}: ${val};\n`;
    }
  }

  return cssText;
}

// シリアライズ済みSVG文字列の最終サニタイズ。
// 念のため外部参照が残っていてもここで除去する（二重の安全策）。
function sanitizeSerializedSvg(svgText: string): string {
  return svgText
    .replace(/url\(\s*(?!['"]?(?:#|data:|blob:))[^)]+\)/gi, "none")
    .replace(/\b(?:href|xlink:href|src)\s*=\s*(["'])(?!#|data:|blob:)[^"']*\1/gi, '$1""$1')
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/@import\s+url\([^)]+\);?/gi, "")
    .replace(/<image\b[^>]*?(?:href|xlink:href)=["'](?!#|data:|blob:)[^"']+["'][^>]*>/gi, "")
    .replace(/<img\b[^>]*?src=["'](?!data:|blob:)[^"']+["'][^>]*>/gi, "");
}

function createFallbackImageBuffer(width: number, height: number): Buffer {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "red";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, width, height);
    ctx.fillStyle = "red";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Mermaid Error", width / 2, height / 2);
  }
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  return Buffer.from(base64, "base64");
}

function getSvgSize(svg: SVGSVGElement): { width: number; height: number; viewBox?: string } {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/\s+|,/).map((v) => Number(v));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        width: Math.max(1, Math.round(parts[2])),
        height: Math.max(1, Math.round(parts[3])),
        viewBox,
      };
    }
  }

  // fallback to bounding box or attributes
  const rect = svg.getBoundingClientRect();
  const widthAttr = Number(svg.getAttribute("width")) || rect.width;
  const heightAttr = Number(svg.getAttribute("height")) || rect.height;
  return {
    width: Math.max(1, Math.round(widthAttr || 800)),
    height: Math.max(1, Math.round(heightAttr || 400)),
    viewBox: viewBox || undefined,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

async function writePng(dir: string, data: Buffer): Promise<string> {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const pngPath = path.join(dir, `mermaid-${uniqueId}.png`);
  await fs.writeFile(pngPath, data);
  return pngPath;
}

function buildAttributeBlock(attrContent?: string, imageScale?: string): string {
  const attrs: string[] = [];
  let widthToken: string | undefined;

  if (attrContent) {
    const tokens = attrContent.trim().split(/\s+/);
    for (const token of tokens) {
      if (!token) continue;
      if (token.startsWith("#") || token.startsWith(".")) {
        attrs.push(token);
        continue;
      }
      if (/^width\s*=/.test(token)) {
        widthToken = token.replace(/^width\s*=\s*/, "");
        continue;
      }
      // その他の属性はそのまま残す（height= など）
      attrs.push(token);
    }
  }

  // デフォルト幅を補う（attrに幅指定がなければ imageScale または 100%）
  const widthVal = widthToken || (imageScale ? imageScale.replace(/^\{|\}$/g, "") : "width=100%");
  if (widthVal) {
    // width= が抜けている場合は付与
    const normalizedWidth = /^width\s*=/.test(widthVal) ? widthVal : `width=${widthVal}`;
    attrs.push(normalizedWidth);
  }

  // Mermaidクラスを付けておくと後段でスタイル指定しやすい
  if (!attrs.some((t) => t === ".mermaid" || t === "mermaid" || t === ".mermaid-rendered")) {
    attrs.push(".mermaid");
  }

  return attrs.length ? `{${attrs.join(" ")}}` : "";
}
