// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  cleanup();
  vi.unstubAllGlobals();
});

describe("commit detail panel", () => {
  it("opens from a timeline tile and returns focus to that tile on close", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/llm/providers")) {
        return Promise.resolve({ ok: true, json: async () => ({ providers: [] }) });
      }
      if (url.includes("/api/commits/")) {
        return Promise.resolve({ ok: true, json: async () => ({ diffText: "+ const ready = true;" }) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
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

  it("loads the selected provider's models into the model dropdown", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/llm/providers")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ providers: [{ id: "grok", name: "xAI Grok" }] }),
        });
      }
      if (url.endsWith("/api/llm/providers/grok/models")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ models: [{ id: "grok-test", name: "Grok Test" }] }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }));

    render(<Dashboard />);

    expect(await screen.findByRole("option", { name: "xAI Grok" })).toBeTruthy();
    expect(await screen.findByRole("option", { name: "Grok Test" })).toBeTruthy();
    expect((screen.getByLabelText("LLM provider") as HTMLSelectElement).value).toBe("grok");
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("grok-test");
  });
});
