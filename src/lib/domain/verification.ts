import "server-only";

import { CuttingOrderStatus, ComponentStatus, VerificationDecision, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { componentCountsSchema, orderIdSchema, rejectionSchema } from "@/lib/validation/verification";
import { assertAllowedTransition, calculateComponentVariances, calculateWastagePercent, canApproveVerification, canVerify, componentStatus } from "@/lib/domain/production-policy";

export class VerificationError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID",
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

function requireVerifier(actor: SessionUser) {
  if (!canVerify(actor.role)) {
    throw new VerificationError("Only cutting verifiers may perform verification.", "FORBIDDEN");
  }
}

function deriveStatus(actual: number, expected: number): ComponentStatus {
  return componentStatus(actual, expected);
}

function loadOrder(tx: Pick<Prisma.TransactionClient, "cuttingOrder">, orderId: string) {
  return tx.cuttingOrder.findUnique({
    where: { id: orderId },
    include: {
      recipe: { include: { components: { orderBy: { componentName: "asc" } } } },
      verificationItems: { include: { component: true } },
    },
  });
}

export async function listPendingVerifications(actor: SessionUser) {
  requireVerifier(actor);
  return prisma.cuttingOrder.findMany({
    where: { status: CuttingOrderStatus.PENDING_VERIFICATION },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNo: true,
      targetQuantity: true,
      fabricRollId: true,
      createdAt: true,
      recipe: { select: { recipeCode: true, name: true, category: true } },
      createdBy: { select: { fullName: true } },
      _count: { select: { verificationItems: true } },
    },
  });
}

export async function getVerificationDetails(orderIdInput: unknown, actor: SessionUser) {
  requireVerifier(actor);
  const parsedId = orderIdSchema.safeParse(orderIdInput);
  if (!parsedId.success) throw new VerificationError("Invalid order ID.", "INVALID");

  const order = await loadOrder(prisma, parsedId.data);
  if (!order) throw new VerificationError("Order not found.", "NOT_FOUND");
  if (order.status !== CuttingOrderStatus.PENDING_VERIFICATION) {
    throw new VerificationError("Order is not pending verification.", "CONFLICT");
  }

  const itemByComponent = new Map(order.verificationItems.map((item) => [item.componentId, item]));
  return {
    id: order.id,
    orderNo: order.orderNo,
    targetQuantity: order.targetQuantity,
    fabricRollId: order.fabricRollId,
    actualFabricYards: order.actualFabricYards,
    createdAt: order.createdAt,
    recipe: {
      id: order.recipe.id,
      name: order.recipe.name,
      recipeCode: order.recipe.recipeCode,
      standardFabricYards: order.recipe.standardFabricYards,
      wastageCap: order.recipe.wastageCap,
      components: order.recipe.components.map((component) => {
        const item = itemByComponent.get(component.id);
        const expected = order.targetQuantity * component.piecesPerGarment;
        return {
          id: component.id,
          componentName: component.componentName,
          piecesPerGarment: component.piecesPerGarment,
          expectedQuantity: expected,
          actualQuantity: item?.actualQuantity ?? null,
          status: item?.actualQuantity === null || item?.actualQuantity === undefined
            ? null
            : deriveStatus(item.actualQuantity, expected),
        };
      }),
    },
  };
}

export async function saveComponentCounts(orderIdInput: unknown, input: unknown, actor: SessionUser) {
  requireVerifier(actor);
  const id = orderIdSchema.safeParse(orderIdInput);
  const parsed = componentCountsSchema.safeParse(input);
  if (!id.success || !parsed.success) throw new VerificationError("Invalid component counts.", "INVALID");

  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, id.data);
    if (!order) throw new VerificationError("Order not found.", "NOT_FOUND");
    if (order.status !== CuttingOrderStatus.PENDING_VERIFICATION) {
      throw new VerificationError("Order is not pending verification.", "CONFLICT");
    }

    const validComponentIds = new Set(order.recipe.components.map((component) => component.id));
    if (parsed.data.counts.some((count) => !validComponentIds.has(count.componentId))) {
      throw new VerificationError("A component does not belong to this recipe.", "INVALID");
    }

    for (const count of parsed.data.counts) {
      const component = order.recipe.components.find((entry) => entry.id === count.componentId);
      if (!component) throw new VerificationError("A component does not belong to this recipe.", "INVALID");
      await tx.verificationItem.upsert({
        where: { orderId_componentId: { orderId: order.id, componentId: component.id } },
        create: {
          orderId: order.id,
          componentId: component.id,
          expectedQuantity: order.targetQuantity * component.piecesPerGarment,
          actualQuantity: count.actualQuantity,
          status: deriveStatus(count.actualQuantity, order.targetQuantity * component.piecesPerGarment),
        },
        update: {
          expectedQuantity: order.targetQuantity * component.piecesPerGarment,
          actualQuantity: count.actualQuantity,
          status: deriveStatus(count.actualQuantity, order.targetQuantity * component.piecesPerGarment),
        },
      });
    }
  });
}

