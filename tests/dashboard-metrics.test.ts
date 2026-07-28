import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  getTrustScore,
  getVerdictMeta,
  type Verdict,
} from "@/lib/dashboard/metrics";

describe("dashboard metrics", () => {
  it("averages clear, review, and hold verdicts into a trust score", () => {
    const commits: Array<{ verdict: Verdict }> = [
      { verdict: "clear" },
      { verdict: "review" },
      { verdict: "hold" },
    ];

    expect(getTrustScore(commits)).toBe(50);
  });

  it("provides an explicit label and icon name for every verdict", () => {
    expect(getVerdictMeta("clear")).toMatchObject({ label: "Clear", icon: "check" });
    expect(getVerdictMeta("review")).toMatchObject({ label: "Review", icon: "alert" });
    expect(getVerdictMeta("hold")).toMatchObject({ label: "Hold", icon: "hold" });
  });

  it("keeps the instrument amber legible against the graphite background", () => {
    expect(contrastRatio("#FBBF24", "#0A0D12")).toBeGreaterThanOrEqual(4.5);
  });
});
