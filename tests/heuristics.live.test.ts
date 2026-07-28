import { describe, expect, it } from "vitest";

import { runCoverageDelta, runReferenceCheck } from "@/lib/analysis/heuristics";
import { ingestPublicRepo } from "@/lib/github/ingestion";

describe("heuristics (live GitHub)", () => {
  it("analyzes source and documentation commits from public repositories", async () => {
    const [sourceCommits, documentationCommits] = await Promise.all([
      ingestPublicRepo("https://github.com/sindresorhus/yocto-queue", { limit: 2 }),
      ingestPublicRepo("https://github.com/octocat/Hello-World", { limit: 1 }),
    ]);
    const runs = [...sourceCommits, ...documentationCommits].map((commit) => ({
      sha: commit.sha.slice(0, 7),
      message: commit.message.split("\n")[0],
      changedFiles: commit.changedFiles,
      referenceCheck: runReferenceCheck({ diffText: commit.diffText, visibleSymbols: [] }),
      coverageDelta: runCoverageDelta({ changedFiles: commit.changedFiles }),
    }));

    console.log(JSON.stringify(runs, null, 2));

    expect(runs).toHaveLength(3);
    expect(runs.at(-1)?.coverageDelta.sourceFiles).toEqual([]);
  }, 30_000);
});
