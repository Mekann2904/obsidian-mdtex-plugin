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

  // 後続の {#fig:...}[mermaid] や {#fig:...}[任意キャプション] 行を一緒に拾って画像側へ付け替える（改行・空行・CRLFを許容）
  // 捕捉:
  // 1: インデント（未使用） 2: フェンス記号 3: Mermaidコード本体 4: 属性行全体 5: fig ID部 6: キャプション部
  const mermaidRegex =
    /^(\s*)(`{3,}|~{3,})mermaid[ \t]*\r?\n([\s\S]*?)\r?\n\2[ \t]*\r?\n?(?:\s*(\{#([^}\s]+)\})(\[[^\]]*\])?)?/gm;
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
      const [fullMatch, _indent, _fence, mermaidCode, _attrLine, figIdRaw, figCaptionRaw] = match;
      try {
        const svg = await renderMermaidInDom(options.app, mermaidCode, container, options.sourcePath);
        const pngBuffer = await svgToPngBuffer(svg, 2);
        const pngPath = await writePng(tempDir, pngBuffer);
        const widthValue = options.imageScale || "width=100%";
        const attrParts: string[] = [];
        if (figIdRaw) attrParts.push(`#${figIdRaw.trim()}`);
        attrParts.push(".mermaid");
        if (widthValue) attrParts.push(widthValue.replace(/^\{|\}$/g, ""));

        const attrBlock = attrParts.length ? `{${attrParts.join(" ")}}` : "";
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

  const svg = await waitForSvg(container);
  // Gantt/Sequence 等は追加レイアウト計算が走るため少し待つ
  await sleep(250);
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

async function waitForSvg(root: HTMLElement, timeoutMs = 1500): Promise<SVGSVGElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = root.querySelector("svg");
    if (found) return found as SVGSVGElement;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
  return null;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
