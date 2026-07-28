import { describe, expect, it } from "vitest";

import {
  JUDGE_RESPONSE_FORMAT,
  JUDGE_SYSTEM_PROMPT,
  judgeCommitWithClient,
} from "@/lib/analysis/judge";

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

describe("judgeCommitWithClient", () => {
  it("sends the commit and heuristic evidence to GPT-5 Mini with the strict response schema", async () => {
    let request: unknown;
    const client = {
      responses: {
        create: async (value: unknown) => {
          request = value;
          return {
            output_text: JSON.stringify({
              verdict: "review",
              intent_match: { matches: true, explanation: "The cleanup matches the commit message." },
              rationale: "Review because index.js changes queue cleanup without a corresponding test update; add a regression test for the empty-queue path.",
            }),
          };
        },
      },
    };

    await expect(judgeCommitWithClient(input, client)).resolves.toEqual({
      verdict: "review",
      intent_match: { matches: true, explanation: "The cleanup matches the commit message." },
      rationale: "Review because index.js changes queue cleanup without a corresponding test update; add a regression test for the empty-queue path.",
    });
    expect(request).toMatchObject({
      model: "gpt-5-mini",
      temperature: 0.2,
      text: { format: JUDGE_RESPONSE_FORMAT },
    });
    expect(request).toMatchObject({
      input: expect.arrayContaining([
        expect.objectContaining({ role: "system", content: JUDGE_SYSTEM_PROMPT }),
        expect.objectContaining({ role: "user", content: expect.stringContaining("Fix queue cleanup") }),
      ]),
    });
  });

  it("rejects a response that does not meet the verdict contract", async () => {
    const client = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({ verdict: "ship", rationale: "Looks good." }),
        }),
      },
    };

    await expect(judgeCommitWithClient(input, client)).rejects.toThrow(
      "OpenAI returned an invalid commit judgment.",
    );
  });
});
