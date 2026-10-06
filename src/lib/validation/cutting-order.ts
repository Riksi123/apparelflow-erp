import { z } from "zod";

export const createCuttingOrderSchema = z.object({
  recipeId: z.string().min(1).max(64),
  targetQuantity: z.number().int().min(1).max(100_000),
  fabricRollId: z.string().trim().min(1).max(80),
  actualFabricYards: z.number().finite().positive().max(1_000_000),
}).strict();

export const cuttingOrderIdSchema = z.string().min(1).max(64);

export const recutOrderSchema = z.object({
  fabricRollId: z.string().trim().min(1).max(80),
  actualFabricYards: z.number().finite().positive().max(1_000_000),
}).strict();
