import "server-only";

import { CuttingOrderStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { orderIdSchema } from "@/lib/validation/verification";
import { assertAllowedTransition, sewingQueueFilter } from "@/lib/domain/production-policy";

export class SewingError extends Error {
  constructor(message: string, readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID") {
    super(message);
    this.name = "SewingError";
  }
}

function requireSewingSupervisor(actor: SessionUser) {
  if (actor.role !== UserRole.SEWING_SUPERVISOR) {
    throw new SewingError("Only sewing supervisors can access sewing operations.", "FORBIDDEN");
  }
}

export async function listSewingQueue(actor: SessionUser) {
  requireSewingSupervisor(actor);

  // Keep VERIFIED in the database predicate. Never broaden this query and filter in the UI.
  return prisma.cuttingOrder.findMany({
    where: sewingQueueFilter(),
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      orderNo: true,
      targetQuantity: true,
      fabricRollId: true,
      actualFabricYards: true,
      createdAt: true,
      updatedAt: true,
      recipe: { select: { recipeCode: true, name: true, category: true, standardFabricYards: true, wastageCap: true } },
      createdBy: { select: { fullName: true } },
      verificationItems: {
        orderBy: { component: { componentName: "asc" } },
        select: { expectedQuantity: true, actualQuantity: true, status: true, component: { select: { componentName: true, piecesPerGarment: true } } },
      },
      verificationLogs: {
        where: { decision: "APPROVED" },
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          verifierId: true,
          decision: true,
          componentVariances: true,
          wastagePercent: true,
          createdAt: true,
          verifier: { select: { fullName: true, email: true } },
        },
      },
    },
  });
}

export async function startSewing(orderIdInput: unknown, actor: SessionUser) {
  requireSewingSupervisor(actor);
  const parsedId = orderIdSchema.safeParse(orderIdInput);
  if (!parsedId.success) throw new SewingError("Invalid order ID.", "INVALID");

  return prisma.$transaction(async (tx) => {
    assertAllowedTransition(CuttingOrderStatus.VERIFIED, CuttingOrderStatus.SEWING_IN_PROGRESS);
    const transition = await tx.cuttingOrder.updateMany({
      where: { id: parsedId.data, status: CuttingOrderStatus.VERIFIED },
      data: { status: CuttingOrderStatus.SEWING_IN_PROGRESS },
    });
    if (transition.count !== 1) {
      const order = await tx.cuttingOrder.findUnique({ where: { id: parsedId.data }, select: { id: true } });
      if (!order) throw new SewingError("Order not found.", "NOT_FOUND");
      throw new SewingError("Only verified orders can start sewing.", "CONFLICT");
    }
    return tx.cuttingOrder.findUniqueOrThrow({
      where: { id: parsedId.data },
      select: { id: true, orderNo: true, status: true, updatedAt: true },
    });
  }, { isolationLevel: "Serializable" });
}
