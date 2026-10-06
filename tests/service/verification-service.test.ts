import { beforeEach, describe, expect, it, vi } from "vitest";
import { CuttingOrderStatus, UserRole, VerificationDecision } from "@prisma/client";

const { prismaMock, transactionClient, pendingOrder } = vi.hoisted(() => {
  const pendingOrder = {
    id: "order-1",
    orderNo: "AF-TEST0000001",
    targetQuantity: 2,
    actualFabricYards: "3.96",
    status: "PENDING_VERIFICATION",
    recipe: {
      standardFabricYards: "1.8",
      components: [
        { id: "front", componentName: "Front panel", piecesPerGarment: 1 },
        { id: "cuffs", componentName: "Cuffs", piecesPerGarment: 2 },
      ],
    },
    verificationItems: [
      { componentId: "front", actualQuantity: 2, component: { piecesPerGarment: 1 } },
      { componentId: "cuffs", actualQuantity: 4, component: { piecesPerGarment: 2 } },
    ],
  };
  const transactionClient = {
    cuttingOrder: { findUnique: vi.fn(), updateMany: vi.fn() },
    verificationItem: { update: vi.fn(), upsert: vi.fn() },
    verificationLog: { create: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)),
    cuttingOrder: { findMany: vi.fn() },
  };
  return { prismaMock, transactionClient, pendingOrder, };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { approveVerification, rejectVerification, VerificationError } from "@/lib/domain/verification";
import { listSewingQueue } from "@/lib/domain/sewing";

const verifier = { id: "verifier-1", email: "verifier@test.local", fullName: "Verifier", role: UserRole.CUTTING_VERIFIER };
const supervisor = { id: "supervisor-1", email: "supervisor@test.local", fullName: "Supervisor", role: UserRole.CUTTING_SUPERVISOR };

describe("verification service gatekeeper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingOrder.status = CuttingOrderStatus.PENDING_VERIFICATION;
    pendingOrder.verificationItems = [
      { componentId: "front", actualQuantity: 2, component: { piecesPerGarment: 1 } },
      { componentId: "cuffs", actualQuantity: 4, component: { piecesPerGarment: 2 } },
    ];
    transactionClient.cuttingOrder.findUnique.mockResolvedValue(pendingOrder);
    transactionClient.cuttingOrder.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.verificationLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("approves exact counts, calculates wastage, and stores verifier audit atomically", async () => {
    const result = await approveVerification("order-1", verifier);
    expect(result.status).toBe(CuttingOrderStatus.VERIFIED);
    expect(result.wastagePercent).toBeCloseTo(10);
    expect(transactionClient.cuttingOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", status: CuttingOrderStatus.PENDING_VERIFICATION },
      data: { status: CuttingOrderStatus.VERIFIED },
    }));
    expect(transactionClient.verificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        verifierId: verifier.id,
        decision: VerificationDecision.APPROVED,
        wastagePercent: 10,
        componentVariances: expect.arrayContaining([
          expect.objectContaining({ componentId: "front", expectedQuantity: 2, actualQuantity: 2, variance: 0 }),
        ]),
      }),
    }));
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("rejects approval when any component is RED and writes no audit or transition", async () => {
    pendingOrder.verificationItems[0].actualQuantity = 1;
    await expect(approveVerification("order-1", verifier)).rejects.toMatchObject({ code: "INVALID" });
    expect(transactionClient.cuttingOrder.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.verificationLog.create).not.toHaveBeenCalled();
  });

  it("rejects missing physical counts", async () => {
    (pendingOrder.verificationItems[1] as { actualQuantity: number | null }).actualQuantity = null;
    await expect(approveVerification("order-1", verifier)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("returns forbidden to non-verifiers before starting a transaction", async () => {
    await expect(approveVerification("order-1", supervisor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects empty or whitespace rejection reasons", async () => {
    await expect(rejectVerification("order-1", { reason: "   " }, verifier)).rejects.toBeInstanceOf(VerificationError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects decisions for an order in the wrong state", async () => {
    pendingOrder.status = CuttingOrderStatus.REJECTED;
    await expect(approveVerification("order-1", verifier)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(transactionClient.cuttingOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe("sewing queue database isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries only VERIFIED rows and rejects other roles", async () => {
    prismaMock.cuttingOrder.findMany.mockResolvedValue([]);
    await listSewingQueue({ ...verifier, role: UserRole.SEWING_SUPERVISOR });
    expect(prismaMock.cuttingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: CuttingOrderStatus.VERIFIED },
    }));
    await expect(listSewingQueue(verifier)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prismaMock.cuttingOrder.findMany).toHaveBeenCalledTimes(1);
  });
});
