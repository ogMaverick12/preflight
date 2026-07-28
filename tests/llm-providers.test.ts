import { afterEach, describe, expect, it, vi } from "vitest";

import {
  judgeCommitWithProvider,
  listProviderModels,
} from "@/lib/llm/providers";

const input = {
  commitMessage: "Fix queue cleanup",
  diffText: "+tail = undefined;",
  referenceCheck: { flaggedSymbols: [] },
  coverageDelta: {
    sourceFiles: ["index.js"],
    testFiles: [],
    uncoveredFiles: ["index.js"],
    explanation: "Source files changed without a matching test file in this commit.",
  },
};

afterEach(() => vi.unstubAllEnvs());

describe("multi-provider LLM adapter", () => {
  it("lists Gemini models through its native server-side models endpoint", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [
        { name: "models/gemini-test", displayName: "Gemini Test", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embed-only", displayName: "Embedding only", supportedGenerationMethods: ["embedContent"] },
      ],
    })));

    await expect(listProviderModels("gemini", fetcher)).resolves.toEqual([
      { id: "gemini-test", name: "Gemini Test" },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com/v1beta/models?key=test-key"),
      expect.any(Object),
    );
  });

  it("sends a JSON-mode judgment request to the selected OpenAI-compatible provider", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        verdict: "review",
        intent_match: { matches: true, explanation: "The cleanup matches the message." },
        rationale: "Review because index.js changes queue cleanup without a matching test update; add a regression test for the empty-queue path.",
      }) } }],
    })));

    await expect(judgeCommitWithProvider(input, { provider: "grok", model: "grok-test" }, fetcher)).resolves.toMatchObject({ verdict: "review" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.x.ai/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"response_format":{"type":"json_object"}'),
      }),
    );
  });
});
