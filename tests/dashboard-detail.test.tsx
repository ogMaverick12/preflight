// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dashboard, type DashboardCommit } from "@/components/dashboard";

const commit: DashboardCommit = {
  id: "commit-1",
  sha: "abc1234def",
  message: "Fix flight controls",
  author: "Ada",
  diffUrl: "https://github.com/example/repo/commit/abc1234def",
  receivedAt: "2026-07-28T09:00:00Z",
  judgment: { verdict: "review", rationale: "The change needs a second look.", intent_match: {} },
  referenceCheck: { flaggedSymbols: [] },
  coverageDelta: { explanation: "Source changed without a matching test." },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commit detail panel", () => {
  it("opens from a timeline tile and returns focus to that tile on close", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ diffText: "+ const ready = true;" }),
    }));
    const user = userEvent.setup();

    render(<Dashboard initialCommits={[commit]} />);

    const tile = screen.getByRole("button", { name: /fix flight controls/i });
    await user.click(tile);

    expect(await screen.findByText("The change needs a second look.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close commit detail" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close commit detail" }));

    expect(screen.queryByRole("button", { name: "Close commit detail" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(tile));
  });
});
