import { describe, expect, it } from "vitest";
import { LeadStage } from "@prisma/client";
import {
  assertDayRoutingNotBypassed,
  assertMindsetLockGate,
  isValidTransition,
  nextStage,
  resolveFsmTransition,
} from "./fsm.js";

describe("FSM", () => {
  it("advances NEW -> INVITED on INVITE_SENT", () => {
    const r = nextStage(LeadStage.NEW, "INVITE_SENT");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.to).toBe(LeadStage.INVITED);
      expect(isValidTransition(LeadStage.NEW, r.to)).toBe(true);
    }
  });

  it("rejects illegal transition", () => {
    const r = nextStage(LeadStage.NEW, "DAY1_DONE");
    expect(r.ok).toBe(false);
  });

  it("blocks invalid stage jump", () => {
    expect(isValidTransition(LeadStage.NEW, LeadStage.DAY1_UPLINE)).toBe(false);
  });

  it("mindset gate blocks day work before lock", () => {
    expect(() => assertMindsetLockGate(LeadStage.MINDSET_LOCK, "DAY1_DONE")).toThrow();
  });

  it("day routing bypass blocked from wrong stage", () => {
    expect(() => assertDayRoutingNotBypassed(LeadStage.DAY2_ADMIN, "DAY1_DONE")).toThrow();
  });

  it("resolveFsmTransition is the single API path — legal chain", () => {
    expect(resolveFsmTransition(LeadStage.NEW, "INVITE_SENT")).toBe(LeadStage.INVITED);
    expect(resolveFsmTransition(LeadStage.PAYMENT_DONE, "MINDSET_START")).toBe(LeadStage.MINDSET_LOCK);
    expect(resolveFsmTransition(LeadStage.MINDSET_LOCK, "MINDSET_COMPLETE")).toBe(LeadStage.DAY1_UPLINE);
  });

  it("resolveFsmTransition rejects skips", () => {
    expect(() => resolveFsmTransition(LeadStage.NEW, "WHATSAPP_SENT")).toThrow();
  });
});
