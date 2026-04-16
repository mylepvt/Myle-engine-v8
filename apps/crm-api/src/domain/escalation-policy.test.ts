import { describe, expect, it } from "vitest";
import { teamMayAcknowledgeEscalation } from "./escalation-policy.js";

describe("escalation policy (queues / non-dismissable alive rows)", () => {
  it("blocks team ack on alive_engine + mandatoryReview", () => {
    expect(
      teamMayAcknowledgeEscalation("team", { mandatoryReview: true, source: "alive_engine" }),
    ).toBe(false);
  });

  it("allows leader ack on alive_engine mandatory", () => {
    expect(
      teamMayAcknowledgeEscalation("leader", { mandatoryReview: true, source: "alive_engine" }),
    ).toBe(true);
  });

  it("allows admin ack on alive_engine mandatory", () => {
    expect(
      teamMayAcknowledgeEscalation("admin", { mandatoryReview: true, source: "alive_engine" }),
    ).toBe(true);
  });

  it("allows team ack on manual escalations", () => {
    expect(teamMayAcknowledgeEscalation("team", { mandatoryReview: false, source: "manual" })).toBe(
      true,
    );
  });

  it("allows team when mandatoryReview but not alive_engine", () => {
    expect(teamMayAcknowledgeEscalation("team", { mandatoryReview: true, source: "manual" })).toBe(
      true,
    );
  });
});
