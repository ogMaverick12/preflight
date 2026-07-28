import { getConfiguredProviders } from "@/lib/llm/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ providers: getConfiguredProviders() });
}
