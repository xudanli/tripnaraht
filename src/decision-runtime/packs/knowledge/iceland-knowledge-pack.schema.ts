/**
 * Zod schema for Iceland Self-Drive Knowledge Pack manifest.
 */

import { z } from 'zod';

const domainId = z.enum([
  'VEHICLE_ROAD_FIT',
  'WEATHER_DRIVING',
  'DAYLIGHT_SEASON',
  'FUEL',
  'RENTAL_INSURANCE',
  'REGULATION',
  'RUNBOOK',
]);

const lifecycle = z.enum(['ACTIVE', 'DRAFT', 'SHADOW', 'DEPRECATED']);
const review = z.enum(['DRAFT', 'REVIEWED', 'APPROVED']);
const gate = z.enum(['ALLOW', 'NEED_CONFIRM', 'SUGGEST_REPLACE', 'REJECT']);
const severity = z.enum(['INFO', 'WARN', 'HIGH', 'STOP']);
const consumer = z.enum([
  'CONSTRAINT_GATEWAY',
  'SOLVER',
  'EXECUTION_RISK',
  'DECISION_CASE',
  'COPILOT',
  'EXECUTION_MONITOR',
  'REPAIR_RUNTIME',
  'ROUTE_SOLVER',
]);

const sourceRef = z.object({
  kind: z.enum(['PACK_FILE', 'REPO_FILE', 'SKILL', 'DECISION_CASE', 'EXTERNAL']),
  path: z.string().min(1),
  version: z.string().optional(),
  note: z.string().optional(),
});

const condition = z.object({
  field: z.string().min(1),
  operator: z.enum(['EQ', 'NEQ', 'GTE', 'LTE', 'IN', 'EXISTS']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z.array(z.string()).optional(),
});

const knowledgeRule = z.object({
  ruleId: z.string().min(1),
  domain: domainId,
  conditions: z.array(condition),
  outcome: z.object({
    gate: gate.optional(),
    severity: severity.optional(),
    effects: z
      .array(
        z.object({
          type: z.string(),
          payload: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
    actions: z.array(z.string()).optional(),
  }),
  consumerBindings: z.array(consumer).min(1),
  evidence: z.array(sourceRef).min(1),
  version: z.string().min(1),
  reviewStatus: review,
  projectionMode: z.enum(['REFERENCE', 'STUB']),
  sdrRuleId: z.string().optional(),
  semanticKey: z.string().optional(),
  notes: z.string().optional(),
});

const domainEntry = z.object({
  domainId: domainId,
  status: lifecycle,
  reviewStatus: review,
  inProductionMainChain: z.boolean(),
  version: z.string().min(1),
  sources: z.array(sourceRef).min(1),
  runtimeConsumers: z.array(consumer).min(1),
  rules: z.array(knowledgeRule),
});

export const icelandSelfDriveKnowledgePackManifestSchema = z.object({
  schemaId: z.literal('tripnara.iceland.self_drive_knowledge_pack@v1'),
  packId: z.string().min(1),
  country: z.string().min(1),
  version: z.string().min(1),
  destinationPackId: z.string().min(1),
  status: lifecycle,
  owner: z.string().optional(),
  validFrom: z.string().min(1),
  domains: z.record(z.string(), domainEntry),
});

export type ParsedIcelandSelfDriveKnowledgePackManifest = z.infer<
  typeof icelandSelfDriveKnowledgePackManifestSchema
>;
