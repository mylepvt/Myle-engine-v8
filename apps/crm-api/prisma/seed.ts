import { LedgerDirection, PipelineKind, LeadStage } from "@prisma/client";
import { prisma } from "../src/db.js";

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@crm.local" },
    update: {},
    create: {
      email: "admin@crm.local",
      name: "Admin",
      role: "admin",
    },
  });
  const team = await prisma.user.upsert({
    where: { email: "team@crm.local" },
    update: {},
    create: {
      email: "team@crm.local",
      name: "Team",
      role: "team",
    },
  });
  await prisma.walletLedger.upsert({
    where: { idempotencyKey: "seed_credit_team" },
    update: {},
    create: {
      userId: team.id,
      direction: LedgerDirection.CREDIT,
      amountCents: 500_00,
      idempotencyKey: "seed_credit_team",
      note: "seed",
    },
  });
  const existing = await prisma.lead.findFirst({ where: { name: "Seed Pool Lead", inPool: true } });
  if (!existing) {
    await prisma.lead.create({
      data: {
        name: "Seed Pool Lead",
        pipelineKind: PipelineKind.TEAM,
        stage: LeadStage.NEW,
        ownerId: admin.id,
        inPool: true,
        handlerId: null,
      },
    });
  }
  console.log("Seed OK — users:", { admin: admin.id, team: team.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
