/** Lead-level escalation ladder (worker-driven; CLOSED only via API). */
export const LeadEscalationLevel = {
  NONE: "NONE",
  WARNING: "WARNING",
  REASSIGNED: "REASSIGNED",
  ADMIN: "ADMIN",
} as const;

export type LeadEscalationLevelValue = (typeof LeadEscalationLevel)[keyof typeof LeadEscalationLevel];
