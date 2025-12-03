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

  // 後続の {#fig:... width=...}[caption] などの属性行をまとめて吸収（改行・空行・CRLFを許容）
  // 捕捉:
  // 1: インデント（未使用） 2: フェンス記号 3: Mermaidコード本体 4: 属性ブロック中身（#id や width=... などを含む） 5: キャプション [text]（任意）
  const mermaidRegex =
    /^(\s*)(`{3,}|~{3,})mermaid[ \t]*\r?\n([\s\S]*?)\r?\n\2[ \t]*\r?\n?(?:\s*\{([^}\r\n]+)\}(\[[^\]]*\])?)?/gm;
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

  const svg = await waitForStableSvg(container, 2000, 50);
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
  timeoutMs = 2000,
  stableThresholdMs = 50
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
  inlineStyles(cloned);

  const { width, height, viewBox } = getSvgSize(cloned);
  cloned.setAttribute("width", `${width}`);
  cloned.setAttribute("height", `${height}`);
  cloned.setAttribute("viewBox", viewBox ?? `0 0 ${width} ${height}`);

  const serialized = new XMLSerializer().serializeToString(cloned);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create PNG blob."))), "image/png");
    });

    const buffer = Buffer.from(await pngBlob.arrayBuffer());
    return buffer;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function inlineStyles(svg: SVGSVGElement) {
  const walker = document.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode as HTMLElement;
    const style = window.getComputedStyle(el);
    const cssText = Array.from(style)
      .map((prop) => `${prop}:${style.getPropertyValue(prop)};`)
      .join("");
    if (cssText) el.setAttribute("style", cssText);
  }
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
