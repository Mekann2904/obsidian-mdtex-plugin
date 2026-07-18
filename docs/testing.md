---
title: テストガイド
category: 開発者ドキュメント
audience: 開発者
last_updated: 2026-02-12
tags: [テスト, Vitest, カバレッジ]
related: [docs/development.md, ../ARCHITECTURE.md, docs/API.md]
---

# テストガイド

[ドキュメントインデックス](./index.md) > テストガイド

## 概要

このガイドでは、MdTeXプラグインのテスト慣習について説明する。ユニットテスト、統合テスト、テスト駆動開発を含む。

---

## テストの哲学

- **ユニットテスト** - 分離された関数とクラスをテスト
- **統合テスト** - コンポーネント間の相互作用をテスト
- **高速なフィードバック** - テストは素早く完了する必要がある
- **明確な意図** - テスト名は何をテストしているかを説明する

### 目標

1. 早期にリグレッションを発見
2. 期待される動作をドキュメント化
3. リファクタリングを促進
4. API使用法の例を提供

---

## テストフレームワーク

### 使用ツール

- **Vitest**: テストフレームワークとランナー
- **@vitest/coverage-v8**: コードカバレッジレポート
- **jsdom**: ブラウザのようなテスト用DOM環境

### 設定

**ファイル**: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "*.test.ts",
        "*.config.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

---

## テスト構造

### ファイル構成

```
src/
├── services/
│   ├── convertService.ts
│   ├── convertService.test.ts      # ユニットテスト
│   ├── pandocCommandBuilder.ts
│   └── pandocCommandBuilder.test.ts
└── utils/
    ├── pathHelpers.ts
    └── pathHelpers.test.ts

tests/
├── setup.ts                        # テストセットアップ
├── helpers.ts                      # テストヘルパー
└── __mocks__/                      # モック
    └── obsidian.ts
```

### テストファイルの命名

- ソースと同じ場所に配置: `serviceName.test.ts`
- または別のテストディレクトリ: `tests/services/serviceName.test.ts`

---

## テストの記述

### 基本的なテスト構造

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("FeatureName", () => {
  beforeEach(() => {
    // 各テスト前のセットアップ
  });

  afterEach(() => {
    // 各テスト後のクリーンアップ
  });

  it("should do something", () => {
    // 準備
    const input = "test";

    // 実行
    const result = functionName(input);

    // 検証
    expect(result).toBe("expected");
  });
});
```

### テスト命名規約

```typescript
// 良い例 - 説明的
it("should convert markdown to pdf when pandoc is available")

// 良い例 - 期待される動作を説明
it("returns null when file does not exist")

// 避けるべき - 曖昧
it("test conversion")
it("check file")
```

---

## テストカテゴリ

### 1. ユニットテスト

分離された関数とクラスをテストする。

**例**: `pandocCommandBuilder.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { buildPandocCommand } from "./pandocCommandBuilder";
import { DEFAULT_PROFILE } from "../MdTeXPluginSettings";

describe("buildPandocCommand", () => {
  it("should build correct command for PDF output", () => {
    const options = {
      profile: DEFAULT_PROFILE,
      format: "pdf",
      outputPath: "/tmp/output.pdf",
      workingDir: "/work",
    };

    const result = buildPandocCommand(options);

    expect(result.command).toBe("pandoc");
    expect(result.args).toContain("--pdf-engine=lualatex");
    expect(result.args).toContain("-o");
    expect(result.args).toContain("/tmp/output.pdf");
  });

  it("should include resource-path when specified", () => {
    const options = {
      profile: DEFAULT_PROFILE,
      format: "pdf",
      outputPath: "/tmp/output.pdf",
      workingDir: "/work",
      resourcePath: "/resources",
    };

    const result = buildPandocCommand(options);

    expect(result.args).toContain("--resource-path=/resources");
  });
});
```

### 2. 統合テスト

コンポーネント間の相互作用をテストする。

**例**: `convertService.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { convertCurrentPage } from "./convertService";
import { createMockApp, createMockSettings } from "../../tests/helpers";

describe("convertCurrentPage", () => {
  it("should convert markdown with transclusions", async () => {
    // モックのセットアップ
    const mockApp = createMockApp();
    const mockSettings = createMockSettings();
    const mockContext = {
      app: mockApp,
      settings: mockSettings,
      getActiveProfileSettings: () => mockSettings.profiles.Default,
    };

    vi.spyOn(processRunner, "runCommand").mockResolvedValue({
      code: 0,
      stdout: "",
      stderr: "",
    });

    // 実行
    await convertCurrentPage(mockContext, {}, "pdf");

    // 検証
    expect(processRunner.runCommand).toHaveBeenCalled();
  });
});
```

### 3. サービステスト

サービス層ロジックをテストする。

**例**: `profileManager.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { createProfile, deleteProfile, renameProfile } from "./profileManager";
import { DEFAULT_PROFILE } from "../MdTeXPluginSettings";

