// File: src/cli/commands/pack.ts
// Purpose: `mdtex pack` サブコマンド実装。
// Reason: CLI entrypoint を dispatch に集中させ、pack の I/O と表示責務を局所化するため。

import {
  listTemplatePacksFs,
  readPackMetadataFs,
  testPackFs,
  validatePackFs,
} from "../fsTemplatePack";

export interface PackTestCliOptions {
  sample?: string;
  output?: string;
  pandoc?: string;
  vaultRoot?: string;
  imageScale?: string;
  keepArtifacts: boolean;
  dryRun: boolean;
}

export async function cmdPackList(folder: string, asJson: boolean): Promise<number> {
  const packs = await listTemplatePacksFs(folder);

  if (asJson) {
    const items = await Promise.all(
      packs.map(async name => {
        const meta = await readPackMetadataFs(folder, name);
        return {
          name,
          title: meta?.title ?? null,
          description: meta?.description ?? null,
          engine: meta?.engine ?? null,
        };
      }),
    );
    process.stdout.write(JSON.stringify({ ok: true, packs: items }, null, 2) + "\n");
    return 0;
  }

  if (packs.length === 0) {
    const f = folder || "MdTex Templates";
    process.stdout.write(`（パックが見つかりません: ${f}）\n`);
    return 0;
  }
  for (const name of packs) {
    const meta = await readPackMetadataFs(folder, name);
    if (meta?.title) {
      process.stdout.write(`${name}  — ${meta.title}\n`);
    } else {
      process.stdout.write(`${name}\n`);
    }
  }
  return 0;
}

export async function cmdPackValidate(
  pack: string,
  folder: string,
  asJson: boolean,
  strict: boolean,
): Promise<number> {
  if (!pack) {
    process.stderr.write(
      "Error: パック名が未指定です。\n  mdtex pack validate <pack>\n  例: mdtex pack validate 縦書き二段組\n",
    );
    return 2;
  }

  const validation = await validatePackFs(folder, pack, strict);

  if (asJson) {
    // status が JSON / exit code の唯一の源（ok 廃止: exit code とのズレを防ぐ）。
    process.stdout.write(JSON.stringify(validation, null, 2) + "\n");
  } else {
    // text 出力（人間向け・簡潔）
    process.stdout.write(`パック: ${pack}\n`);
    process.stdout.write(`defaults.yaml: ${validation.defaultsReadable ? "OK" : "NG（読めません）"}\n`);
    process.stdout.write(`メタ(_mdtex): ${validation.hasMetadata ? "あり" : "なし"}\n`);
    if (validation.missingRequires.length > 0) {
      process.stdout.write(`必須ファイル不足: ${validation.missingRequires.join(", ")}\n`);
    }
    if (validation.metadata?.engine) {
      process.stdout.write(`想定エンジン: ${validation.metadata.engine}\n`);
    }
    for (const w of validation.warnings) process.stdout.write(`⚠ ${w}\n`);
    for (const e of validation.errors) process.stderr.write(`✗ ${e}\n`);
    if (validation.status === "ok") process.stdout.write("✓ OK\n");
  }

  return validation.status === "errors" ? 2 : validation.status === "warnings" ? 1 : 0;
}

export async function cmdPackTest(
  pack: string,
  folder: string,
  opts: PackTestCliOptions,
  asJson: boolean,
): Promise<number> {
  if (!pack) {
    process.stderr.write(
      "Error: パック名が未指定です。\n  mdtex pack test <pack>\n  例: mdtex pack test 縦書き二段組\n",
    );
    return 2;
  }

  const result = await testPackFs({ folder, pack, ...opts });

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (result.status === "dry-run") {
    process.stdout.write(`(dry-run) ${result.command}\n`);
    if (result.normalizedContent !== undefined) {
      process.stdout.write(`--- normalized content (${result.normalizedContent.length} bytes) ---\n`);
      process.stdout.write(result.normalizedContent + "\n");
    }
  } else {
    process.stdout.write(`パック: ${pack}\n`);
    process.stdout.write(`サンプル: ${result.sampleUsed}\n`);
    if (result.status === "ok") {
      process.stdout.write(`✓ PDF 生成成功: ${result.output}\n`);
      if (result.texArtifact) process.stdout.write(`  .tex: ${result.texArtifact}\n`);
    } else {
      process.stderr.write(`✗ ${result.error}\n`);
      if (result.stderrTail) process.stderr.write(`--- pandoc stderr ---\n${result.stderrTail}\n`);
    }
    // 重複ラベル警告（観測情報）。
    for (const d of result.duplicateLabels ?? []) {
      process.stderr.write(`⚠ crossref ラベル重複: ${d.label} (${d.count}回)\n`);
    }
  }

  return result.status === "error" ? 2 : 0;
}
