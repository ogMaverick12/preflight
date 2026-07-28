import { describe, expect, it } from "vitest";

import { analyzeRecentRepo } from "@/lib/pipeline/analyze-repo";

const judgment = {
  verdict: "review" as const,
  intent_match: { matches: true, explanation: "Matches the stated cleanup." },
  rationale: "Review because the source change has no matching test update; add a regression test for the changed cleanup path.",
};

function commit(sha: string) {
  return {
    sha,
    message: `Commit ${sha}`,
    author: "Ada",
    authorLogin: "ada",
    committedAt: "2026-07-28T00:00:00Z",
    diffUrl: `https://github.com/acme/demo/commit/${sha}`,
    diffText: "+export const value = 1;",
    changedFiles: ["src/value.ts"],
  };
}

describe("analyzeRecentRepo", () => {
  it("persists each completed analysis before emitting it without waiting for slower commits", async () => {
    const activity: string[] = [];
    const events = [];
    const delays: Record<string, number> = { first: 40, second: 5, third: 15 };

    const generator = analyzeRecentRepo(
      { repoUrl: "https://github.com/acme/demo", limit: 20, concurrency: 2 },
      {
        listCommitRefs: async (_repoUrl, limit) => {
          expect(limit).toBe(20);
          return [{ sha: "first" }, { sha: "second" }, { sha: "third" }];
        },
        fetchCommit: async (_repoUrl, sha) => commit(sha),
        analyzeCommit: async (value) => {
          await new Promise((resolve) => setTimeout(resolve, delays[value.sha]));
          return {
            judgment,
            referenceCheck: { flaggedSymbols: [] },
            coverageDelta: {
              sourceFiles: ["src/value.ts"],
              testFiles: [],
              uncoveredFiles: ["src/value.ts"],
              explanation: "Source files changed without a matching test file in this commit.",
            },
          };
        },
        store: {
          upsertRepo: async () => ({ id: "repo-1", name: "acme/demo" }),
          upsertPendingCommit: async (_repoId, value) => ({ id: `commit-${value.sha}` }),
          completeAnalysis: async (value) => {
            activity.push(`persist:${value.commit.sha}`);
          },
          markRepoAnalyzed: async () => undefined,
        },
      },
    );

    for await (const event of generator) {
      events.push(event);
      if (event.type === "commit") {
        activity.push(`emit:${event.commit.sha}`);
      }
    }

    expect(events.map((event) => event.type)).toEqual(["repo", "commit", "commit", "commit", "done"]);
    expect(events.filter((event) => event.type === "commit").map((event) => event.commit.sha)).toEqual([
      "second",
      "third",
      "first",
    ]);
    expect(activity).toEqual([
      "persist:second",
      "emit:second",
      "persist:third",
      "emit:third",
      "persist:first",
      "emit:first",
    ]);
  });

  it("emits a commit error and continues with the remaining commits", async () => {
    const events = [];

    for await (const event of analyzeRecentRepo(
      { repoUrl: "https://github.com/acme/demo", limit: 20, concurrency: 1 },
      {
        listCommitRefs: async () => [{ sha: "bad" }, { sha: "good" }],
        fetchCommit: async (_repoUrl, sha) => {
          if (sha === "bad") throw new Error("GitHub patch unavailable");
          return commit(sha);
        },
        analyzeCommit: async () => ({
          judgment,
          referenceCheck: { flaggedSymbols: [] },
          coverageDelta: {
            sourceFiles: [],
            testFiles: [],
            uncoveredFiles: [],
            explanation: "No source files changed in this commit.",
          },
        }),
        store: {
          upsertRepo: async () => ({ id: "repo-1", name: "acme/demo" }),
          upsertPendingCommit: async (_repoId, value) => ({ id: `commit-${value.sha}` }),
          completeAnalysis: async () => undefined,
          markRepoAnalyzed: async () => undefined,
        },
      },
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "repo", repo: { id: "repo-1", name: "acme/demo" } },
      { type: "commit_error", sha: "bad", message: "GitHub patch unavailable" },
      expect.objectContaining({ type: "commit", commit: expect.objectContaining({ sha: "good" }) }),
      { type: "done" },
    ]);
  });
});
