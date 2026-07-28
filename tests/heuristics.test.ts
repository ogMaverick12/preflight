import { describe, expect, it } from "vitest";

import { runCoverageDelta, runReferenceCheck } from "@/lib/analysis/heuristics";

describe("runReferenceCheck", () => {
  it("flags added call references that are absent from scanned symbols", () => {
    const result = runReferenceCheck({
      diffText: [
        "+++ b/src/score.ts",
        "+import { formatScore } from './format';",
        "+const label = formatScore(value);",
        "+validateFlight(label);",
      ].join("\n"),
      visibleSymbols: ["formatScore"],
    });

    expect(result).toEqual({
      flaggedSymbols: [
        {
          name: "validateFlight",
          reason: "Referenced in added code but not found in scanned files or the built-in allowlist.",
        },
      ],
    });
  });

  it("does not flag locally declared functions or standard library calls", () => {
    const result = runReferenceCheck({
      diffText: "+export function calculateScore(input: number) { return Math.max(input, 0); }",
      visibleSymbols: [],
    });

    expect(result.flaggedSymbols).toEqual([]);
  });

  it("flags a relative import that is absent from scanned symbols", () => {
    const result = runReferenceCheck({
      diffText: "+import { missingFormatter } from './format';",
      visibleSymbols: [],
    });

    expect(result.flaggedSymbols).toEqual([
      {
        name: "missingFormatter",
        reason: "Referenced in added code but not found in scanned files or the built-in allowlist.",
      },
    ]);
  });
});

describe("runCoverageDelta", () => {
  it("flags source files when no test file changed", () => {
    const result = runCoverageDelta({
      changedFiles: ["src/score.ts", "docs/README.md", "next.config.js", "package-lock.json"],
    });

    expect(result).toEqual({
      sourceFiles: ["src/score.ts"],
      testFiles: [],
      uncoveredFiles: ["src/score.ts"],
      explanation: "Source files changed without a matching test file in this commit.",
    });
  });

  it("does not flag source changes when a conventional test file changed", () => {
    const result = runCoverageDelta({
      changedFiles: ["src/score.ts", "src/score.test.ts", "README.md", "eslint.config.mjs"],
    });

    expect(result).toEqual({
      sourceFiles: ["src/score.ts"],
      testFiles: ["src/score.test.ts"],
      uncoveredFiles: [],
      explanation: "Test coverage changed alongside source files.",
    });
  });

  it("ignores documentation and configuration-only changes", () => {
    const result = runCoverageDelta({
      changedFiles: ["docs/architecture.md", "README.md", "vite.config.ts", ".github/workflows/ci.yml"],
    });

    expect(result).toEqual({
      sourceFiles: [],
      testFiles: [],
      uncoveredFiles: [],
      explanation: "No source files changed in this commit.",
    });
  });
});
