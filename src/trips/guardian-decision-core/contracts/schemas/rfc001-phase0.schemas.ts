/**
 * RFC-001 Phase 0 — Zod runtime validation for frozen contracts.
 */

import { z } from 'zod';

const isoInstant = z.string().min(1);

export const entityRefSchema = z.object({
  kind: z.enum([
    'TRIP',
    'PLAN_VERSION',
    'DAY_PLAN',
    'DAY',
    'PLAN_ITEM',
    'ROUTE_SEGMENT',
    'POI',
    'REGION',
    'TRAVELER',
    'PARTY',
    'RESERVATION',
    'HAZARD_ZONE',
    'EXPERIENCE_INTENT',
  ]),
  id: z.string().min(1),
  label: z.string().optional(),
});

export const worldStateAssertionSchema = z.object({
  assertionId: z.string().min(1),
  subjectRef: entityRefSchema,
  predicate: z.string().min(1),
  payload: z.unknown(),
  source: z.object({
    provider: z.string().min(1),
    sourceType: z.enum(['OFFICIAL', 'PARTNER', 'USER', 'MODEL', 'INTERNAL']),
    evidenceRefs: z.array(z.string()),
  }),
  observedAt: isoInstant,
  validFrom: isoInstant,
  validUntil: isoInstant.optional(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['ACTIVE', 'SUPERSEDED', 'EXPIRED', 'DISPUTED']),
  version: z.number().int().positive(),
  supersedesAssertionId: z.string().optional(),
});

export const rfc001DecisionProblemSchema = z.object({
  problemId: z.string().min(1),
  tripId: z.string().min(1),
  planVersionId: z.string().min(1),
  type: z.enum([
    'FEASIBILITY_FAILURE',
    'SCHEDULE_RISK',
    'EXCESSIVE_LOAD',
    'RESOURCE_UNAVAILABLE',
    'VALUE_TRADEOFF',
    'EXECUTION_FAILURE',
  ]),
  triggerEventId: z.string().min(1),
  affectedEntityRefs: z.array(entityRefSchema),
  affectedPlanItemIds: z.array(z.string()).min(1),
  worldStateSnapshotId: z.string().min(1),
  detectedAt: isoInstant,
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum([
    'OPEN',
    'EVALUATING',
    'WAITING_HUMAN',
    'DECIDED',
    'EXECUTING',
    'RESOLVED',
    'FAILED',
  ]),
});

export const constraintAssertionSchema = z.object({
  assertionId: z.string().min(1),
  workspaceId: z.string().min(1),
  actor: z.enum(['ABU', 'DRDRE']),
  targetCandidateId: z.string().optional(),
  affectedEntityRefs: z.array(entityRefSchema),
  affectedPlanItemIds: z.array(z.string()),
  verdict: z.enum(['PASS', 'WARNING', 'BLOCK', 'UNKNOWN']),
  constraintCode: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string()),
  ruleVersion: z.string().min(1),
  confidence: z.number().min(0).max(1),
  overridable: z.boolean(),
  recoveryConditions: z
    .array(
      z.object({
        code: z.string(),
        description: z.string(),
        evidenceRefs: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  createdAt: isoInstant,
});

export const decisionWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  problemId: z.string().min(1),
  basePlanVersionId: z.string().min(1),
  worldStateSnapshotId: z.string().min(1),
  preferenceSnapshotId: z.string().min(1),
  constraintAssertions: z.array(constraintAssertionSchema),
  loadAssessments: z.array(z.object({
    assessmentId: z.string().min(1),
    workspaceId: z.string().min(1),
    actor: z.literal('DRDRE'),
    targetCandidateId: z.string().min(1),
    affectedTravelerIds: z.array(z.string()),
    physicalLoad: z.number(),
    scheduleStress: z.number(),
    recoveryDeficit: z.number(),
    cognitiveLoad: z.number().optional(),
    missedWindowProbability: z.number().optional(),
    weakestMemberScore: z.number().optional(),
    adjustmentRequirements: z.array(z.object({
      code: z.string(),
      description: z.string(),
    })),
    modelVersion: z.string().min(1),
    inputSnapshotRef: z.string().min(1),
    confidence: z.number().min(0).max(1),
    createdAt: isoInstant,
  })),
  repairCandidates: z.array(z.object({
    candidateId: z.string().min(1),
    workspaceId: z.string().min(1),
    actor: z.literal('NEPTUNE'),
    basePlanVersionId: z.string().min(1),
    replacesPlanItemIds: z.array(z.string()),
    proposedOperations: z.array(z.object({
      operationId: z.string().min(1),
      kind: z.string().min(1),
      targetRefs: z.array(entityRefSchema),
      parameters: z.record(z.string(), z.unknown()),
    })),
    preservedIntentRefs: z.array(z.string()),
    degradedIntentRefs: z.array(z.string()),
    lostIntentRefs: z.array(z.string()),
    estimatedIntentPreservation: z.number().min(0).max(1),
    estimatedAddedCost: z.object({
      amount: z.number(),
      currency: z.string().min(1),
    }),
    estimatedAddedDurationMinutes: z.number(),
    generationMethod: z.enum([
      'ONTOLOGY_EQUIVALENCE',
      'ROUTE_REPAIR',
      'LOCAL_SUBSTITUTION',
      'TEMPLATE',
      'LLM_ASSISTED',
      'SPLIT_DAY',
    ]),
    evidenceRefs: z.array(z.string()),
    generatorVersion: z.string().min(1),
    status: z.enum(['PROPOSED', 'VALIDATING', 'VALID', 'INVALID']),
    createdAt: isoInstant,
  })),
  createdAt: isoInstant,
  expiresAt: isoInstant.optional(),
  revision: z.number().int().nonnegative(),
  status: z.enum([
    'COLLECTING',
    'READY_FOR_FINALIZE',
    'FINALIZED',
    'STALE',
    'ABANDONED',
  ]),
});

