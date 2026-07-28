# Preflight Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the instrument-panel dashboard that starts repository analysis and progressively presents analyzed commits and aggregate trust.

**Architecture:** Keep pure trust-score, verdict metadata, and color-contrast logic in `lib/dashboard/metrics.ts` so it can be unit tested. Use one client dashboard component to parse the SSE response from `POST /api/repos`, update local commit state as events arrive, and compose a hand-rolled SVG dial, input surface, state panels, and timeline tiles.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, `next/font`, Lucide React, Vitest.

## Global Constraints

- Use IBM Plex Mono for data/header labels and IBM Plex Sans for body copy.
- Use `#0A0D12` background, green clear, contrast-tested amber review, red hold, and sparing cyan active accent.
- Never encode a verdict with color alone: every tile has an icon and exact label.
- Honor `prefers-reduced-motion` for the sole staggered power-on sequence.
- Keep the gauge a 270-degree SVG dial with ticks and needle, not a generic ring.

---

### Task 1: Dashboard data helpers

**Files:**
- Create: `lib/dashboard/metrics.ts`
- Create: `tests/dashboard-metrics.test.ts`

**Interfaces:**
- Produces `getTrustScore(commits: VerdictRecord[]): number`, `getVerdictMeta(verdict)`, and `contrastRatio(foreground, background)` for the UI.

- [ ] **Step 1: Write the failing test**

```ts
expect(getTrustScore([{ verdict: "clear" }, { verdict: "review" }, { verdict: "hold" }])).toBe(50);
expect(getVerdictMeta("review").label).toBe("Review");
expect(contrastRatio("#FBBF24", "#0A0D12")).toBeGreaterThanOrEqual(4.5);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard-metrics.test.ts`
Expected: FAIL because `@/lib/dashboard/metrics` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export const verdictMetadata = {
  clear: { label: "Clear", weight: 100 },
  review: { label: "Review", weight: 55 },
  hold: { label: "Hold", weight: 10 },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dashboard-metrics.test.ts`
Expected: PASS.

### Task 2: Instrument dashboard

**Files:**
- Create: `components/dashboard.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`

**Interfaces:**
- Consumes `getTrustScore`, `getVerdictMeta`, and SSE events from `POST /api/repos`.
- Produces an accessible dashboard with SVG `TrustGauge`, a repository form, loading/empty/error states, and interactive timeline tiles.

- [ ] **Step 1: Write the failing test**

```ts
expect(getVerdictMeta("hold")).toMatchObject({ label: "Hold", icon: "octagon" });
```

- [ ] **Step 2: Implement the client composition**

```tsx
<form onSubmit={startAnalysis}>
  <input aria-label="Public GitHub repository URL" />
  <button type="submit">Analyze</button>
</form>
<TrustGauge score={trustScore} />
<ol aria-label="Analyzed commits">{commits.map(renderInstrumentTile)}</ol>
```

- [ ] **Step 3: Verify the dashboard**

Run: `npm run lint && npm run build`
Expected: PASS with the dashboard page rendered by Next.js.

### Task 3: Visual and accessibility verification

**Files:**
- Modify: `components/dashboard.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Keeps verdict label and Lucide icon visible at every viewport width.

- [ ] **Step 1: Start the local server and inspect desktop/mobile rendering**

Run: `npm run dev`
Expected: dashboard renders a gauge, input, empty state, and tiles without overflow.

- [ ] **Step 2: Confirm contrast and reduced motion support**

Run: `npx vitest run tests/dashboard-metrics.test.ts && npm run lint`
Expected: amber against graphite is at least 4.5:1 and checks pass.
