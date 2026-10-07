import { describe, expect, it } from "vitest";
import { ComponentStatus, CuttingOrderStatus, UserRole } from "@prisma/client";
import {
  calculateComponentVariances,
  calculateWastagePercent,
  canApproveVerification,
  canVerify,
  componentStatus,
  expectedComponentQuantity,
  assertAllowedTransition,
  isAllowedTransition,
  sewingQueueFilter,
} from "../../src/lib/domain/production-policy";
import { rejectionSchema, componentCountsSchema } from "../../src/lib/validation/verification";

const recipe = [
  { id: "front", componentName: "Front panel", piecesPerGarment: 1 },
  { id: "cuffs", componentName: "Sleeve cuffs", piecesPerGarment: 2 },
];

describe("production quantity policy", () => {
  it("multiplies garment quantity by the recipe component multiplier", () => {
    expect(expectedComponentQuantity(50, 2)).toBe(100);
  });

  it("classifies exact, excess, and shortage counts", () => {
    expect(componentStatus(50, 50)).toBe(ComponentStatus.GREEN);
    expect(componentStatus(52, 50)).toBe(ComponentStatus.YELLOW);
    expect(componentStatus(49, 50)).toBe(ComponentStatus.RED);
  });

  it("allows a verifier to approve all GREEN components", () => {
    const variances = calculateComponentVariances(10, recipe, [
      { componentId: "front", actualQuantity: 10 },
      { componentId: "cuffs", actualQuantity: 20 },
    ]);
    expect(variances.every((item) => item.status === ComponentStatus.GREEN)).toBe(true);
    expect(canApproveVerification(variances)).toBe(true);
  });

  it("allows YELLOW excess but blocks approval when any component is RED", () => {
    const excess = calculateComponentVariances(10, recipe, [
      { componentId: "front", actualQuantity: 11 },
      { componentId: "cuffs", actualQuantity: 20 },
    ]);
    expect(excess[0].status).toBe(ComponentStatus.YELLOW);
    expect(canApproveVerification(excess)).toBe(true);

    const shortage = calculateComponentVariances(10, recipe, [
      { componentId: "front", actualQuantity: 9 },
      { componentId: "cuffs", actualQuantity: 20 },
    ]);
    expect(shortage[0].status).toBe(ComponentStatus.RED);
    expect(canApproveVerification(shortage)).toBe(false);
  });

  it("rejects missing components, missing counts, duplicate components, and negative or decimal counts", () => {
    expect(() => calculateComponentVariances(10, recipe, [{ componentId: "front", actualQuantity: 10 }])).toThrow(/cuffs/);
    expect(() => calculateComponentVariances(10, recipe, [
      { componentId: "front", actualQuantity: 10 },
      { componentId: "cuffs", actualQuantity: null },
    ])).toThrow(/counted/);
    expect(() => calculateComponentVariances(10, recipe, [
      { componentId: "front", actualQuantity: 10 },
      { componentId: "front", actualQuantity: 10 },
    ])).toThrow(/Duplicate/);
    expect(componentCountsSchema.safeParse({ counts: [{ componentId: "front", actualQuantity: -1 }] }).success).toBe(false);
    expect(componentCountsSchema.safeParse({ counts: [{ componentId: "front", actualQuantity: 1.5 }] }).success).toBe(false);
  });

  it("requires a trimmed non-empty rejection note", () => {
    expect(rejectionSchema.safeParse({ reason: "   " }).success).toBe(false);
    expect(rejectionSchema.safeParse({ reason: "Short sleeve panel" }).success).toBe(true);
  });

  it("calculates fabric wastage on the supplied server values", () => {
    expect(calculateWastagePercent(10, 1.8, 19.8)).toBeCloseTo(10);
    expect(calculateWastagePercent(10, 1.8, 18)).toBe(0);
  });

  it("authorizes only the verifier role to verify", () => {
    expect(canVerify(UserRole.CUTTING_VERIFIER)).toBe(true);
    expect(canVerify(UserRole.CUTTING_SUPERVISOR)).toBe(false);
    expect(canVerify(UserRole.SEWING_SUPERVISOR)).toBe(false);
  });

  it("allows only defined state transitions", () => {
    expect(isAllowedTransition(CuttingOrderStatus.PENDING_VERIFICATION, CuttingOrderStatus.VERIFIED)).toBe(true);
    expect(isAllowedTransition(CuttingOrderStatus.REJECTED, CuttingOrderStatus.CUTTING_IN_PROGRESS)).toBe(true);
    expect(isAllowedTransition(CuttingOrderStatus.CUTTING_IN_PROGRESS, CuttingOrderStatus.PENDING_VERIFICATION)).toBe(true);
    expect(isAllowedTransition(CuttingOrderStatus.PENDING_VERIFICATION, CuttingOrderStatus.SEWING_IN_PROGRESS)).toBe(false);
    expect(isAllowedTransition(CuttingOrderStatus.REJECTED, CuttingOrderStatus.VERIFIED)).toBe(false);
    expect(() => assertAllowedTransition(CuttingOrderStatus.REJECTED, CuttingOrderStatus.VERIFIED)).toThrow(/not allowed/);
  });

  it("builds a sewing database filter that includes only VERIFIED", () => {
    expect(sewingQueueFilter()).toEqual({ status: CuttingOrderStatus.VERIFIED });
  });
});
