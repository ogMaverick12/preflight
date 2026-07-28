import { fetchPublicRepoCommit } from "@/lib/github/ingestion";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("commits")
      .select("id, sha, message, author, diff_url, analyzed_at, analyses(verdict, reference_check, intent_match, coverage_delta, rationale), repos(github_url)")
      .eq("id", params.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return Response.json({ error: "Commit not found." }, { status: 404 });
      throw error;
    }
    if (!data) return Response.json({ error: "Commit not found." }, { status: 404 });

    const repository = Array.isArray(data.repos) ? data.repos[0] : data.repos;
    if (!repository?.github_url) throw new Error("The commit is missing its GitHub repository.");

    const commit = await fetchPublicRepoCommit(repository.github_url, data.sha);
    return Response.json({ commit: data, diffText: commit.diffText });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load commit details." },
      { status: 500 },
    );
  }
}
