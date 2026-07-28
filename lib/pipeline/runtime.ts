import "server-only";

import { runCoverageDelta, runReferenceCheck } from "@/lib/analysis/heuristics";
import { judgeCommitOnServer } from "@/lib/analysis/judge-server";
import { fetchPublicRepoCommit, listPublicRepoCommitRefs, parsePublicGitHubRepoUrl } from "@/lib/github/ingestion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnalyzeRepoDependencies, CompletedCommitAnalysis, PipelineStore } from "@/lib/pipeline/analyze-repo";

export function createAnalyzeRepoDependencies(): AnalyzeRepoDependencies {
  return {
    listCommitRefs: (repoUrl, limit) => listPublicRepoCommitRefs(repoUrl, { limit }),
    fetchCommit: fetchPublicRepoCommit,
    analyzeCommit: analyzeCommit,
    store: createSupabasePipelineStore(),
  };
}

async function analyzeCommit(commit: Parameters<AnalyzeRepoDependencies["analyzeCommit"]>[0]): Promise<CompletedCommitAnalysis> {
  const referenceCheck = runReferenceCheck({ diffText: commit.diffText, visibleSymbols: [] });
  const coverageDelta = runCoverageDelta({ changedFiles: commit.changedFiles });
  const judgment = await judgeCommitOnServer({
    commitMessage: commit.message,
    diffText: commit.diffText,
    referenceCheck,
    coverageDelta,
  });

  return { judgment, referenceCheck, coverageDelta };
}

function createSupabasePipelineStore(): PipelineStore {
  const supabase = createSupabaseServerClient();

  return {
    async upsertRepo(repoUrl) {
      const { owner, repo } = parsePublicGitHubRepoUrl(repoUrl);
      const githubUrl = `https://github.com/${owner}/${repo}`;
      const { data, error } = await supabase
        .from("repos")
        .upsert({ github_url: githubUrl, name: `${owner}/${repo}` }, { onConflict: "github_url" })
        .select("id, name")
        .single();

      if (error || !data) throw new Error(error?.message ?? "Could not register repository.");
      return data;
    },
    async upsertPendingCommit(repoId, commit) {
      const { data, error } = await supabase
        .from("commits")
        .upsert(
          {
            repo_id: repoId,
            sha: commit.sha,
            message: commit.message,
            author: commit.author,
            diff_url: commit.diffUrl,
            analyzed_at: null,
          },
          { onConflict: "repo_id,sha" },
        )
        .select("id")
        .single();

      if (error || !data) throw new Error(error?.message ?? "Could not persist commit.");
      return data;
    },
    async completeAnalysis({ commitId, analysis }) {
      const { error: analysisError } = await supabase.from("analyses").upsert(
        {
          commit_id: commitId,
          verdict: analysis.judgment.verdict,
          reference_check: analysis.referenceCheck,
          intent_match: analysis.judgment.intent_match,
          coverage_delta: analysis.coverageDelta,
          rationale: analysis.judgment.rationale,
          raw_model_output: analysis.judgment,
        },
        { onConflict: "commit_id" },
      );

      if (analysisError) throw new Error(analysisError.message);

      const { error: commitError } = await supabase
        .from("commits")
        .update({ analyzed_at: new Date().toISOString() })
        .eq("id", commitId);
      if (commitError) throw new Error(commitError.message);
    },
    async markRepoAnalyzed(repoId) {
      const { error } = await supabase
        .from("repos")
        .update({ last_analyzed_at: new Date().toISOString() })
        .eq("id", repoId);
      if (error) throw new Error(error.message);
    },
  };
}
