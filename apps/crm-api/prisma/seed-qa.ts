/**
 * QA dataset: ~18 TEAM leads + qa-* users. Run after migrate:
 *   cd apps/crm-api && CRM_QA_LAB=true npx tsx prisma/seed-qa.ts
 * Copy printed IDs into crm-web `/qa` or use bootstrap API.
 */
import { LeadStage, LedgerDirection, PipelineKind } from "@prisma/client";
import { prisma } from "../src/db.js";

const CREDIT = 2_000_000; // cents — enough for many pool claims (~19600 each)

async function upsertUser(email: string, name: string, role: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { email, name, role },
  });
}

async function creditWallet(userId: string, key: string) {
  await prisma.walletLedger.upsert({
    where: { idempotencyKey: key },
    update: {},
    create: {
      userId,
      direction: LedgerDirection.CREDIT,
      amountCents: CREDIT,
      idempotencyKey: key,
      note: "qa_seed",
    },
  });
}

async function main() {
  const admin = await upsertUser("qa-admin@crm.local", "QA Admin", "admin");
  const leader = await upsertUser("qa-leader@crm.local", "QA Leader", "leader");
  const t1 = await upsertUser("qa-t1@crm.local", "QA Team 1", "team");
  const t2 = await upsertUser("qa-t2@crm.local", "QA Team 2", "team");
  const t3 = await upsertUser("qa-t3@crm.local", "QA Team 3", "team");

  for (const [u, k] of [
    [t1.id, "qa_credit_t1"],
    [t2.id, "qa_credit_t2"],
    [t3.id, "qa_credit_t3"],
  ] as const) {
    await creditWallet(u, k);
  }

  const existingQa = await prisma.lead.count({ where: { name: { startsWith: "QA " } } });
  if (existingQa > 0) {
    console.log(`QA leads already present (${existingQa}). Skip lead creation. Users:`, {
      admin: admin.id,
      leader: leader.id,
      t1: t1.id,
      t2: t2.id,
      t3: t3.id,
    });
    return;
  }

  const poolBase = Array.from({ length: 15 }, (_, i) => ({
    name: `QA Pool ${i + 1}`,
    pipelineKind: PipelineKind.TEAM,
    stage: LeadStage.NEW,
    ownerId: leader.id,
    inPool: true,
    handlerId: null as string | null,
  }));

  const special = [
    {
      name: "QA FSM Bad",
      pipelineKind: PipelineKind.TEAM,
      stage: LeadStage.NEW,
      ownerId: leader.id,
      inPool: false,
      handlerId: t1.id,
    },
    {
      name: "QA Reassign",
      pipelineKind: PipelineKind.TEAM,
      stage: LeadStage.INVITED,
      ownerId: leader.id,
      inPool: false,
      handlerId: t1.id,
    },
    {
      name: "QA Stale Idle",
      pipelineKind: PipelineKind.TEAM,
      stage: LeadStage.DAY2_ADMIN,
      ownerId: leader.id,
      inPool: false,
      handlerId: t2.id,
    },
    {
      name: "QA Close Me",
      pipelineKind: PipelineKind.TEAM,
      stage: LeadStage.DAY3_CLOSER,
      ownerId: leader.id,
      inPool: false,
      handlerId: t3.id,
    },
    {
      name: "QA Wallet Chain",
      pipelineKind: PipelineKind.TEAM,
      stage: LeadStage.INVITED,
      ownerId: leader.id,
      inPool: false,
      handlerId: t1.id,
    },
  ];

  for (const p of poolBase) {
    await prisma.lead.create({ data: { ...p, lastActivityAt: new Date() } });
  }
  for (const s of special) {
    await prisma.lead.create({
      data: {
        name: s.name,
        pipelineKind: s.pipelineKind,
        stage: s.stage,
        ownerId: s.ownerId,
        inPool: s.inPool,
        handlerId: s.handlerId,
        lastActivityAt:
          s.name === "QA Stale Idle"
            ? new Date(Date.now() - 50 * 3600000)
            : new Date(),
      },
    });
  }

  console.log("seed-qa OK — users:", {
    admin: admin.id,
    leader: leader.id,
    qa_t1: t1.id,
    qa_t2: t2.id,
    qa_t3: t3.id,
  });
  console.log("Enable CRM_QA_LAB=true on crm-api, open http://localhost:4001/qa");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
