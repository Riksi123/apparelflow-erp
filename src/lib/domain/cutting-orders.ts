import "server-only";

import { randomUUID } from "node:crypto";
import { CuttingOrderStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCuttingOrderSchema, cuttingOrderIdSchema, recutOrderSchema } from "@/lib/validation/cutting-order";
import type { SessionUser } from "@/lib/auth/session";
import { assertAllowedTransition, expectedComponentQuantity } from "@/lib/domain/production-policy";

export class CuttingOrderError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT",
  ) {
    super(message);
    this.name = "CuttingOrderError";
  }
}

export async function beginRecut(orderIdInput: unknown, input: unknown, actor: SessionUser) {
  if (actor.role !== UserRole.CUTTING_SUPERVISOR) {
    throw new CuttingOrderError("Only cutting supervisors can return a batch for re-cutting.", "FORBIDDEN");
  }
  const id = cuttingOrderIdSchema.safeParse(orderIdInput);
  const parsed = recutOrderSchema.safeParse(input);
  if (!id.success || !parsed.success) throw new CuttingOrderError("Re-cut details are invalid.", "INVALID_INPUT");

  return prisma.$transaction(async (tx) => {
    const order = await tx.cuttingOrder.findUnique({ where: { id: id.data }, select: { id: true, createdById: true, status: true } });
    if (!order) throw new CuttingOrderError("Order not found.", "NOT_FOUND");
    if (order.createdById !== actor.id) throw new CuttingOrderError("You can only re-cut your own orders.", "FORBIDDEN");
    if (order.status !== CuttingOrderStatus.REJECTED) throw new CuttingOrderError("Only rejected orders can be re-cut.", "CONFLICT");
    assertAllowedTransition(order.status, CuttingOrderStatus.CUTTING_IN_PROGRESS);

    const transition = await tx.cuttingOrder.updateMany({
      where: { id: order.id, createdById: actor.id, status: CuttingOrderStatus.REJECTED },
      data: {
        status: CuttingOrderStatus.CUTTING_IN_PROGRESS,
        fabricRollId: parsed.data.fabricRollId,
        actualFabricYards: parsed.data.actualFabricYards,
      },
    });
    if (transition.count !== 1) throw new CuttingOrderError("Order state changed; reload and try again.", "CONFLICT");

    await tx.verificationItem.updateMany({
      where: { orderId: order.id },
      data: { actualQuantity: null, status: null },
    });
    return tx.cuttingOrder.findUniqueOrThrow({ where: { id: order.id }, select: { id: true, orderNo: true, status: true } });
  }, { isolationLevel: "Serializable" });
}

export async function resubmitRecut(orderIdInput: unknown, actor: SessionUser) {
  if (actor.role !== UserRole.CUTTING_SUPERVISOR) {
    throw new CuttingOrderError("Only cutting supervisors can submit a re-cut batch.", "FORBIDDEN");
  }
  const id = cuttingOrderIdSchema.safeParse(orderIdInput);
  if (!id.success) throw new CuttingOrderError("Invalid order ID.", "INVALID_INPUT");

  assertAllowedTransition(CuttingOrderStatus.CUTTING_IN_PROGRESS, CuttingOrderStatus.PENDING_VERIFICATION);

  const transition = await prisma.cuttingOrder.updateMany({
    where: { id: id.data, createdById: actor.id, status: CuttingOrderStatus.CUTTING_IN_PROGRESS },
    data: { status: CuttingOrderStatus.PENDING_VERIFICATION },
  });
  if (transition.count !== 1) {
    const order = await prisma.cuttingOrder.findUnique({ where: { id: id.data }, select: { createdById: true, status: true } });
    if (!order) throw new CuttingOrderError("Order not found.", "NOT_FOUND");
    if (order.createdById !== actor.id) throw new CuttingOrderError("You can only submit your own orders.", "FORBIDDEN");
    throw new CuttingOrderError("Only an order in re-cutting can be submitted for verification.", "CONFLICT");
  }
}

export async function createCuttingOrder(input: unknown, actor: SessionUser) {
  if (actor.role !== UserRole.CUTTING_SUPERVISOR) {
    throw new CuttingOrderError("Only cutting supervisors can create cutting orders.", "FORBIDDEN");
  }

  const parsed = createCuttingOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new CuttingOrderError("The cutting order details are invalid.", "INVALID_INPUT");
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: parsed.data.recipeId },
    include: { components: { orderBy: { componentName: "asc" } } },
  });
  if (!recipe) throw new CuttingOrderError("Recipe not found.", "NOT_FOUND");
  if (recipe.components.length === 0) {
    throw new CuttingOrderError("The selected recipe has no components.", "INVALID_INPUT");
  }

  assertAllowedTransition(CuttingOrderStatus.CUTTING_IN_PROGRESS, CuttingOrderStatus.PENDING_VERIFICATION);
  const orderNo = `AF-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.cuttingOrder.create({
      data: {
        orderNo,
        recipeId: recipe.id,
        targetQuantity: parsed.data.targetQuantity,
        fabricRollId: parsed.data.fabricRollId,
        actualFabricYards: parsed.data.actualFabricYards,
        status: CuttingOrderStatus.PENDING_VERIFICATION,
        createdById: actor.id,
        verificationItems: {
          create: recipe.components.map((component) => ({
            componentId: component.id,
            expectedQuantity: expectedComponentQuantity(parsed.data.targetQuantity, component.piecesPerGarment),
          })),
        },
      },
      include: {
        recipe: { select: { recipeCode: true, name: true } },
        verificationItems: {
          include: { component: { select: { componentName: true, piecesPerGarment: true } } },
        },
      },
    });
    return created;
  });

  return order;
}

export async function listCuttingOrders(actor: SessionUser) {
  if (actor.role !== UserRole.CUTTING_SUPERVISOR) {
    throw new CuttingOrderError("Only cutting supervisors can view cutting orders.", "FORBIDDEN");
  }

  return prisma.cuttingOrder.findMany({
    where: { createdById: actor.id },
    orderBy: { createdAt: "desc" },
    include: {
      recipe: { select: { recipeCode: true, name: true, category: true } },
      verificationLogs: {
        where: { decision: "REJECTED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { rejectionNote: true, createdAt: true, verifier: { select: { fullName: true } } },
      },
      _count: { select: { verificationItems: true } },
    },
  });
}

export async function listAvailableRecipes(actor: SessionUser) {
  if (actor.role !== UserRole.CUTTING_SUPERVISOR) {
    throw new CuttingOrderError("Only cutting supervisors can view recipes for order creation.", "FORBIDDEN");
  }

  return prisma.recipe.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      recipeCode: true,
      name: true,
      category: true,
      standardFabricYards: true,
      wastageCap: true,
      components: { select: { componentName: true, piecesPerGarment: true }, orderBy: { componentName: "asc" } },
    },
  });
}
