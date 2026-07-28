import "server-only";

import OpenAI from "openai";

import {
  judgeCommitWithClient,
  type CommitJudgment,
  type JudgeCommitInput,
} from "@/lib/analysis/judge";

export async function judgeCommitOnServer(input: JudgeCommitInput): Promise<CommitJudgment> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI is not configured. Set OPENAI_API_KEY in .env.local.");
  }

  const openai = new OpenAI({ apiKey });
  return judgeCommitWithClient(input, {
    responses: {
      create: async (request) => {
        const response = await openai.responses.create(request as never);
        return { output_text: response.output_text };
      },
    },
  });
}
