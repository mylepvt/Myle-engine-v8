import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { LeadStage, LedgerDirection, PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { systemReassignStaleLeadCore } from "../services/lead-execution.service.js";
import { walletBalanceCents } from "../services/wallet.service.js";
import { claimBatchFromPool, claimFromPool } from "../services/pool-claim.service.js";

const RUN = Boolean(process.env.CRM_INTEGRATION_DATABASE_URL || process.env.DATABASE_URL);

describe.skipIf(!RUN)("CRM integration: reassign + wallet idempotency", () => {
  let ownerId: string;
  let h1: string;
  let h2: string;
  let leadReassignId: string;
  let poolUserId: string;
  let poolLeadId: string;

  beforeAll(async () => {
    const u1 = await prisma.user.create({
      data: { email: `int_owner_${Date.now()}@t.local`, role: "leader", name: "O" },
    });
    const u2 = await prisma.user.create({
      data: { email: `int_h1_${Date.now()}@t.local`, role: "team", name: "H1" },
    });
    const u3 = await prisma.user.create({
      data: { email: `int_h2_${Date.now()}@t.local`, role: "team", name: "H2" },
    });
    const pu = await prisma.user.create({
      data: { email: `int_pool_${Date.now()}@t.local`, role: "team", name: "P" },
    });
    ownerId = u1.id;
    h1 = u2.id;
    h2 = u3.id;
    poolUserId = pu.id;

    const lr = await prisma.lead.create({
      data: {
        name: "Int reassign",
        pipelineKind: PipelineKind.TEAM,
        ownerId,
        handlerId: h1,
        inPool: false,
        stage: LeadStage.DAY2_ADMIN,
        lastActivityAt: new Date(Date.now() - 49 * 3600000),
      },
    });
    leadReassignId = lr.id;
    await prisma.callSession.create({
      data: { leadId: leadReassignId, startedAt: new Date(), durationSec: 10 },
    });
    await prisma.walletLedger.create({
      data: {
        userId: h1,
        direction: LedgerDirection.CREDIT,
        amountCents: 10_000,
        idempotencyKey: `int_credit_${leadReassignId}`,
        note: "test",
      },
    });

    const pl = await prisma.lead.create({
      data: {
        name: "Pool L",
        pipelineKind: PipelineKind.TEAM,
        ownerId: poolUserId,
        inPool: true,
        stage: LeadStage.NEW,
      },
    });
    poolLeadId = pl.id;
    await prisma.walletLedger.create({
      data: {
        userId: poolUserId,
        direction: LedgerDirection.CREDIT,
        amountCents: 500_000,
        idempotencyKey: `pool_seed_${poolLeadId}`,
        note: "seed",
      },
    });
  });

  afterAll(async () => {
    await prisma.leadAssignment.deleteMany({ where: { leadId: { in: [leadReassignId, poolLeadId] } } });
    await prisma.leadActivity.deleteMany({ where: { leadId: { in: [leadReassignId, poolLeadId] } } });
    await prisma.callSession.deleteMany({ where: { leadId: leadReassignId } });
    await prisma.walletLedger.deleteMany({
      where: {
        OR: [
          { leadId: { in: [leadReassignId, poolLeadId] } },
          { userId: { in: [h1, h2, poolUserId] } },
        ],
      },
    });
    await prisma.lead.deleteMany({ where: { id: { in: [leadReassignId, poolLeadId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, h1, h2, poolUserId] } } });
  });

  it("auto reassign: handler, stage reset, tracking cleared, owner unchanged, wallet unchanged", async () => {
    const balBefore = await walletBalanceCents(h1);
    const ownerBefore = (await prisma.lead.findUniqueOrThrow({ where: { id: leadReassignId } })).ownerId;

    await systemReassignStaleLeadCore(leadReassignId, h2, undefined, { minIdleMs: 48 * 3600000 });

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadReassignId } });
    expect(lead.handlerId).toBe(h2);
    expect(lead.ownerId).toBe(ownerBefore);
    expect(lead.stage).toBe(LeadStage.INVITED);
    expect(lead.reassignedCount).toBeGreaterThanOrEqual(1);
    expect(await prisma.callSession.count({ where: { leadId: leadReassignId } })).toBe(0);
    expect(await walletBalanceCents(h1)).toBe(balBefore);
  });

  it("pool claim duplicate idempotency key does not double-debit", async () => {
    const key = `idem_${poolLeadId}_${poolUserId}`;
    const b0 = await walletBalanceCents(poolUserId);
    await claimFromPool(
      { id: poolUserId, role: "team", email: "p@t.local" },
      { leadId: poolLeadId, idempotencyKey: key, pipelineKind: PipelineKind.TEAM },
      undefined,
    );
    const b1 = await walletBalanceCents(poolUserId);
    await claimFromPool(
      { id: poolUserId, role: "team", email: "p@t.local" },
      { leadId: poolLeadId, idempotencyKey: key, pipelineKind: PipelineKind.TEAM },
      undefined,
    );
    const b2 = await walletBalanceCents(poolUserId);
    expect(b1).toBe(b2);
    expect(b0 - b1).toBeGreaterThan(0);
  });

  it("pool batch claim debits combined FIFO price in one transaction", async () => {
    const buyer = await prisma.user.create({
      data: { email: `batch_buyer_${Date.now()}@t.local`, role: "team", name: "BatchBuyer" },
    });
    const t0 = new Date("2020-01-01T00:00:00.000Z");
    const t1 = new Date("2020-01-02T00:00:00.000Z");
    const la = await prisma.lead.create({
      data: {
        name: "Batch A",
        pipelineKind: PipelineKind.TEAM,
        ownerId: buyer.id,
        inPool: true,
        poolPriceCents: 1000,
        stage: LeadStage.NEW,
        createdAt: t0,
      },
    });
    const lb = await prisma.lead.create({
      data: {
        name: "Batch B",
        pipelineKind: PipelineKind.TEAM,
        ownerId: buyer.id,
        inPool: true,
        poolPriceCents: 2000,
        stage: LeadStage.NEW,
        createdAt: t1,
      },
    });
    await prisma.walletLedger.create({
      data: {
        userId: buyer.id,
        direction: LedgerDirection.CREDIT,
        amountCents: 500_000,
        idempotencyKey: `batch_seed_${la.id}_${lb.id}`,
        note: "seed",
      },
    });
    const before = await walletBalanceCents(buyer.id);
    const out = await claimBatchFromPool(
      { id: buyer.id, role: "team", email: buyer.email },
      { count: 2, idempotencyKey: `batch_idem_${Date.now()}`, pipelineKind: PipelineKind.TEAM },
      undefined,
    );
    expect(out.leads).toHaveLength(2);
    expect(out.totalPriceCents).toBe(3000);
    expect(before - (await walletBalanceCents(buyer.id))).toBe(3000);
    const aFresh = await prisma.lead.findUniqueOrThrow({ where: { id: la.id } });
    expect(aFresh.inPool).toBe(false);
    expect(aFresh.ownerId).toBe(buyer.id);

    await prisma.leadAssignment.deleteMany({ where: { leadId: { in: [la.id, lb.id] } } });
    await prisma.leadActivity.deleteMany({ where: { leadId: { in: [la.id, lb.id] } } });
    await prisma.walletLedger.deleteMany({
      where: { OR: [{ leadId: { in: [la.id, lb.id] } }, { userId: buyer.id }] },
    });
    await prisma.lead.deleteMany({ where: { id: { in: [la.id, lb.id] } } });
    await prisma.user.delete({ where: { id: buyer.id } });
  });
});
