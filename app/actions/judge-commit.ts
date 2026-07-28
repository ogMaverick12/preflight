"use server";

import {
  type CommitJudgment,
  type JudgeCommitInput,
} from "@/lib/analysis/judge";
import { judgeCommitOnServer } from "@/lib/analysis/judge-server";

export async function judgeCommit(input: JudgeCommitInput): Promise<CommitJudgment> {
  return judgeCommitOnServer(input);
}
