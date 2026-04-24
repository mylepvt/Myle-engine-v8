import { LeadStage } from "@prisma/client";

export const STAGE_TO_LEGACY_STATUS: Partial<Record<LeadStage, string>> = {
  NEW: "new_lead",
  INVITED: "invited",
  WHATSAPP_SENT: "contacted",
  VIDEO_SENT: "video_sent",
  PAYMENT_DONE: "paid",
  MINDSET_LOCK: "mindset_lock",
  DAY1_UPLINE: "day1",
  DAY2_ADMIN: "day2",
  DAY3_CLOSER: "track_selected",
  CLOSED: "converted",
};

export function legacyStatusForStage(stage: LeadStage): string | undefined {
  return STAGE_TO_LEGACY_STATUS[stage];
}
