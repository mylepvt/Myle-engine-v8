import { LeadStage, PipelineKind } from "@prisma/client";

export type FsmEvent =
  | "INVITE_SENT"
  | "WHATSAPP_SENT"
  | "VIDEO_SENT"
  | "PAYMENT_DONE"
  | "MINDSET_START"
  | "MINDSET_COMPLETE"
  | "DAY1_DONE"
  | "DAY2_DONE"
  | "DAY3_DONE"
  | "CLOSE_WON";

export const FSM_EVENT_VALUES = [
  "INVITE_SENT",
  "WHATSAPP_SENT",
  "VIDEO_SENT",
  "PAYMENT_DONE",
  "MINDSET_START",
  "MINDSET_COMPLETE",
  "DAY1_DONE",
  "DAY2_DONE",
  "DAY3_DONE",
  "CLOSE_WON",
] as const;

/**
 * Canonical funnel (API / docs labels map to Prisma `LeadStage`):
 * NEW → INVITED → WHATSAPP_SENT → VIDEO_SENT → PAYMENT_DONE → MINDSET_LOCK →
 * DAY1_UPLINE → DAY2_ADMIN → DAY3_CLOSER → CLOSED
 */
const EDGES: Array<{ from: LeadStage; event: FsmEvent; to: LeadStage }> = [
  { from: LeadStage.NEW, event: "INVITE_SENT", to: LeadStage.INVITED },
  { from: LeadStage.INVITED, event: "WHATSAPP_SENT", to: LeadStage.WHATSAPP_SENT },
  { from: LeadStage.WHATSAPP_SENT, event: "VIDEO_SENT", to: LeadStage.VIDEO_SENT },
  { from: LeadStage.VIDEO_SENT, event: "PAYMENT_DONE", to: LeadStage.PAYMENT_DONE },
  { from: LeadStage.PAYMENT_DONE, event: "MINDSET_START", to: LeadStage.MINDSET_LOCK },
  { from: LeadStage.MINDSET_LOCK, event: "MINDSET_COMPLETE", to: LeadStage.DAY1_UPLINE },
  { from: LeadStage.DAY1_UPLINE, event: "DAY1_DONE", to: LeadStage.DAY2_ADMIN },
  { from: LeadStage.DAY2_ADMIN, event: "DAY2_DONE", to: LeadStage.DAY3_CLOSER },
  { from: LeadStage.DAY3_CLOSER, event: "DAY3_DONE", to: LeadStage.CLOSED },
  { from: LeadStage.DAY3_CLOSER, event: "CLOSE_WON", to: LeadStage.CLOSED },
];

const LEGAL_STAGE_PAIRS = new Set(EDGES.map((e) => pairKey(e.from, e.to)));

function pairKey(from: LeadStage, to: LeadStage) {
  return `${from}|${to}`;
}

/** Hard gate: only edges defined in the FSM table may execute (no jumps). */
export function isValidTransition(currentStage: LeadStage, nextStage: LeadStage): boolean {
  return LEGAL_STAGE_PAIRS.has(pairKey(currentStage, nextStage));
}

const DAY_EVENTS = new Set<FsmEvent>(["DAY1_DONE", "DAY2_DONE", "DAY3_DONE"]);

const DAY_STAGE_FOR_EVENT: Partial<Record<FsmEvent, LeadStage>> = {
  DAY1_DONE: LeadStage.DAY1_UPLINE,
  DAY2_DONE: LeadStage.DAY2_ADMIN,
  DAY3_DONE: LeadStage.DAY3_CLOSER,
};

export function assertDayRoutingNotBypassed(currentStage: LeadStage, event: FsmEvent) {
  if (!DAY_EVENTS.has(event)) return;
  const mustBeAt = DAY_STAGE_FOR_EVENT[event];
  if (mustBeAt && currentStage !== mustBeAt) {
    throw fsmError("FSM_DAY_ROUTING_BLOCKED", "Invalid day transition for current stage", 409);
  }
}

export function assertMindsetLockGate(currentStage: LeadStage, event: FsmEvent) {
  if (currentStage === LeadStage.MINDSET_LOCK && event !== "MINDSET_COMPLETE") {
    throw fsmError("FSM_MINDSET_INCOMPLETE", "Complete mindset lock before continuing", 409);
  }
  if (currentStage === LeadStage.PAYMENT_DONE && DAY_EVENTS.has(event)) {
    throw fsmError("FSM_MINDSET_REQUIRED", "Start and complete mindset lock before day stages", 409);
  }
}

export function nextStage(from: LeadStage, event: FsmEvent): { ok: true; to: LeadStage } | { ok: false; code: string } {
  const edge = EDGES.find((e) => e.from === from && e.event === event);
  if (!edge) return { ok: false, code: "FSM_ILLEGAL_TRANSITION" };
  return { ok: true, to: edge.to };
}

/**
 * Single entry for API transitions — all stage moves must pass this (no bypass).
 */
export function resolveFsmTransition(currentStage: LeadStage, event: FsmEvent): LeadStage {
  assertMindsetLockGate(currentStage, event);
  assertDayRoutingNotBypassed(currentStage, event);
  const res = nextStage(currentStage, event);
  if (!res.ok) throw fsmError(res.code, "Illegal transition", 409);
  if (!isValidTransition(currentStage, res.to)) {
    throw fsmError("INVALID_STAGE_JUMP", "Invalid stage transition", 400);
  }
  return res.to;
}

export function enforceDayPipeline(_kind: PipelineKind, _ctx: Record<string, unknown>) {
  /* Hook for upline/admin/closer assignment checks — extend with user graph */
}

export type TransitionInput = {
  leadId: string;
  event: FsmEvent;
  expectedVersion: number;
};

export function optimisticVersionMatch(rowVersion: number, expected: number): boolean {
  return rowVersion === expected;
}

export function fsmError(code: string, message: string, statusCode: number = 409) {
  return Object.assign(new Error(message), { statusCode, code });
}
