import { z } from "zod";

export const UserCorrectionSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  targetType: z.enum(["node", "finding", "deployment_context"]),
  targetId: z.string().optional(),
  field: z.string().min(1),
  value: z.string().max(8000),
  note: z.string().max(4000).optional(),
});

export type UserCorrection = z.infer<typeof UserCorrectionSchema>;
