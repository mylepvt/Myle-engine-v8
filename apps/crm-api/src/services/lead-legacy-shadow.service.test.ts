import { describe, expect, it } from "vitest";
import { LeadStage } from "@prisma/client";
import { deriveShadowStageFromLegacy, shouldApplyLegacyShadowVersion } from "./lead-legacy-shadow.service.js";

describe("deriveShadowStageFromLegacy", () => {
  it("keeps early funnel statuses at the closest CRM shadow stage", () => {
    expect(deriveShadowStageFromLegacy({ legacyStatus: "new_lead", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.NEW);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "contacted", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.NEW);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "invited", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.INVITED);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "invited", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: "2026-04-20T10:00:00Z" })).toBe(LeadStage.WHATSAPP_SENT);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "video_watched", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.VIDEO_SENT);
  });

  it("splits paid into payment done vs mindset vs day1 handoff", () => {
    expect(deriveShadowStageFromLegacy({ legacyStatus: "paid", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.PAYMENT_DONE);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "paid", mindsetLockState: "mindset_lock", day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.MINDSET_LOCK);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "paid", mindsetLockState: "leader_assigned", day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.DAY1_UPLINE);
  });

  it("maps day and close-side statuses to later CRM stages", () => {
    expect(deriveShadowStageFromLegacy({ legacyStatus: "day2", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.DAY2_ADMIN);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "day2", mindsetLockState: null, day3CompletedAt: "2026-04-20T10:00:00Z", whatsappSentAt: null })).toBe(LeadStage.DAY3_CLOSER);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "interview", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.DAY3_CLOSER);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "converted", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.CLOSED);
    expect(deriveShadowStageFromLegacy({ legacyStatus: "lost", mindsetLockState: null, day3CompletedAt: null, whatsappSentAt: null })).toBe(LeadStage.CLOSED);
  });
});

describe("shouldApplyLegacyShadowVersion", () => {
  it("accepts only strictly newer versions", () => {
    expect(shouldApplyLegacyShadowVersion(0, 1)).toBe(true);
    expect(shouldApplyLegacyShadowVersion(4, 4)).toBe(false);
    expect(shouldApplyLegacyShadowVersion(4, 3)).toBe(false);
  });
});
