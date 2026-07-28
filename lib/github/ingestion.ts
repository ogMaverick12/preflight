import { Octokit } from "@octokit/rest";

export type GitHubIngestionErrorCode = "invalid_url" | "repo_unavailable" | "rate_limited" | "upstream_error";

export class GitHubIngestionError extends Error {
  constructor(
    public readonly code: GitHubIngestionErrorCode,
    message: string,
    public readonly retryAt?: Date,
  ) {
    super(message);
    this.name = "GitHubIngestionError";
  }
}

export interface GitHubRepoIdentifier {
  owner: string;
  repo: string;
}

export interface IngestedCommit {
  sha: string;
  message: string;
  author: string;
  authorLogin: string | null;
  committedAt: string | null;
  diffUrl: string;
  diffText: string;
  changedFiles: string[];
}

type OctokitClient = Pick<Octokit, "rest">;

export interface IngestPublicRepoOptions {
  limit?: number;
  client?: OctokitClient;
}

export function parsePublicGitHubRepoUrl(repoUrl: string): GitHubRepoIdentifier {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(repoUrl.trim());
  } catch {
    throw new GitHubIngestionError(
      "invalid_url",
      "Enter a full public GitHub repository URL, for example https://github.com/owner/repository.",
    );
  }

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname.toLowerCase() !== "github.com" ||
    pathSegments.length !== 2
  ) {
    throw new GitHubIngestionError(
      "invalid_url",
      "Enter a full public GitHub repository URL, for example https://github.com/owner/repository.",
    );
  }

  const [owner, rawRepo] = pathSegments;
  const repo = rawRepo.replace(/\.git$/i, "");

  if (!owner || !repo) {
    throw new GitHubIngestionError(
      "invalid_url",
      "Enter a full public GitHub repository URL, for example https://github.com/owner/repository.",
    );
  }

  return { owner, repo };
}

export async function ingestPublicRepo(
  repoUrl: string,
  { limit = 10, client = new Octokit() }: IngestPublicRepoOptions = {},
): Promise<IngestedCommit[]> {
  const { owner, repo } = parsePublicGitHubRepoUrl(repoUrl);
  const perPage = Math.min(Math.max(Math.floor(limit), 1), 10);

  try {
    const { data: commitSummaries } = await client.rest.repos.listCommits({
      owner,
      repo,
      per_page: perPage,
    });

    return await Promise.all(
      commitSummaries.map(async (summary) => {
        const { data: commit } = await client.rest.repos.getCommit({
          owner,
          repo,
          ref: summary.sha,
        });

        return {
          sha: commit.sha,
          message: summary.commit.message,
          author: summary.commit.author?.name ?? summary.author?.login ?? "Unknown author",
          authorLogin: summary.author?.login ?? null,
          committedAt: summary.commit.author?.date ?? null,
          diffUrl: commit.html_url,
          diffText: commit.files?.flatMap((file) => file.patch ? [file.patch] : []).join("\n\n") ?? "",
          changedFiles: commit.files?.map((file) => file.filename) ?? [],
        };
      }),
    );
  } catch (error) {
    throw toGitHubIngestionError(error);
  }
}

function toGitHubIngestionError(error: unknown): GitHubIngestionError {
  if (error instanceof GitHubIngestionError) {
    return error;
  }

  const githubError = error as {
    status?: number;
    response?: { headers?: Record<string, string | number | undefined> };
  };
  const headers = githubError.response?.headers;
  const rateLimitExceeded =
    githubError.status === 429 ||
    (githubError.status === 403 && String(headers?.["x-ratelimit-remaining"]) === "0");

  if (rateLimitExceeded) {
    const resetSeconds = Number(headers?.["x-ratelimit-reset"]);
    const retryAt = Number.isFinite(resetSeconds) ? new Date(resetSeconds * 1000) : undefined;

    return new GitHubIngestionError(
      "rate_limited",
      "GitHub's public API rate limit has been reached. Try again after the limit resets.",
      retryAt,
    );
  }

  if (githubError.status === 404 || githubError.status === 401) {
    return new GitHubIngestionError(
      "repo_unavailable",
      "Can't reach that repository. Check that the URL is correct and the repository is public.",
    );
  }

  return new GitHubIngestionError(
    "upstream_error",
    "GitHub could not provide this repository right now. Please try again shortly.",
  );
}
