# Preflight — Technical Requirements Document

## 1. Stack

- **Frontend/backend:** Next.js 14 (App Router), TypeScript, Tailwind CSS — matches your existing stack, fastest path to a working Vercel deploy.
- **Database:** Supabase (Postgres) — persists analyzed commits so the dashboard isn't re-analyzing on every view.
- **Repo data:** GitHub REST API via Octokit, unauthenticated for public repos (add an optional personal-access-token input later if rate limits become a problem).
- **LLM judge layer:** OpenAI API, **GPT-5 Mini** as the default model for the structured verdict calls — good reasoning-to-cost ratio for a judgment task like this. Drop to **GPT-5 Nano** if you need to conserve credits; it's cheap enough to run per-commit at scale. Keep this call server-side only (API route or Server Action) — the key must never reach the client.
- **Deployment:** Vercel, per hackathon rules — no login wall on the deployed link.

## 2. Data model

```
repos
  id, github_url, name, created_at, last_analyzed_at

commits
  id, repo_id (fk), sha, message, author, diff_url, analyzed_at

analyses
  id, commit_id (fk),
  verdict            enum: clear | review | hold
  reference_check    jsonb — flagged symbols + explanation
  intent_match       jsonb — bool + explanation
  coverage_delta     jsonb — touched files without corresponding tests
  rationale          text
  raw_model_output   jsonb  -- keep this; useful for the demo and for debugging
```

## 3. Analysis pipeline

For each commit:

1. Fetch the diff via the GitHub API.
2. **Reference check (heuristic, no LLM call):** extract identifiers referenced in the added lines (function calls, imports); check whether each resolves elsewhere in the repo's visible file tree (via the GitHub API's contents/search endpoints) or is a well-known stdlib/package symbol. Flag anything that resolves to neither. Cheap, fast, and catches a real class of agentic hallucination without a model call.
3. **Coverage delta (heuristic):** if a source file changed and no file matching a test naming convention (`*.test.*`, `*.spec.*`, `__tests__/*`) changed in the same commit, flag it.
4. **LLM judge call:** send the diff, commit message, and the results of steps 2–3 to the model. Force structured JSON output (verdict, per-check explanation, one-paragraph rationale). This is the step that judges whether the diff actually does what it claims — heuristics alone can't catch that.
5. Persist the result and render immediately. Don't block the UI on the whole batch finishing.

## 4. API routes

- `POST /api/repos` — register a repo, kick off analysis of its recent commits
- `GET /api/repos/:id/commits` — list analyzed commits + verdicts for the timeline
- `GET /api/commits/:id` — full detail (diff + rationale) for the detail panel
- `POST /api/repos/:id/refresh` — pull any new commits since last analysis

## 5. The self-review loop (this is the part that scores)

Every phase in the build-prompt sequence asks Codex to do three things, in order: state a short plan before touching code, implement it, then re-read its own diff against the plan and fix anything that doesn't match — including running whatever tests exist. Don't skip the third step under time pressure. It's the single most legible piece of evidence for "genuine agentic usage," and it also just produces better code.

## 6. Known technical risks

| Risk | Mitigation |
|---|---|
| Unauthenticated GitHub API rate limit (60 req/hr) | Cache aggressively in Supabase; analyze on-demand rather than polling |
| LLM judge gives inconsistent verdicts on similar diffs | Pin `temperature` low (~0.2) for the judge call — it's classification, not creative writing |
| Reference-check heuristic false-positives on symbols from files outside what was fetched | Frame output as "not found in scanned files," not "doesn't exist" — accurate framing beats a fragile 100%-precision heuristic |
| Demo repo has no interesting flagged commits to show the "catches real issues" story | Deliberately leave 1–2 rougher early Codex commits in the history instead of squashing everything clean — they become the demo's best moment |
