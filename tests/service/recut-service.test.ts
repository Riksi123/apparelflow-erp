import { beforeEach, describe, expect, it, vi } from "vitest";
import { CuttingOrderStatus, UserRole } from "@prisma/client";

const { prismaMock, tx } = vi.hoisted(() => {
  const tx = {
    cuttingOrder: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    verificationItem: { updateMany: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    cuttingOrder: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  return { prismaMock, tx };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { beginRecut, resubmitRecut, CuttingOrderError } from "@/lib/domain/cutting-orders";

const owner = { id: "cut-supervisor", email: "cut@test.local", fullName: "Cutting supervisor", role: UserRole.CUTTING_SUPERVISOR };
const verifier = { ...owner, role: UserRole.CUTTING_VERIFIER };

describe("re-cut service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.cuttingOrder.findUnique.mockResolvedValue({ id: "order-1", createdById: owner.id, status: CuttingOrderStatus.REJECTED });
    tx.cuttingOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.cuttingOrder.findUniqueOrThrow.mockResolvedValue({ id: "order-1", orderNo: "AF-REWORK", status: CuttingOrderStatus.CUTTING_IN_PROGRESS });
    tx.verificationItem.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.cuttingOrder.updateMany.mockResolvedValue({ count: 1 });
  });

  it("returns a rejected order to cutting and clears live counts while retaining audit rows", async () => {
    const result = await beginRecut("order-1", { fabricRollId: "FAB-REWORK", actualFabricYards: 2.25 }, owner);
    expect(result.status).toBe(CuttingOrderStatus.CUTTING_IN_PROGRESS);
    expect(tx.cuttingOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", createdById: owner.id, status: CuttingOrderStatus.REJECTED },
      data: expect.objectContaining({ status: CuttingOrderStatus.CUTTING_IN_PROGRESS, fabricRollId: "FAB-REWORK", actualFabricYards: 2.25 }),
    }));
    expect(tx.verificationItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: "order-1" }, data: { actualQuantity: null, status: null },
    });
  });

  it("does not allow another role to start re-cutting", async () => {
    await expect(beginRecut("order-1", { fabricRollId: "FAB-REWORK", actualFabricYards: 2.25 }, verifier)).rejects.toBeInstanceOf(CuttingOrderError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("resubmits only through the cutting-in-progress state", async () => {
    await resubmitRecut("order-1", owner);
    expect(prismaMock.cuttingOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", createdById: owner.id, status: CuttingOrderStatus.CUTTING_IN_PROGRESS },
      data: { status: CuttingOrderStatus.PENDING_VERIFICATION },
    });
  });
});
