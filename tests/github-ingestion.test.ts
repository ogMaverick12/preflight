import { describe, expect, it } from "vitest";

import {
  GitHubIngestionError,
  ingestPublicRepo,
  parsePublicGitHubRepoUrl,
} from "@/lib/github/ingestion";

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    rest: {
      repos: {
        listCommits: async () => ({
          data: [
            {
              sha: "abc123",
              commit: {
                message: "Add a preflight check",
                author: { name: "Ada Lovelace", date: "2026-07-28T08:00:00Z" },
              },
              author: { login: "ada" },
            },
          ],
        }),
        getCommit: async () => ({
          data: {
            sha: "abc123",
            html_url: "https://github.com/octocat/Hello-World/commit/abc123",
            commit: {
              message: "Add a preflight check",
              author: { name: "Ada Lovelace", date: "2026-07-28T08:00:00Z" },
            },
            author: { login: "ada" },
            files: [
              { filename: "lib/check.ts", status: "modified", patch: "+export const ready = true;" },
            ],
          },
        }),
        ...overrides,
      },
    },
  };
}

describe("parsePublicGitHubRepoUrl", () => {
  it("normalizes a public GitHub repository URL", () => {
    expect(parsePublicGitHubRepoUrl("https://github.com/octocat/Hello-World.git/")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
  });

  it("rejects a URL that is not a GitHub repository", () => {
    expect(() => parsePublicGitHubRepoUrl("https://example.com/octocat/Hello-World")).toThrow(
      GitHubIngestionError,
    );
  });
});

describe("ingestPublicRepo", () => {
  it("fetches recent commits and normalizes their diff data", async () => {
    const commits = await ingestPublicRepo("https://github.com/octocat/Hello-World", {
      client: createClient() as never,
    });

    expect(commits).toEqual([
      {
        sha: "abc123",
        message: "Add a preflight check",
        author: "Ada Lovelace",
        authorLogin: "ada",
        committedAt: "2026-07-28T08:00:00Z",
        diffUrl: "https://github.com/octocat/Hello-World/commit/abc123",
        diffText: "+export const ready = true;",
        changedFiles: ["lib/check.ts"],
      },
    ]);
  });

  it("reports an unavailable public repository without exposing GitHub internals", async () => {
    await expect(
      ingestPublicRepo("https://github.com/octocat/Hello-World", {
        client: createClient({
          listCommits: async () => {
            throw { status: 404 };
          },
        }) as never,
      }),
    ).rejects.toMatchObject({ code: "repo_unavailable" });
  });

  it("reports GitHub rate limits with the reset time", async () => {
    await expect(
      ingestPublicRepo("https://github.com/octocat/Hello-World", {
        client: createClient({
          listCommits: async () => {
            throw { status: 403, response: { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1785225600" } } };
          },
        }) as never,
      }),
    ).rejects.toMatchObject({ code: "rate_limited", retryAt: new Date("2026-07-28T08:00:00.000Z") });
  });
});
