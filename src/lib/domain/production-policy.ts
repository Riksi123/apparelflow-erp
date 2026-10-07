import { ComponentStatus, CuttingOrderStatus, UserRole } from "@prisma/client";

export type RecipePart = { id: string; componentName: string; piecesPerGarment: number };
export type PhysicalCount = { componentId: string; actualQuantity: number | null };
export type ComponentVariance = {
  componentId: string;
  componentName: string;
  expectedQuantity: number;
  actualQuantity: number;
  variance: number;
  status: ComponentStatus;
};

export function expectedComponentQuantity(targetQuantity: number, piecesPerGarment: number) {
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 1 || !Number.isSafeInteger(piecesPerGarment) || piecesPerGarment < 1) {
    throw new Error("Target quantity and component multiplier must be positive integers.");
  }
  const expected = targetQuantity * piecesPerGarment;
  if (!Number.isSafeInteger(expected)) throw new Error("Expected component quantity is outside the safe integer range.");
  return expected;
}

export function componentStatus(actualQuantity: number, expectedQuantity: number): ComponentStatus {
  if (!Number.isSafeInteger(actualQuantity) || actualQuantity < 0 || !Number.isSafeInteger(expectedQuantity) || expectedQuantity < 0) {
    throw new Error("Component counts must be non-negative integers.");
  }
  if (actualQuantity === expectedQuantity) return ComponentStatus.GREEN;
  if (actualQuantity > expectedQuantity) return ComponentStatus.YELLOW;
  return ComponentStatus.RED;
}

export function calculateComponentVariances(
  targetQuantity: number,
  components: RecipePart[],
  counts: PhysicalCount[],
): ComponentVariance[] {
  if (components.length === 0) throw new Error("Recipe has no components.");
  const countByComponent = new Map(counts.map((count) => [count.componentId, count]));
  if (countByComponent.size !== counts.length) throw new Error("Duplicate component counts are invalid.");
  if (counts.some((count) => !components.some((component) => component.id === count.componentId))) {
    throw new Error("A count does not belong to this recipe.");
  }
  return components.map((component) => {
    const count = countByComponent.get(component.id);
    if (!count || count.actualQuantity === null) throw new Error(`${component.componentName} has not been counted.`);
    const expectedQuantity = expectedComponentQuantity(targetQuantity, component.piecesPerGarment);
    const status = componentStatus(count.actualQuantity, expectedQuantity);
    return {
      componentId: component.id,
      componentName: component.componentName,
      expectedQuantity,
      actualQuantity: count.actualQuantity,
      variance: count.actualQuantity - expectedQuantity,
      status,
    };
  });
}

export function calculateWastagePercent(targetQuantity: number, standardFabricYards: number, actualFabricYards: number) {
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 1 || !Number.isFinite(standardFabricYards) || standardFabricYards <= 0 || !Number.isFinite(actualFabricYards) || actualFabricYards <= 0) {
    throw new Error("Fabric quantities must be positive and valid.");
  }
  const expectedFabric = targetQuantity * standardFabricYards;
  if (!Number.isFinite(expectedFabric) || expectedFabric <= 0) throw new Error("Expected fabric quantity is invalid.");
  return ((actualFabricYards - expectedFabric) / expectedFabric) * 100;
}

export function canApproveVerification(variances: ComponentVariance[]) {
  return variances.length > 0 && variances.every((item) => item.status === ComponentStatus.GREEN || item.status === ComponentStatus.YELLOW);
}

export function isAllowedTransition(from: CuttingOrderStatus, to: CuttingOrderStatus) {
  const transitions: Partial<Record<CuttingOrderStatus, CuttingOrderStatus[]>> = {
    [CuttingOrderStatus.CUTTING_IN_PROGRESS]: [CuttingOrderStatus.PENDING_VERIFICATION],
    [CuttingOrderStatus.PENDING_VERIFICATION]: [CuttingOrderStatus.VERIFIED, CuttingOrderStatus.REJECTED],
    [CuttingOrderStatus.VERIFIED]: [CuttingOrderStatus.SEWING_IN_PROGRESS],
    [CuttingOrderStatus.REJECTED]: [CuttingOrderStatus.CUTTING_IN_PROGRESS],
  };
  return transitions[from]?.includes(to) ?? false;
}

export function assertAllowedTransition(from: CuttingOrderStatus, to: CuttingOrderStatus) {
  if (!isAllowedTransition(from, to)) {
    throw new Error(`State transition ${from} → ${to} is not allowed.`);
  }
}

export function canVerify(role: UserRole) {
  return role === UserRole.CUTTING_VERIFIER;
}

export function sewingQueueFilter() {
  return { status: CuttingOrderStatus.VERIFIED } as const;
}