describe("ProfileManager", () => {
  it("should create a new profile", () => {
    const profiles = { Default: DEFAULT_PROFILE };

    const result = createProfile(profiles, "NewProfile");

    expect(result.NewProfile).toBeDefined();
    expect(result.NewProfile).toEqual(DEFAULT_PROFILE);
    expect(result.Default).toBeDefined(); // 元のものは保持
  });

  it("should throw error when creating duplicate profile", () => {
    const profiles = { Default: DEFAULT_PROFILE };

    expect(() => createProfile(profiles, "Default")).toThrow();
  });

  it("should delete existing profile", () => {
    const profiles = {
      Default: DEFAULT_PROFILE,
      Profile2: { ...DEFAULT_PROFILE, fontSize: "12pt" },
    };

    const result = deleteProfile(profiles, "Profile2");

    expect(result.Profile2).toBeUndefined();
    expect(result.Default).toBeDefined();
  });

  it("should rename existing profile", () => {
    const profiles = { Default: DEFAULT_PROFILE };
    const oldProfile = profiles.Default;

    const result = renameProfile(profiles, "Default", "Renamed");

    expect(result.Default).toBeUndefined();
    expect(result.Renamed).toBe(oldProfile);
  });
});
```

### 4. ユーティリティテスト

純粋なユーティリティ関数をテストする。

**例**: `pathHelpers.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { normalizeFsPath, joinFsPath } from "./pathHelpers";

describe("normalizeFsPath", () => {
  it("should handle forward slashes", () => {
    expect(normalizeFsPath("path/to/file")).toBe("path/to/file");
  });

  it("should convert backslashes to forward slashes", () => {
    expect(normalizeFsPath("path\\to\\file")).toBe("path/to/file");
  });

  it("should handle mixed slashes", () => {
    expect(normalizeFsPath("path/to\\file")).toBe("path/to/file");
  });

  it("should handle empty string", () => {
    expect(normalizeFsPath("")).toBe("");
  });
});

describe("joinFsPath", () => {
  it("should join paths correctly", () => {
    expect(joinFsPath("a", "b", "c")).toBe("a/b/c");
  });

  it("should handle empty segments", () => {
    expect(joinFsPath("a", "", "c")).toBe("a/c");
  });
});
```

---

## モックとスタブ

### Obsidian APIのモック

**ファイル**: `tests/__mocks__/obsidian.ts`

```typescript
export const mockVault = {
  getName: vi.fn(() => "TestVault"),
  getRoot: vi.fn(() => "/test/path"),
  adapter: {
    // Adapterメソッド
  },
};

export const mockApp = {
  vault: mockVault,
  workspace: {
    getActiveFile: vi.fn(),
    activeEditor: vi.fn(),
  },
};

export function createMockApp() {
  return mockApp;
}
```

### 外部プロセスのモック

```typescript
import { vi } from "vitest";
import { runCommand } from "../utils/processRunner";

describe("Conversion", () => {
  it("should handle pandoc failure", async () => {
    // processRunnerのモック
    vi.spyOn(processRunner, "runCommand").mockResolvedValue({
      code:1,
      stdout: "",
      stderr: "pandoc: error",
    });

    // エラーハンドリングのテスト
    await expect(
      convertCurrentPage(mockContext, {}, "pdf")
    ).rejects.toThrow();
  });
});
```

### ファイルシステムのモック

```typescript
import { vi } from "vitest";
import * as fs from "fs/promises";

describe("File Operations", () => {
  it("should read file content", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue("file content");

    const result = await readMyFile("test.md");

    expect(result).toBe("file content");
    expect(fs.readFile).toHaveBeenCalledWith("test.md", "utf-8");
  });
});
```

---

## テストの実行

### 全テストの実行

```bash
npm test
```

### 特定のテストファイルの実行

```bash
npm test -- convertService.test.ts
```

### ウォッチモードでテストの実行

```bash
npm test -- --watch
```

### パターンに一致するテストの実行

```bash
npm test -- --grep "should convert"
```

### 変更されたファイルのテスト実行

```bash
npm test -- --changed
```

---

## テストカバレッジ

### カバレッジレポートの生成

```bash
npm run test:coverage
```

これにより以下が生成されます：
- ターミナル出力とパーセンテージ
- `coverage/index.html` - インタラクティブなHTMLレポート
- `coverage/coverage-final.json` - 機械可読レポート

### カバレッジ目標

| コンポーネント | 目標カバレッジ |
|-----------|-----------------|
| サービス（ビジネスロジック） | > 80% |
| ユーティリティ | > 90% |
| UIコンポーネント | > 70% |
| 全体 | > 75% |

### カバレッジレポートの表示

```bash
npm run test:coverage
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

