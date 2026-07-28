import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("commits")
      .select("id, sha, message, author, diff_url, analyzed_at, analyses(verdict, reference_check, intent_match, coverage_delta, rationale)")
      .eq("repo_id", params.id)
      .order("analyzed_at", { ascending: false, nullsFirst: true });

    if (error) throw error;
    return Response.json({ commits: data ?? [] });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load repository commits." },
      { status: 500 },
    );
  }
}
