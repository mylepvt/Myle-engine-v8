import { describe, expect, it } from "vitest";
import { LeadStage } from "@prisma/client";
import { legacyStatusForStage } from "./lead-stage-legacy-status.js";

describe("legacyStatusForStage", () => {
  it("keeps mindset and day handoff stages aligned with FastAPI statuses", () => {
    expect(legacyStatusForStage(LeadStage.MINDSET_LOCK)).toBe("mindset_lock");
    expect(legacyStatusForStage(LeadStage.DAY1_UPLINE)).toBe("day1");
    expect(legacyStatusForStage(LeadStage.DAY2_ADMIN)).toBe("day2");
  });

  it("preserves the rest of the funnel writeback mappings", () => {
    expect(legacyStatusForStage(LeadStage.NEW)).toBe("new_lead");
    expect(legacyStatusForStage(LeadStage.PAYMENT_DONE)).toBe("paid");
    expect(legacyStatusForStage(LeadStage.DAY3_CLOSER)).toBe("track_selected");
    expect(legacyStatusForStage(LeadStage.CLOSED)).toBe("converted");
  });
});
