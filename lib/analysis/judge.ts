import type { CoverageDeltaResult, ReferenceCheckResult } from "@/lib/analysis/heuristics";

export type CommitVerdict = "clear" | "review" | "hold";

export interface CommitJudgment {
  verdict: CommitVerdict;
  intent_match: {
    matches: boolean;
    explanation: string;
  };
  rationale: string;
}

export interface JudgeCommitInput {
  commitMessage: string;
  diffText: string;
  referenceCheck: ReferenceCheckResult;
  coverageDelta: CoverageDeltaResult;
}

interface JudgeClient {
  responses: {
    create: (request: unknown) => Promise<{ output_text: string }>;
  };
}

export const JUDGE_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "preflight_commit_judgment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      verdict: { type: "string", enum: ["clear", "review", "hold"] },
      intent_match: {
        type: "object",
        additionalProperties: false,
        properties: {
          matches: { type: "boolean" },
          explanation: { type: "string" },
        },
        required: ["matches", "explanation"],
      },
      rationale: { type: "string" },
    },
    required: ["verdict", "intent_match", "rationale"],
  },
} as const;

export const JUDGE_SYSTEM_PROMPT = `You are Preflight, a conservative code-change reviewer. Judge one commit using only the commit message, diff, and heuristic results supplied by the application.

Return the required JSON object only.

Verdict rules:
- clear: the diff plausibly matches its stated intent and has no material, evidence-backed concern.
- review: there is ambiguity, an incomplete scan, missing test coverage for changed source, or another concern that merits a human check but is not strong evidence of a harmful change.
- hold: the diff materially conflicts with its stated intent, introduces a likely correctness or safety problem, or has multiple concrete concerns that make shipping it without review unsafe.

Interpret the heuristic results carefully:
- "not found in scanned files" means the scan is incomplete; never state that a symbol definitely does not exist.
- Missing tests are a risk signal, not proof that the change is broken.
- Do not claim tests, builds, runtime behavior, repository history, or files not present in the supplied evidence were inspected.

For intent_match, state whether the supplied diff supports the commit message and name the concrete evidence.

For rationale, write one paragraph of at most two sentences and 55 words. Lead with the verdict reason, cite the most relevant file, behavior, or heuristic finding, and end with the specific next action when review is needed. Avoid generic phrases such as "looks good", "needs attention", or "consider adding tests" without naming what warrants that action.`;

export async function judgeCommitWithClient(
  input: JudgeCommitInput,
  client: JudgeClient,
): Promise<CommitJudgment> {
  const response = await client.responses.create({
    model: "gpt-5-mini",
    temperature: 0.2,
    input: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          commit_message: input.commitMessage,
          diff: input.diffText,
          reference_check: input.referenceCheck,
          coverage_delta: input.coverageDelta,
        }),
      },
    ],
    text: { format: JUDGE_RESPONSE_FORMAT },
  });

  return parseCommitJudgment(response.output_text);
}

export function parseCommitJudgment(output: string): CommitJudgment {
  try {
    const value: unknown = JSON.parse(output);

    if (
      !isRecord(value) ||
      !isVerdict(value.verdict) ||
      !isRecord(value.intent_match) ||
      typeof value.intent_match.matches !== "boolean" ||
      typeof value.intent_match.explanation !== "string" ||
      typeof value.rationale !== "string"
    ) {
      throw new Error("Invalid response shape");
    }

    return {
      verdict: value.verdict,
      intent_match: {
        matches: value.intent_match.matches,
        explanation: value.intent_match.explanation,
      },
      rationale: value.rationale,
    };
  } catch {
    throw new Error("OpenAI returned an invalid commit judgment.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVerdict(value: unknown): value is CommitVerdict {
  return value === "clear" || value === "review" || value === "hold";
}
