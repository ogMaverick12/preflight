"use client";

import React, { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CircleDotDashed,
  GitCommitHorizontal,
  LoaderCircle,
  OctagonX,
  Radar,
  ScanLine,
  X,
} from "lucide-react";

import { getTrustScore, getVerdictMeta, type Verdict } from "@/lib/dashboard/metrics";

export type DashboardCommit = {
  id: string;
  sha: string;
  message: string;
  author: string;
  diffUrl: string;
  receivedAt: string;
  judgment: {
    verdict: Verdict;
    rationale: string;
    intent_match: { summary?: string };
  };
  referenceCheck: { flaggedSymbols: Array<{ name: string; reason: string }> };
  coverageDelta: { explanation: string };
};

type CommitDetail = {
  diffText: string;
};

type LLMProvider = {
  id: "openai" | "gemini" | "grok" | "nvidia-nim" | "openrouter";
  name: string;
};

type LLMModel = {
  id: string;
  name: string;
};

const verdictIcons = {
  check: Check,
  alert: AlertTriangle,
  hold: OctagonX,
};

export function Dashboard({ initialCommits = [] }: { initialCommits?: DashboardCommit[] }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState<string | null>(null);
  const [commits, setCommits] = useState<DashboardCommit[]>(initialCommits);
  const [selectedCommit, setSelectedCommit] = useState<DashboardCommit | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [providerId, setProviderId] = useState<LLMProvider["id"] | "">("");
  const [modelId, setModelId] = useState("");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const isCompactDetail = useCompactDetailPanel();

  const trustScore = useMemo(() => getTrustScore(commits.map((commit) => commit.judgment)), [commits]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/llm/providers", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load configured LLM providers.");
        return response.json() as Promise<{ providers?: LLMProvider[] }>;
      })
      .then(({ providers: providerPayload }) => {
        const availableProviders = Array.isArray(providerPayload) ? providerPayload : [];
        setProviders(availableProviders);
        setProviderId((current) => current && availableProviders.some((provider) => provider.id === current) ? current : availableProviders[0]?.id ?? "");
      })
      .catch((loadError: unknown) => {
        if ((loadError as { name?: string }).name !== "AbortError") setProviderError("Could not load configured LLM providers.");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!providerId) {
      setModels([]);
      setModelId("");
      return;
    }

    const controller = new AbortController();
    setIsLoadingModels(true);
    setProviderError(null);

    fetch(`/api/llm/providers/${providerId}/models`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load provider models.");
        return payload as { models?: LLMModel[] };
      })
      .then(({ models: modelPayload }) => {
        const availableModels = Array.isArray(modelPayload) ? modelPayload : [];
        setModels(availableModels);
        setModelId((current) => current && availableModels.some((model) => model.id === current) ? current : availableModels[0]?.id ?? "");
      })
      .catch((loadError: unknown) => {
        if ((loadError as { name?: string }).name !== "AbortError") {
          setModels([]);
          setModelId("");
          setProviderError(loadError instanceof Error ? loadError.message : "Could not load provider models.");
        }
      })
      .finally(() => setIsLoadingModels(false));

    return () => controller.abort();
  }, [providerId]);

  useEffect(() => {
    if (!selectedCommit) return;

    const controller = new AbortController();
    setDetail(null);
    setIsLoadingDetail(true);

    fetch(`/api/commits/${selectedCommit.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "Could not load the diff.");
        return response.json() as Promise<CommitDetail>;
      })
      .then(setDetail)
      .catch((detailError: unknown) => {
        if ((detailError as { name?: string }).name !== "AbortError") setDetail({ diffText: "Diff unavailable." });
      })
      .finally(() => setIsLoadingDetail(false));

    return () => controller.abort();
  }, [selectedCommit]);

  async function startAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repoUrl.trim() || isAnalyzing) return;
    if (!providerId || !modelId) {
      setError("Choose a configured LLM provider and model before analysis.");
      return;
    }

    setCommits([]);
    setSelectedCommit(null);
    setRepoName(null);
    setError(null);
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, llm: { provider: providerId, model: modelId } }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Can’t reach that repo — check that it is public and try again.");
      }

      await readAnalysisStream(response.body, (eventName, payload) => {
        if (eventName === "repo" && isRepoEvent(payload)) setRepoName(payload.repo.name);
        if (eventName === "commit") {
          const commitEvent = payload as { commit?: Omit<DashboardCommit, "receivedAt"> };
          if (commitEvent.commit) {
            const nextCommit = { ...commitEvent.commit, receivedAt: new Date().toISOString() };
            setCommits((current) => [nextCommit, ...current]);
          }
        }
        if ((eventName === "commit_error" || eventName === "error") && isErrorEvent(payload)) {
          setError(toActionableError(payload.message));
        }
      });
    } catch (analysisError) {
      setError(toActionableError(analysisError instanceof Error ? analysisError.message : "Repository analysis failed."));
    } finally {
      setIsAnalyzing(false);
    }
  }

  function closeDetail() {
    const selectedId = selectedCommit?.id;
    setSelectedCommit(null);
    setDetail(null);
    setIsLoadingDetail(false);

    if (selectedId) requestAnimationFrame(() => tileRefs.current.get(selectedId)?.focus());
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-header" aria-labelledby="dashboard-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><Radar size={18} strokeWidth={1.75} /></span>
          <div>
            <p className="eyebrow">Preflight / Commit Assurance</p>
            <h1 id="dashboard-title">Flight board</h1>
          </div>
        </div>

        <TrustGauge score={trustScore} commitCount={commits.length} isActive={isAnalyzing} />

        <form className="repo-form" onSubmit={startAnalysis}>
          <label htmlFor="repository-url">Public GitHub repository</label>
          <div className="repo-form-row">
            <input
              id="repository-url"
              type="url"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              autoComplete="url"
              required
            />
            <button type="submit" disabled={isAnalyzing || !providerId || !modelId}>
              {isAnalyzing ? <LoaderCircle className="spin" size={17} /> : <ScanLine size={17} />}
              <span>{isAnalyzing ? "Analyzing" : "Analyze"}</span>
            </button>
          </div>
          <div className="llm-picker" aria-label="LLM selection">
            <label>
              LLM provider
              <select value={providerId} onChange={(event) => setProviderId(event.target.value as LLMProvider["id"])} disabled={providers.length === 0}>
                {providers.length === 0 ? <option value="">No configured providers</option> : null}
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </select>
            </label>
            <label>
              Model
              <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!providerId || isLoadingModels || models.length === 0}>
                {!modelId ? <option value="">{isLoadingModels ? "Loading models…" : "No models available"}</option> : null}
                {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>
          </div>
          <p className="repo-status" aria-live="polite">
            {providerError ?? (providers.length === 0 ? "No LLM provider is configured on this server." : isAnalyzing ? "Instrument sweep in progress. Results appear as each check clears." : repoName ?? "Ready for a public repository.")}
          </p>
        </form>
      </section>

      {error ? <div className="error-strip" role="alert"><AlertTriangle size={17} />{error}</div> : null}

      <section className="analysis-grid" aria-label="Repository analysis">
        <section className="timeline-panel" aria-labelledby="timeline-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent history</p>
              <h2 id="timeline-title">Commit timeline</h2>
            </div>
            <span className="commit-count">{commits.length.toString().padStart(2, "0")} logged</span>
          </div>

          {isAnalyzing && commits.length === 0 ? <LoadingTiles /> : null}
          {!isAnalyzing && commits.length === 0 ? <EmptyState /> : null}
          {commits.length > 0 ? (
            <ol className="commit-timeline" aria-label="Analyzed commits">
              {commits.map((commit, index) => (
                <CommitTile
                  key={commit.id}
                  commit={commit}
                  isSelected={selectedCommit?.id === commit.id}
                  index={index}
                  onSelect={() => setSelectedCommit(commit)}
                  tileRef={(node) => {
                    if (node) tileRefs.current.set(commit.id, node);
                    else tileRefs.current.delete(commit.id);
                  }}
                  inlineDetail={isCompactDetail && selectedCommit?.id === commit.id ? (
                    <DetailPanel commit={selectedCommit} detail={detail} isLoading={isLoadingDetail} onClose={closeDetail} className="inline-detail-panel" />
                  ) : null}
                />
              ))}
            </ol>
          ) : null}
        </section>

        {!isCompactDetail ? <DetailPanel commit={selectedCommit} detail={detail} isLoading={isLoadingDetail} onClose={closeDetail} className="desktop-detail-panel" /> : null}
      </section>
    </main>
  );
}

function TrustGauge({ score, commitCount, isActive }: { score: number; commitCount: number; isActive: boolean }) {
  const center = 130;
  const radius = 95;
  const startAngle = -135;
  const endAngle = 135;
  const needleAngle = startAngle + (270 * score) / 100;
  const scoreEnd = polarPoint(center, center, radius, needleAngle);
  const arcStart = polarPoint(center, center, radius, startAngle);
  const arcEnd = polarPoint(center, center, radius, endAngle);
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 1 1 ${arcEnd.x} ${arcEnd.y}`;
  const scorePath = score === 0 ? "" : `M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 ${score > 66.7 ? 1 : 0} 1 ${scoreEnd.x} ${scoreEnd.y}`;

  return (
    <section className="trust-gauge" aria-label={`Aggregate trust score ${score} out of 100`}>
      <svg viewBox="0 0 260 260" role="img" aria-hidden="true">
        <path d={arcPath} className="gauge-track" />
        {scorePath ? <path d={scorePath} className="gauge-value" /> : null}
        {Array.from({ length: 13 }, (_, index) => {
          const angle = startAngle + index * 22.5;
          const outer = polarPoint(center, center, 116, angle);
          const inner = polarPoint(center, center, index % 3 === 0 ? 104 : 109, angle);
          return <line key={angle} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="gauge-tick" />;
        })}
        <line x1={center} y1={center} x2={center} y2="67" className="gauge-needle" transform={`rotate(${needleAngle} ${center} ${center})`} />
        <circle cx={center} cy={center} r="8" className="gauge-hub" />
      </svg>
      <div className="gauge-readout">
        <span className="gauge-score">{score}</span>
        <span className="gauge-label">Trust score</span>
        <span className="gauge-caption">{isActive ? "calculating" : `${commitCount} commit${commitCount === 1 ? "" : "s"}`}</span>
      </div>
    </section>
  );
}

function CommitTile({
  commit,
  isSelected,
  index,
  onSelect,
  tileRef,
  inlineDetail,
}: {
  commit: DashboardCommit;
  isSelected: boolean;
  index: number;
  onSelect: () => void;
  tileRef: (node: HTMLButtonElement | null) => void;
  inlineDetail: ReactNode;
}) {
  const meta = getVerdictMeta(commit.judgment.verdict);
  const VerdictIcon = verdictIcons[meta.icon];

  return (
    <li className="timeline-entry" style={{ "--tile-index": index } as CSSProperties}>
      <button ref={tileRef} type="button" className={`commit-tile ${isSelected ? "is-selected" : ""}`} onClick={onSelect} aria-pressed={isSelected} aria-expanded={isSelected}>
        <span className={`verdict-badge verdict-${commit.judgment.verdict}`}>
          <VerdictIcon size={15} strokeWidth={2.25} aria-hidden="true" />
          <span>{meta.label}</span>
        </span>
        <span className="commit-copy">
          <span className="commit-message">{commit.message}</span>
          <span className="commit-meta"><GitCommitHorizontal size={14} aria-hidden="true" />{commit.sha.slice(0, 7)} · {formatTimestamp(commit.receivedAt)}</span>
        </span>
        <span className="tile-indicator" aria-hidden="true" />
      </button>
      {inlineDetail}
    </li>
  );
}

function DetailPanel({
  commit,
  detail,
  isLoading,
  onClose,
  className = "",
}: {
  commit: DashboardCommit | null;
  detail: CommitDetail | null;
  isLoading: boolean;
  onClose: () => void;
  className?: string;
}) {
  if (!commit) {
    return (
      <aside className={`detail-panel detail-empty ${className}`} aria-label="Commit detail">
        <CircleDotDashed size={30} strokeWidth={1.25} />
        <h2>Select an instrument tile</h2>
        <p>The diff, rationale, and automated checks stay connected here.</p>
      </aside>
    );
  }

  const meta = getVerdictMeta(commit.judgment.verdict);
  const VerdictIcon = verdictIcons[meta.icon];

  return (
    <aside className={`detail-panel ${className}`} aria-label="Selected commit detail">
      <div className="detail-heading">
        <span className={`verdict-badge verdict-${commit.judgment.verdict}`}><VerdictIcon size={15} aria-hidden="true" />{meta.label}</span>
        <span className="detail-actions">
          <span className="detail-sha">{commit.sha.slice(0, 7)}</span>
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close commit detail" title="Close commit detail">
            <X size={16} aria-hidden="true" />
          </button>
        </span>
      </div>
      <h2>{commit.message}</h2>
      <div className="detail-columns">
        <section>
          <p className="detail-label">Why this verdict</p>
          <p className="detail-rationale">{commit.judgment.rationale}</p>
          <p className="detail-label">Coverage delta</p>
          <p className="detail-copy">{commit.coverageDelta.explanation}</p>
          {commit.referenceCheck.flaggedSymbols.length > 0 ? (
            <ul className="flag-list">
              {commit.referenceCheck.flaggedSymbols.map((symbol) => <li key={symbol.name}><code>{symbol.name}</code>{symbol.reason}</li>)}
            </ul>
          ) : null}
        </section>
        <section className="diff-section">
          <p className="detail-label">Diff signal</p>
          <pre>{isLoading ? "Loading diff…" : detail?.diffText ?? "Diff unavailable."}</pre>
        </section>
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Radar size={28} strokeWidth={1.25} aria-hidden="true" />
      <h3>No flights logged yet</h3>
      <p>Paste a public GitHub repository above to begin a preflight check.</p>
    </div>
  );
}

function LoadingTiles() {
  return <div className="loading-tiles" aria-label="Analyzing commits"><span /><span /><span /></div>;
}

function useCompactDetailPanel() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(max-width: 950px)");
    const update = () => setIsCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isCompact;
}

async function readAnalysisStream(stream: ReadableStream<Uint8Array>, onEvent: (eventName: string, payload: Record<string, unknown>) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const eventName = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      if (!eventName || !data) continue;
      onEvent(eventName, JSON.parse(data) as Record<string, unknown>);
    }

    if (done) break;
  }
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: centerX + radius * Math.sin(radians), y: centerY - radius * Math.cos(radians) };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function toActionableError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("schema cache") || normalized.includes("could not find the table")) {
    return "Supabase tables are not set up. Run the migration in supabase/migrations, then try again.";
  }
  if (normalized.includes("rate limit")) return "GitHub’s public API limit is reached. Wait for the reset, then run the check again.";
  if (normalized.includes("public") || normalized.includes("repository") || normalized.includes("not found")) return "Can’t reach that repo — check the URL and confirm it is public.";
  return message;
}

function isRepoEvent(payload: Record<string, unknown>): payload is { repo: { name: string } } {
  return typeof payload.repo === "object" && payload.repo !== null && typeof (payload.repo as { name?: unknown }).name === "string";
}

function isErrorEvent(payload: Record<string, unknown>): payload is { message: string } {
  return typeof payload.message === "string";
}
