import { z } from "zod";

export const orderIdSchema = z.string().min(1).max(64);

export const componentCountsSchema = z.object({
  counts: z.array(z.object({
    componentId: z.string().min(1).max(64),
    actualQuantity: z.number().int().min(0).max(10_000_000),
  }).strict()).max(100),
}).strict().superRefine((data, context) => {
  const ids = data.counts.map((count) => count.componentId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Each component may only be counted once." });
  }
});

export const rejectionSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
}).strict();
