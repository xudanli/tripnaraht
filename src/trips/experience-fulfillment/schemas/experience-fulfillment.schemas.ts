/**
 * Zod schemas for Experience Fulfillment contracts (PRD Round 1)
 */

import { z } from 'zod';

import { MVP_EXPERIENCE_ATOM_CODES } from '../types/experience-atom.types';

const experienceAtomCodeSchema = z.enum(MVP_EXPERIENCE_ATOM_CODES);

const experienceIntentPrioritySchema = z.enum(['MUST_PRESERVE', 'HIGH', 'NORMAL']);

export const ProposedExperienceAtomSchema = z.object({
  atom: z.union([experienceAtomCodeSchema, z.string().min(1)]),
  expectedStrength: z.number().min(0).max(1),
  priority: experienceIntentPrioritySchema,
});

export const ExperienceCandidateSchema = z.object({
  candidateId: z.string().min(1),
  poiId: z.string().min(1),
  proposedExperienceAtoms: z.array(ProposedExperienceAtomSchema).min(1),
  intendedParticipants: z.array(z.string()),
  proposedTimeWindow: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
  }),
  expectedDwellMinutes: z.number().int().nonnegative(),
  itineraryRole: z.enum(['ANCHOR', 'RECOMMENDED', 'FLEXIBLE']),
  rationale: z.string().min(1),
  evidenceRefs: z.array(z.string()),
});

export const ExperienceIntentAtomSchema = z.object({
  atom: experienceAtomCodeSchema,
  weight: z.number().min(0).max(1),
  priority: experienceIntentPrioritySchema.optional(),
  participants: z.array(z.string()).optional(),
});

export const NegativePreferenceSchema = z.object({
  type: z.enum([
    'HIGH_CROWD',
    'HIGH_PHYSICAL_EFFORT',
    'LONG_DRIVE',
    'COMMERCIALIZED',
    'WEATHER_EXPOSURE',
    'LATE_NIGHT',
  ]),
  weight: z.number().min(0).max(1),
});

export const ExperienceIntentDigestSchema = z.object({
  revision: z.literal('v1'),
  experienceIntents: z.array(ExperienceIntentAtomSchema),
  negativePreferences: z.array(NegativePreferenceSchema),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['rule', 'llm', 'hybrid']).optional(),
});

const violationSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['HARD', 'SOFT']),
  message: z.string().min(1),
  entityRef: z
    .object({
      type: z.string(),
      id: z.string().optional(),
    })
    .optional(),
  evidenceRefs: z.array(z.string()).optional(),
});

export const VerificationResultSchema = z.object({
  verificationRunId: z.string().min(1),
  status: z.enum(['PASS', 'PASS_WITH_WARNING', 'REPAIR_REQUIRED', 'BLOCKED', 'UNKNOWN']),
  scope: z.enum(['CANDIDATE', 'DAY', 'TRIP']),
  hardViolations: z.array(violationSchema),
  softRisks: z.array(
    z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      likelihood: z.number().min(0).max(1).optional(),
      evidenceRefs: z.array(z.string()).optional(),
    }),
  ),
  unknowns: z.array(
    z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      missingData: z.array(z.string()).optional(),
      evidenceRefs: z.array(z.string()).optional(),
    }),
  ),
  metrics: z.object({
    feasibilityScore: z.number().min(0).max(1).optional(),
    evidenceConfidence: z.number().min(0).max(1).optional(),
    experienceFulfillmentEstimate: z.number().min(0).max(1).optional(),
    scheduleRobustness: z.number().min(0).max(1).optional(),
  }),
  repairInstructions: z.array(
    z.object({
      action: z.string().min(1),
      targetId: z.string().optional(),
      detail: z.string().optional(),
    }),
  ),
  userDecisionsRequired: z.array(
    z.object({
      question: z.string().min(1),
      options: z.array(z.string()).optional(),
      reason: z.string().min(1),
      correlationId: z.string().optional(),
    }),
  ),
  evidenceRefs: z.array(z.string()),
});

export const RepairContractSchema = z.object({
  contractId: z.string().min(1),
  scope: z.enum(['CANDIDATE', 'DAY', 'TRIP']),
  targetIds: z.array(z.string()),
  trigger: z.object({
    verificationRunId: z.string().min(1),
    generatedAt: z.string().min(1),
    ruleVersion: z.string().min(1),
  }),
  violations: z.array(violationSchema),
  immutableConstraints: z.array(
    z.object({
      field: z.string().min(1),
      value: z.unknown(),
      reason: z.string().min(1),
    }),
  ),
  preserveGoals: z.array(
    z.object({
      intent: z.string().min(1),
      minimumScore: z.number().min(0).max(1).optional(),
      priority: z.enum(['MUST_PRESERVE', 'HIGH']),
    }),
  ),
  relaxableConstraints: z.array(
    z.object({
      field: z.string().min(1),
      currentValue: z.unknown(),
      allowedRange: z.unknown().optional(),
    }),
  ),
  replacementSearchSpace: z.object({
    geoBounds: z
      .object({
        centerPoiId: z.string().optional(),
        maxRadiusKm: z.number().positive().optional(),
      })
      .optional(),
    allowedPoiTypes: z.array(z.string()).optional(),
    excludedPoiIds: z.array(z.string()).optional(),
    vehicleAccess: z.array(z.string()).optional(),
    availableTimeWindow: z
      .object({
        start: z.string(),
        end: z.string(),
      })
      .optional(),
    budgetLimit: z.number().nonnegative().optional(),
    maxDetourMinutes: z.number().nonnegative().optional(),
  }),
  optimizationObjective: z.object({
    primary: z.string().min(1),
    secondary: z.array(z.string()),
  }),
  repairActionsAllowed: z.array(
    z.enum([
      'REPLACE_ITEM',
      'REORDER_ITEMS',
      'SHORTEN_DWELL',
      'CHANGE_START_TIME',
      'SPLIT_PARTICIPANTS',
      'REMOVE_OPTIONAL_ITEM',
      'CHANGE_OVERNIGHT_NODE',
    ]),
  ),
  userDecisionRequired: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string()).optional(),
        reason: z.string().min(1),
        correlationId: z.string().optional(),
      }),
    )
    .optional(),
  terminationConditions: z.object({
    maxRepairRounds: z.number().int().positive(),
    minimumAcceptableScore: z.number().min(0).max(1),
  }),
});