export async function approveVerification(orderIdInput: unknown, actor: SessionUser) {
  requireVerifier(actor);
  const id = orderIdSchema.safeParse(orderIdInput);
  if (!id.success) throw new VerificationError("Invalid order ID.", "INVALID");

  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, id.data);
    if (!order) throw new VerificationError("Order not found.", "NOT_FOUND");
    if (order.status !== CuttingOrderStatus.PENDING_VERIFICATION) {
      throw new VerificationError("Order is not pending verification.", "CONFLICT");
    }

    let recomputed;
    let wastagePercent: number;
    try {
      recomputed = calculateComponentVariances(
        order.targetQuantity,
        order.recipe.components.map(({ id, componentName, piecesPerGarment }) => ({ id, componentName, piecesPerGarment })),
        order.verificationItems.map(({ componentId, actualQuantity }) => ({ componentId, actualQuantity })),
      );
      if (!canApproveVerification(recomputed)) {
        const shortage = recomputed.find((item) => item.status === ComponentStatus.RED);
        throw new Error(shortage ? `${shortage.componentName} is short. Reject this batch and record a reason.` : "Every recipe component must be present and counted.");
      }
      wastagePercent = calculateWastagePercent(order.targetQuantity, Number(order.recipe.standardFabricYards), Number(order.actualFabricYards));
    } catch (error) {
      throw new VerificationError(error instanceof Error ? error.message : "Verification data is invalid.", "INVALID");
    }

    assertAllowedTransition(order.status, CuttingOrderStatus.VERIFIED);
    for (const item of recomputed) {
      await tx.verificationItem.update({
        where: { orderId_componentId: { orderId: order.id, componentId: item.componentId } },
        data: { expectedQuantity: item.expectedQuantity, actualQuantity: item.actualQuantity, status: item.status },
      });
    }

    const transition = await tx.cuttingOrder.updateMany({
      where: { id: order.id, status: CuttingOrderStatus.PENDING_VERIFICATION },
      data: { status: CuttingOrderStatus.VERIFIED },
    });
    if (transition.count !== 1) throw new VerificationError("Order state changed; reload and try again.", "CONFLICT");

    await tx.verificationLog.create({
      data: {
        orderId: order.id,
        verifierId: actor.id,
        decision: VerificationDecision.APPROVED,
        componentVariances: recomputed.map((item) => ({
          componentId: item.componentId,
          expectedQuantity: item.expectedQuantity,
          actualQuantity: item.actualQuantity,
          variance: item.variance,
          status: item.status,
        })),
        wastagePercent: Number(wastagePercent.toFixed(4)),
      },
    });

    return { orderId: order.id, orderNo: order.orderNo, status: CuttingOrderStatus.VERIFIED, wastagePercent };
  }, { isolationLevel: "Serializable" });
}

export async function rejectVerification(orderIdInput: unknown, input: unknown, actor: SessionUser) {
  requireVerifier(actor);
  const id = orderIdSchema.safeParse(orderIdInput);
  const parsed = rejectionSchema.safeParse(input);
  if (!id.success || !parsed.success) throw new VerificationError("A non-empty rejection reason is required.", "INVALID");

  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, id.data);
    if (!order) throw new VerificationError("Order not found.", "NOT_FOUND");
    if (order.status !== CuttingOrderStatus.PENDING_VERIFICATION) {
      throw new VerificationError("Order is not pending verification.", "CONFLICT");
    }

    assertAllowedTransition(order.status, CuttingOrderStatus.REJECTED);

    const transition = await tx.cuttingOrder.updateMany({
      where: { id: order.id, status: CuttingOrderStatus.PENDING_VERIFICATION },
      data: { status: CuttingOrderStatus.REJECTED },
    });
    if (transition.count !== 1) throw new VerificationError("Order state changed; reload and try again.", "CONFLICT");

    await tx.verificationLog.create({
      data: {
        orderId: order.id,
        verifierId: actor.id,
        decision: VerificationDecision.REJECTED,
        rejectionNote: parsed.data.reason,
        componentVariances: order.verificationItems.map((item) => ({
          componentId: item.componentId,
          expectedQuantity: order.targetQuantity * item.component.piecesPerGarment,
          actualQuantity: item.actualQuantity,
          variance: item.actualQuantity === null ? null : item.actualQuantity - order.targetQuantity * item.component.piecesPerGarment,
          status: item.actualQuantity === null ? null : deriveStatus(item.actualQuantity, order.targetQuantity * item.component.piecesPerGarment),
        })),
      },
    });
    return { orderId: order.id, orderNo: order.orderNo, status: CuttingOrderStatus.REJECTED };
  }, { isolationLevel: "Serializable" });
}
