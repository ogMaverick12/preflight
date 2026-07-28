export type Verdict = "clear" | "review" | "hold";

const verdictMetadata = {
  clear: { label: "Clear", icon: "check", color: "#4ADE80", weight: 100 },
  review: { label: "Review", icon: "alert", color: "#FBBF24", weight: 50 },
  hold: { label: "Hold", icon: "hold", color: "#EF4444", weight: 0 },
} as const;

export function getVerdictMeta(verdict: Verdict) {
  return verdictMetadata[verdict];
}

export function getTrustScore(commits: Array<{ verdict: Verdict }>): number {
  if (commits.length === 0) return 0;

  const total = commits.reduce((sum, commit) => sum + getVerdictMeta(commit.verdict).weight, 0);
  return Math.round(total / commits.length);
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error("Expected a six-digit hex color.");

  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
