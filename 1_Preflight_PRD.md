# Preflight — Product Requirements Document
**ChatGPT Codex India Hackathon 2026 — Theme 5: Building Evals**

## One-line pitch

Preflight watches every change an AI coding agent makes, runs it through a battery of automated checks, and gives each commit a clear, explained verdict — **Clear / Review / Hold** — before it ships. Built by Codex. Point it at Codex's own commit history during the hackathon week, and it audits its own creator, live.

## 1. Problem

Agentic coding tools ship code fast — Codex alone is used by millions of developers weekly — but speed creates a trust gap. A generated diff can look completely plausible and still: silently break something outside the file it touched, do something the commit message doesn't actually describe, or reference a function/import that was never defined anywhere in the codebase. Right now the only real defense is reading every line yourself, which defeats the point of delegating to an agent in the first place. OpenAI shipping a dedicated security-review agent for Codex is itself a signal that this is a live, recognized problem — not a hypothetical one invented for a hackathon.

## 2. Who this is for

Solo developers and small teams who've started letting agents like Codex make real commits, and want a fast, explained signal on which changes they can trust versus which ones need a human to actually look — before merge, not after something breaks.

## 3. What Preflight does (MVP scope)

1. **Connect a repo.** Paste a public GitHub repo URL. Preflight pulls recent commits and their diffs.
2. **Analyze each commit** through four checks:
   - *Reference check* — does the diff use functions, imports, or symbols that don't exist anywhere else in the repo? (Catches the classic agentic-coding failure of inventing a plausible-sounding API.)
   - *Intent match* — does the diff actually do what the commit message / stated plan says it does? Flags scope creep and unrelated changes bundled into one commit.
   - *Coverage delta* — did this commit touch logic without touching any corresponding test file?
   - *LLM judge pass* — a structured verdict (Clear / Review / Hold) with a one-paragraph rationale a human can read in five seconds.
3. **Show the trail.** A timeline of every analyzed commit with its verdict, and a detail view with diff + rationale side by side.
4. **Aggregate trust score.** One number for the whole repo: how much of this codebase's recent history would you trust without re-reading it yourself.

## 4. Explicitly out of scope for the hackathon build

Cut on purpose, not by accident — say so if asked, it reads as discipline, not a gap:

- Actually executing the repo's test suite in a sandbox (real security surface plus infra time, neither worth it this week — the three checks above get most of the signal without running untrusted code)
- Real-time GitHub webhook monitoring (pull-based "analyze on demand" ships the same core value with a fraction of the infra risk)
- Multi-repo accounts, auth, teams, billing
- Non-GitHub version control

Frame these as "Phase 2" in the demo narrative and the project doc — intentional scoping reads well; silence about gaps doesn't.

## 5. Primary user flow

1. Land on Preflight → paste a public repo URL → hit Analyze.
2. Watch commits populate the timeline with verdicts as they process — don't make the user wait silently for the whole batch.
3. Click a commit → see the diff, flagged concerns (if any), and the rationale.
4. See the aggregate trust score at the top, updating live as more commits finish.

## 6. Success criteria — mapped directly to how this gets judged

- **Viability gate:** deployed link opens with no login; analyzing a real public repo returns real verdicts end to end; repo matches the demo. Nothing else matters if this fails.
- **Technical Execution (50%):** the analysis pipeline has to be real — actually parsing diffs and calling a model for structured output, not a canned response. Commit history has to show genuine, incremental, Codex-driven work.
- **Impact & Problem Fit (20%):** the problem statement has to survive a skeptical read. It does, because it's the same problem OpenAI is visibly investing in for Codex itself.
- **Use of Codex (15%):** every phase in the build sequence includes a planning step and a self-review step. Keep the commit trail granular enough that this is visible without you having to explain it.
- **Creativity & Originality (10%):** the self-referential hook — Preflight analyzing its own hackathon build, live — is the one thing judges will remember. Open the demo with it, don't bury it.
- **Completeness & Demo (5%):** the 3-minute demo should show Codex making a real commit, then Preflight scoring that exact commit, in the same video.

## 7. Risks

| Risk | Mitigation |
|---|---|
| GitHub API rate limits on unauthenticated calls | Cache analyzed commits in Supabase so repeat views don't re-fetch; accept an optional personal access token later if needed |
| LLM judge cost/latency on larger repos | Cap default analysis to the most recent ~20 commits; make the cap configurable |
| False positives feel harsh ("Hold" on something that's actually fine) | Frame verdicts as "flagged for review," not "broken" — the rationale is the product, not the badge |
| Scope creep mid-week | Section 4 exists for exactly this — check any new idea against it before adding it |