---

## ベストプラクティス

### 1. Arrange-Act-Assertパターン

```typescript
it("should calculate total correctly", () => {
  // 準備
  const items = [{ price: 10 }, { price: 20 }];
  const taxRate = 0.1;

  // 実行
  const total = calculateTotal(items, taxRate);

  // 検証
  expect(total).toBe(33); // (10 + 20) * 1.1
});
```

### 2. 1テストにつき1つのことをテスト

```typescript
// 悪い例 - 複数のことをテスト
it("should handle conversion", () => {
  const result = convert(markdown);
  expect(result).toContain("\\begin{document}");
  expect(result).toContain("\\title{Test}");
  expect(result.length).toBeGreaterThan(100);
});

// 良い例 - 1テストにつき1アサーション
it("should include document class", () => {
  const result = convert(markdown);
  expect(result).toContain("\\begin{document}");
});

it("should include title", () => {
  const result = convert(markdown);
  expect(result).toContain("\\title{Test}");
});

it("should generate reasonable length output", () => {
  const result = convert(markdown);
  expect(result.length).toBeGreaterThan(100);
});
```

### 3. 説明的なテスト名の使用

```typescript
// 良い例
it("should return null when profile does not exist")
it("should create profile with default settings")
it("should throw error when deleting last profile")

// 避けるべき
it("test null return")
it("check profile creation")
```

### 4. エッジケースのテスト

```typescript
describe("normalizeFsPath", () => {
  it("should handle normal paths", () => {
    expect(normalizeFsPath("path/to/file")).toBe("path/to/file");
  });

  it("should handle empty string", () => {
    expect(normalizeFsPath("")).toBe("");
  });

  it("should handle paths with spaces", () => {
    expect(normalizeFsPath("path/to/my file")).toBe("path/to/my file");
  });

  it("should handle paths with special characters", () => {
    expect(normalizeFsPath("path/to/file@#$%")).toBe("path/to/file@#$%");
  });
});
```

### 5. 実装詳細のテストを避ける

```typescript
// 悪い例 - 内部実装をテスト
it("should call convertFile exactly once", () => {
  const spy = vi.spyOn(convertService, "convertFile");
  convertCurrentPage();
  expect(spy).toHaveBeenCalledTimes(1);
});

// 良い例 - 動作をテスト
it("should produce valid PDF output", () => {
  const result = await convertCurrentPage();
  expect(result.path).toMatch(/\.pdf$/);
  expect(result.size).toBeGreaterThan(0);
});
```

### 6. セットアップとクリーンアップ

```typescript
describe("File Operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should write file correctly", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await writeFile(filePath, "content");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("content");
  });
});
```

---

## 一般的なテストシナリオ

### 非同期関数のテスト

```typescript
it("should handle async operation", async () => {
  // 実行
  const result = await asyncFunction();

  // 検証
  expect(result).toBeDefined();
});
```

### エラーハンドリングのテスト

```typescript
it("should throw error for invalid input", () => {
  expect(() => validateInput(null)).toThrow();
});

it("should catch and handle process errors", async () => {
  vi.spyOn(processRunner, "runCommand").mockRejectedValue(
    new Error("Process failed")
  );

  await expect(
    convertCurrentPage(mockContext, {}, "pdf")
  ).rejects.toThrow("Process failed");
});
```

### イベントハンドラのテスト

```typescript
it("should call callback on conversion complete", async () => {
  const callback = vi.fn();

  await convertWithCallback(mockContext, callback);

  expect(callback).toHaveBeenCalledWith(
    expect.objectContaining({ success: true })
  );
});
```

### 異なるプロファイルでのテスト

```typescript
describe("Profile-specific conversions", () => {
  const profiles = {
    Default: { ...DEFAULT_PROFILE, fontSize: "11pt" },
    LargeFont: { ...DEFAULT_PROFILE, fontSize: "14pt" },
  };

  it.each(Object.entries(profiles))(
    "should use correct font size for %s",
    (name, profile) => {
      const result = buildPandocCommand({ profile, ...options });
      expect(result.args).toContain(`fontsize=${profile.fontSize}`);
    }
  );
});
```

---

## 関連トピック

- [アーキテクチャ概要](../ARCHITECTURE.md)
- [開発ガイド](./development.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [APIリファレンス](./API.md)

## 次のトピック

- [APIリファレンス](./API.md)