export const rfc001DecisionRecordSchema = z.object({
  decisionId: z.string().min(1),
  problemId: z.string().min(1),
  workspaceId: z.string().min(1),
  basePlanVersionId: z.string().min(1),
  worldStateSnapshotId: z.string().min(1),
  preferenceSnapshotId: z.string().min(1),
  consideredCandidateIds: z.array(z.string()),
  rejectedCandidates: z.array(z.object({
    candidateId: z.string(),
    reasonCodes: z.array(z.string()),
    rejectedBy: z.enum([
      'HARD_CONSTRAINT',
      'DOMINATED',
      'INCOMPLETE_ASSESSMENT',
      'POLICY',
    ]),
  })),
  selectedCandidateId: z.string().optional(),
  finalAction: z.enum([
    'ALLOW',
    'ADJUST',
    'REPLACE',
    'REJECT',
    'DEFER_TO_HUMAN',
    'NO_ACTION',
  ]),
  reasonCodes: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  utilityEvaluation: z
    .array(
      z.object({
        candidateId: z.string(),
        utility: z.number(),
        vector: z.object({
          experienceValue: z.number(),
          intentPreservation: z.number(),
          fatigueCost: z.number(),
          monetaryCost: z.number(),
          timeStress: z.number(),
          residualRisk: z.number(),
          reversibility: z.number(),
        }),
        uncertaintyBand: z
          .object({ low: z.number(), high: z.number() })
          .optional(),
        dominatedBy: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  authorizationRequirement: z.object({
    level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']),
    requiresUserConfirmation: z.boolean(),
    reasons: z.array(z.string()),
    externalSideEffects: z.array(z.object({
      kind: z.enum(['BOOKING', 'PAYMENT', 'CANCELLATION', 'NOTIFICATION', 'THIRD_PARTY_API']),
      description: z.string(),
      reversible: z.boolean(),
    })),
  }),
  ruleVersions: z.array(z.string()),
  modelVersions: z.record(z.string(), z.string()),
  recordStatus: z.enum([
    'PROPOSED',
    'AUTHORIZED',
    'REJECTED_BY_USER',
    'EXECUTING',
    'EFFECTIVE',
    'PARTIAL',
    'FAILED',
    'ROLLED_BACK',
    'NEEDS_REPAIR',
  ]),
  createdAt: isoInstant,
  decidedAt: isoInstant,
  effectivePlanVersionId: z.string().optional(),
});
