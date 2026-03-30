import { z } from "zod";

export const dslStepSchema = z.object({
  agent: z.string().min(1),
  input: z.record(z.unknown()).optional(),
});

export const dslSchema = z.object({
  name: z.string().min(1),
  steps: z.array(dslStepSchema).min(1),
});

export type DSLDefinition = z.infer<typeof dslSchema>;
