export interface ReferenceCheckInput {
  diffText: string;
  visibleSymbols: Iterable<string>;
}

export interface ReferenceCheckResult {
  flaggedSymbols: Array<{ name: string; reason: string }>;
}

export interface CoverageDeltaInput {
  changedFiles: Iterable<string>;
}

export interface CoverageDeltaResult {
  sourceFiles: string[];
  testFiles: string[];
  uncoveredFiles: string[];
  explanation: string;
}

const BUILTIN_SYMBOLS = new Set([
  "Array",
  "Boolean",
  "Date",
  "Error",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "RegExp",
  "Set",
  "String",
  "console",
  "decodeURIComponent",
  "encodeURIComponent",
  "fetch",
  "parseFloat",
  "parseInt",
  "setTimeout",
]);

const CONTROL_KEYWORDS = new Set(["catch", "for", "if", "switch", "while", "with"]);
const SOURCE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "cjs",
  "go",
  "h",
  "hpp",
  "java",
  "js",
  "jsx",
  "kt",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "scala",
  "swift",
  "ts",
  "tsx",
  "vue",
  "svelte",
]);

export function runReferenceCheck({ diffText, visibleSymbols }: ReferenceCheckInput): ReferenceCheckResult {
  const addedLines = diffText
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
  const knownSymbols = new Set(Array.from(visibleSymbols));
  for (const symbol of BUILTIN_SYMBOLS) {
    knownSymbols.add(symbol);
  }
  const localSymbols = extractLocalSymbols(addedLines);
  const unresolved = new Set<string>();

  for (const line of addedLines) {
    for (const importedSymbol of extractImportedSymbols(line, knownSymbols)) {
      if (!knownSymbols.has(importedSymbol)) {
        unresolved.add(importedSymbol);
      }
      localSymbols.add(importedSymbol);
    }

    for (const reference of extractCallRoots(line)) {
      if (!knownSymbols.has(reference) && !localSymbols.has(reference) && !CONTROL_KEYWORDS.has(reference)) {
        unresolved.add(reference);
      }
    }
  }

  return {
    flaggedSymbols: Array.from(unresolved).map((name) => ({
      name,
      reason: "Referenced in added code but not found in scanned files or the built-in allowlist.",
    })),
  };
}

export function runCoverageDelta({ changedFiles }: CoverageDeltaInput): CoverageDeltaResult {
  const files = Array.from(changedFiles);
  const testFiles = files.filter(isTestFile);
  const sourceFiles = files.filter((file) => isSourceFile(file) && !isTestFile(file));
  const uncoveredFiles = testFiles.length === 0 ? sourceFiles : [];

  return {
    sourceFiles,
    testFiles,
    uncoveredFiles,
    explanation:
      sourceFiles.length === 0
        ? "No source files changed in this commit."
        : testFiles.length === 0
          ? "Source files changed without a matching test file in this commit."
          : "Test coverage changed alongside source files.",
  };
}

function extractLocalSymbols(lines: string[]): Set<string> {
  const localSymbols = new Set<string>();
  const declarationPattern = /\b(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

  for (const line of lines) {
    for (const match of Array.from(line.matchAll(declarationPattern))) {
      localSymbols.add(match[1]);
    }
  }

  return localSymbols;
}

function extractImportedSymbols(line: string, knownSymbols: Set<string>): string[] {
  const fromMatch = line.match(/\bfrom\s+["']([^"']+)["']/);
  if (!fromMatch || !fromMatch[1].startsWith(".")) {
    return [];
  }

  const namedImport = line.match(/\bimport\s+(?:type\s+)?\{([^}]+)\}/);
  if (!namedImport) {
    return [];
  }

  return namedImport[1]
    .split(",")
    .map((entry) => entry.trim().split(/\s+as\s+/i)[0])
    .filter(Boolean)
    .filter((name) => !knownSymbols.has(name));
}

function extractCallRoots(line: string): string[] {
  const references = new Set<string>();
  const callPattern = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;

  for (const match of Array.from(line.matchAll(callPattern))) {
    references.add(match[1].split(".")[0]);
  }

  return Array.from(references);
}

function isTestFile(file: string): boolean {
  return /(^|\/)__tests__\//.test(file) || /\.(?:test|spec)\.[^/]+$/i.test(file);
}

function isSourceFile(file: string): boolean {
  const normalizedFile = file.toLowerCase();
  const fileName = normalizedFile.split("/").at(-1) ?? "";
  const extension = fileName.split(".").at(-1) ?? "";

  if (
    normalizedFile.startsWith("docs/") ||
    normalizedFile.startsWith(".github/") ||
    fileName.startsWith("readme") ||
    /(?:^|\.)config\.[cm]?[jt]sx?$/.test(fileName) ||
    /^(?:eslint|postcss|tailwind|vite|next|jest|vitest)\./.test(fileName)
  ) {
    return false;
  }

  return SOURCE_EXTENSIONS.has(extension);
}
