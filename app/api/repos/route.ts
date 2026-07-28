import { formatServerSentEvent } from "@/lib/api/sse";
import { GitHubIngestionError, parsePublicGitHubRepoUrl } from "@/lib/github/ingestion";
import { analyzeRecentRepo } from "@/lib/pipeline/analyze-repo";
import { createAnalyzeRepoDependencies } from "@/lib/pipeline/runtime";
import { parseLLMSelection } from "@/lib/llm/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const repoUrl = body && typeof body.repoUrl === "string" ? body.repoUrl : "";
  let selection;

  try {
    parsePublicGitHubRepoUrl(repoUrl);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Enter a public GitHub repository URL." },
      { status: error instanceof GitHubIngestionError ? 400 : 500 },
    );
  }

  try {
    selection = parseLLMSelection(body?.llm);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Choose a configured LLM provider and model before analysis." },
      { status: 400 },
    );
  }

  let dependencies;
  try {
    dependencies = createAnalyzeRepoDependencies(selection);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to start repository analysis." },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatServerSentEvent(event, data)));
      };

      try {
        for await (const event of analyzeRecentRepo(
          { repoUrl, limit: 20, concurrency: 2 },
          dependencies,
        )) {
          send(event.type, event);
        }
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Repository analysis failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
