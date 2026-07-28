import { describe, expect, it } from "vitest";

import { toActionableError } from "@/components/dashboard";

describe("dashboard errors", () => {
  it("explains how to repair a missing Supabase schema", () => {
    expect(toActionableError("Could not find the table 'public.repos' in the schema cache")).toBe(
      "Supabase tables are not set up. Run the migration in supabase/migrations, then try again.",
    );
  });
});
