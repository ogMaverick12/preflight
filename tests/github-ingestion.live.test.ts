import { describe, expect, it } from "vitest";

import { ingestPublicRepo } from "@/lib/github/ingestion";

describe("ingestPublicRepo (live GitHub)", () => {
  it("fetches recent commit metadata and diffs from octocat/Hello-World", async () => {
    const commits = await ingestPublicRepo("https://github.com/octocat/Hello-World", { limit: 2 });

    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      sha: expect.any(String),
      message: expect.any(String),
      diffUrl: expect.stringMatching(/^https:\/\/github\.com\/octocat\/Hello-World\/commit\//),
      changedFiles: expect.any(Array),
    });
  }, 30_000);
});
