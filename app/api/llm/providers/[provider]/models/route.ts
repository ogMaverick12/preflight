import { isLLMProviderId, listProviderModels } from "@/lib/llm/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { provider: string } }) {
  if (!isLLMProviderId(params.provider)) return Response.json({ error: "Unknown LLM provider." }, { status: 404 });

  try {
    const models = await listProviderModels(params.provider);
    return Response.json({ models });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load provider models." },
      { status: 500 },
    );
  }
}
