import { describe, expect, it } from "vitest";
import { LeadStage } from "@prisma/client";
import { LeadEscalationLevel } from "../domain/lead-escalation.js";
import { journeyResetUpdateData, REASSIGN_RESET_STAGE } from "./full-journey-reset.js";

/** Unit coverage for reset-based reassign (handler swap + funnel reset) without DB. */
describe("full journey reset (reassign)", () => {
  it("pins stage to configurable INVITED default and clears tracking fields", () => {
    const patch = journeyResetUpdateData("handler_b");
    expect(patch.handlerId).toBe("handler_b");
    expect(patch.stage).toBe(REASSIGN_RESET_STAGE);
    expect(REASSIGN_RESET_STAGE).toBe(LeadStage.INVITED);
    expect(patch.leadScore).toBe(0);
    expect(patch.highIntent).toBe(false);
    expect(patch.videoWatchPct).toBeNull();
    expect(patch.mindsetLockStartedAt).toBeNull();
    expect(patch.mindsetLockCompletedAt).toBeNull();
    expect(patch.mindsetLockBlocked).toBe(false);
    expect(patch.aliveWarnedAt).toBeNull();
    expect(patch.aliveLeaderNotifiedAt).toBeNull();
    expect(patch.aliveAdminEscalatedAt).toBeNull();
    expect(patch.escalationLevel).toBe(LeadEscalationLevel.NONE);
    expect(patch.reassignedCount).toEqual({ increment: 1 });
    expect(patch.stageVersion).toEqual({ increment: 1 });
    expect(patch.lastActivityAt).toBeInstanceOf(Date);
  });

  it("marks auto worker reassign as REASSIGNED escalation", () => {
    const patch = journeyResetUpdateData("handler_b", { autoReassign: true });
    expect(patch.escalationLevel).toBe(LeadEscalationLevel.REASSIGNED);
  });
});
