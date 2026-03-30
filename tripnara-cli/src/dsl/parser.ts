import { dslSchema, type DSLDefinition } from "./schema";

export function parseDSL(raw: unknown): DSLDefinition {
  return dslSchema.parse(raw);
}
