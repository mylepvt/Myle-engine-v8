/**
 * Alive-engine and other mandatory escalations must not be dismissable by team-only ack.
 * Used by POST /escalations/:id/ack — keep rules in one place for tests and audits.
 */
export function teamMayAcknowledgeEscalation(
  role: string,
  esc: { mandatoryReview: boolean; source: string },
): boolean {
  if (esc.mandatoryReview && esc.source === "alive_engine" && role === "team") {
    return false;
  }
  return true;
}
