import type { CoverageDeltaResult, ReferenceCheckResult } from "@/lib/analysis/heuristics";
import type { CommitJudgment } from "@/lib/analysis/judge";
import type { IngestedCommit } from "@/lib/github/ingestion";

export interface CommitReference {
  sha: string;
}

export interface CompletedCommitAnalysis {
  judgment: CommitJudgment;
  referenceCheck: ReferenceCheckResult;
  coverageDelta: CoverageDeltaResult;
}

export interface PipelineStore {
  upsertRepo(repoUrl: string): Promise<{ id: string; name: string }>;
  upsertPendingCommit(repoId: string, commit: IngestedCommit): Promise<{ id: string }>;
  completeAnalysis(input: {
    commitId: string;
    commit: IngestedCommit;
    analysis: CompletedCommitAnalysis;
  }): Promise<void>;
  markRepoAnalyzed(repoId: string): Promise<void>;
}

export interface AnalyzeRepoDependencies {
  listCommitRefs(repoUrl: string, limit: number): Promise<CommitReference[]>;
  fetchCommit(repoUrl: string, sha: string): Promise<IngestedCommit>;
  analyzeCommit(commit: IngestedCommit): Promise<CompletedCommitAnalysis>;
  store: PipelineStore;
}

export type AnalyzeRepoEvent =
  | { type: "repo"; repo: { id: string; name: string } }
  | {
      type: "commit";
      commit: {
        id: string;
        sha: string;
        message: string;
        author: string;
        diffUrl: string;
        judgment: CommitJudgment;
        referenceCheck: ReferenceCheckResult;
        coverageDelta: CoverageDeltaResult;
      };
    }
  | { type: "commit_error"; sha: string; message: string }
  | { type: "done" };

export async function* analyzeRecentRepo(
  { repoUrl, limit, concurrency }: { repoUrl: string; limit: number; concurrency: number },
  dependencies: AnalyzeRepoDependencies,
): AsyncGenerator<AnalyzeRepoEvent> {
  const repo = await dependencies.store.upsertRepo(repoUrl);
  yield { type: "repo", repo };

  const refs = await dependencies.listCommitRefs(repoUrl, limit);
  const active = new Map<string, Promise<AnalyzeRepoEvent>>();
  let nextIndex = 0;

  const startNext = () => {
    const reference = refs[nextIndex++];
    if (!reference) return;

    active.set(reference.sha, analyzeOne(reference.sha, repoUrl, repo.id, dependencies));
  };

  for (let worker = 0; worker < Math.min(Math.max(concurrency, 1), refs.length); worker += 1) {
    startNext();
  }

  while (active.size > 0) {
    const completed = await Promise.race(
      Array.from(active, ([sha, task]) => task.then((event) => ({ sha, event }))),
    );
    active.delete(completed.sha);
    startNext();
    yield completed.event;
  }

  await dependencies.store.markRepoAnalyzed(repo.id);
  yield { type: "done" };
}

async function analyzeOne(
  sha: string,
  repoUrl: string,
  repoId: string,
  dependencies: AnalyzeRepoDependencies,
): Promise<AnalyzeRepoEvent> {
  try {
    const commit = await dependencies.fetchCommit(repoUrl, sha);
    const storedCommit = await dependencies.store.upsertPendingCommit(repoId, commit);
    const analysis = await dependencies.analyzeCommit(commit);

    await dependencies.store.completeAnalysis({
      commitId: storedCommit.id,
      commit,
      analysis,
    });

    return {
      type: "commit",
      commit: {
        id: storedCommit.id,
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        diffUrl: commit.diffUrl,
        judgment: analysis.judgment,
        referenceCheck: analysis.referenceCheck,
        coverageDelta: analysis.coverageDelta,
      },
    };
  } catch (error) {
    return {
      type: "commit_error",
      sha,
      message: error instanceof Error ? error.message : "Commit analysis failed.",
    };
  }
}
