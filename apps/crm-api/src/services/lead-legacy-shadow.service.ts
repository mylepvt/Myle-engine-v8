import { LeadStage, PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";

export type LegacyShadowSyncInput = {
  legacyId: number;
  name: string;
  phone?: string | null;
  pipelineKind?: PipelineKind;
  legacyStatus: string;
  stage?: LeadStage;
  whatsappSentAt?: string | null;
  paymentStatus?: string | null;
  mindsetLockState?: string | null;
  mindsetStartedAt?: string | null;
  mindsetCompletedAt?: string | null;
  day1CompletedAt?: string | null;
  day2CompletedAt?: string | null;
  day3CompletedAt?: string | null;
  version: number;
  idempotencyKey: string;
  deleted?: boolean;
  deletedAt?: string | null;
  permanentlyDeleted?: boolean;
};

export const LEGACY_SHADOW_USER_ID = "legacy-shadow";
const LEGACY_SHADOW_EMAIL = "legacy-shadow@internal.local";

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function shouldApplyLegacyShadowVersion(
  existingVersion: number | null | undefined,
  incomingVersion: number,
): boolean {
  return incomingVersion > (existingVersion ?? 0);
}

export function deriveShadowStageFromLegacy(
  input: Pick<LegacyShadowSyncInput, "legacyStatus" | "mindsetLockState" | "day3CompletedAt" | "whatsappSentAt">,
): LeadStage {
  const legacyStatus = (input.legacyStatus || "").trim();

  if (legacyStatus === "converted" || legacyStatus === "lost") {
    return LeadStage.CLOSED;
  }
  if (
    legacyStatus === "interview" ||
    legacyStatus === "track_selected" ||
    legacyStatus === "seat_hold" ||
    legacyStatus === "training" ||
    legacyStatus === "plan_2cc" ||
    legacyStatus === "level_up" ||
    legacyStatus === "pending"
  ) {
    return LeadStage.DAY3_CLOSER;
  }
  if (legacyStatus === "day2") {
    return input.day3CompletedAt ? LeadStage.DAY3_CLOSER : LeadStage.DAY2_ADMIN;
  }
  if (legacyStatus === "day1") {
    return LeadStage.DAY1_UPLINE;
  }
  if (legacyStatus === "paid") {
    if (input.mindsetLockState === "leader_assigned") return LeadStage.DAY1_UPLINE;
    if (input.mindsetLockState === "mindset_lock") return LeadStage.MINDSET_LOCK;
    return LeadStage.PAYMENT_DONE;
  }
  if (legacyStatus === "video_sent" || legacyStatus === "video_watched") {
    return LeadStage.VIDEO_SENT;
  }
  if (legacyStatus === "invited") {
    return input.whatsappSentAt ? LeadStage.WHATSAPP_SENT : LeadStage.INVITED;
  }
  return LeadStage.NEW;
}

async function ensureLegacyShadowUser() {
  return prisma.user.upsert({
    where: { id: LEGACY_SHADOW_USER_ID },
    update: {},
    create: {
      id: LEGACY_SHADOW_USER_ID,
      email: LEGACY_SHADOW_EMAIL,
      name: "Legacy Shadow",
      role: "admin",
      active: true,
      teamId: "legacy-shadow",
    },
  });
}

function shadowMutationData(input: LegacyShadowSyncInput, stage: LeadStage) {
  const deletedAt = parseDate(input.deletedAt) ?? (input.deleted ? new Date() : null);
  return {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    pipelineKind: input.pipelineKind ?? PipelineKind.TEAM,
    stage: input.deleted ? LeadStage.CLOSED : stage,
    legacyStatus: input.legacyStatus.trim(),
    legacyWhatsappSentAt: parseDate(input.whatsappSentAt),
    legacyPaymentStatus: input.paymentStatus?.trim() || null,
    legacyMindsetLockState: input.mindsetLockState?.trim() || null,
    legacyMindsetStartedAt: parseDate(input.mindsetStartedAt),
    legacyMindsetCompletedAt: parseDate(input.mindsetCompletedAt),
    legacyDay1CompletedAt: parseDate(input.day1CompletedAt),
    legacyDay2CompletedAt: parseDate(input.day2CompletedAt),
    legacyDay3CompletedAt: parseDate(input.day3CompletedAt),
    legacyVersion: input.version,
    legacyIdempotencyKey: input.idempotencyKey,
    legacyDeletedAt: input.deleted ? deletedAt : null,
    legacySyncedAt: new Date(),
    isShadow: true,
    inPool: false,
    handlerId: null,
    closedAt: input.deleted ? deletedAt : null,
    closedById: null,
  };
}

export async function syncLeadLegacyShadow(input: LegacyShadowSyncInput) {
  const owner = await ensureLegacyShadowUser();
  const stage = input.stage ?? deriveShadowStageFromLegacy(input);
  const data = shadowMutationData(input, stage);

  const existing = await prisma.lead.findUnique({
    where: { legacyId: input.legacyId },
    select: {
      id: true,
      isShadow: true,
      legacyVersion: true,
      legacyIdempotencyKey: true,
    },
  });

  if (existing) {
    if (!existing.isShadow) {
      throw new Error(`Lead ${existing.id} with legacyId ${input.legacyId} is not a shadow lead`);
    }
    if (!shouldApplyLegacyShadowVersion(existing.legacyVersion, input.version)) {
      return prisma.lead.findUniqueOrThrow({ where: { id: existing.id } });
    }
    return prisma.lead.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.lead.create({
    data: {
      legacyId: input.legacyId,
      ownerId: owner.id,
      ...data,
    },
  });
}

export async function deleteLeadLegacyShadow(legacyId: number) {
  const existing = await prisma.lead.findUnique({
    where: { legacyId },
    select: { id: true, isShadow: true, legacyVersion: true },
  });
  if (!existing || !existing.isShadow) {
    return null;
  }
  const nextVersion = (existing.legacyVersion ?? 0) + 1;
  return prisma.lead.update({
    where: { id: existing.id },
    data: {
      stage: LeadStage.CLOSED,
      inPool: false,
      handlerId: null,
      legacyDeletedAt: new Date(),
      legacyVersion: nextVersion,
      legacyIdempotencyKey: `legacy-shadow-delete-${legacyId}-v${nextVersion}`,
      legacySyncedAt: new Date(),
      isShadow: true,
    },
  });
}
