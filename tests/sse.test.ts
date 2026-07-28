import { describe, expect, it } from "vitest";

import { formatServerSentEvent } from "@/lib/api/sse";

describe("formatServerSentEvent", () => {
  it("formats one named JSON event at a time", () => {
    expect(formatServerSentEvent("commit", { sha: "abc123", verdict: "review" })).toBe(
      'event: commit\ndata: {"sha":"abc123","verdict":"review"}\n\n',
    );
  });
});
