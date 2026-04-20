// src/agent/validation/trip-plan.schema.ts

/**
 * Zod 运行时校验 Schemas
 *
 * 遵循 TripNARA 数据合同（src/agent/interfaces/trip-plan.interface.ts）
 *
 * 用途：
 * - API 请求入参校验
 * - Agent 输出校验
 * - Skills 输入/输出校验
 *
 * 安全加固：防止无效数据导致系统崩溃或意外行为
 */

import { z } from 'zod';

// ============================================================================
// TripPlanRequest Schema
// ============================================================================

const LocationSchema = z.union([
  z.string().min(1, 'Location string must not be empty'),
  z.object({
    lat: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
    lng: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  }),
]);

const PartySchema = z.object({
  count: z.number().int().positive('Party count must be a positive integer'),
  has_children: z.boolean().optional(),
  has_elderly: z.boolean().optional(),
  fitness_level: z.enum(['low', 'medium', 'high']).optional(),
});

const PartyProfileSchema = z.object({
  risk_tolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  fitness: z.enum(['low', 'medium', 'high']).optional(),
});

const ConstraintsSchema = z.object({
  budget: z
    .object({
      total: z.number().nonnegative('Budget total must be non-negative').optional(),
      currency: z.string().length(3, 'Currency must be 3-letter code (ISO 4217)').optional(),
    })
    .optional(),
  daily_time_window: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:mm format'),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:mm format'),
    })
    .optional(),
  max_ascent_m: z.number().nonnegative('Max ascent must be non-negative').optional(),
  max_walk_km: z.number().nonnegative('Max walk distance must be non-negative').optional(),
  wheelchair_accessible: z.boolean().optional(),
  no_stairs: z.boolean().optional(),
  max_transfers: z.number().int().nonnegative('Max transfers must be non-negative integer').optional(),
  restroom_interval_minutes: z.number().int().positive('Restroom interval must be positive').optional(),
}).optional();

const PreferencesSchema = z.object({
  scenic_priority: z.boolean().optional(),
  efficiency_priority: z.boolean().optional(),
  avoid_tolls: z.boolean().optional(),
  avoid_highways: z.boolean().optional(),
}).optional();

export const TripPlanRequestSchema = z.object({
  request_id: z.string().min(1, 'Request ID is required'),
  origin: LocationSchema,
  destination: LocationSchema,
  date_range: z
    .object({
      start_date: z.string().datetime({ message: 'start_date must be ISO 8601 format' }),
      end_date: z.string().datetime({ message: 'end_date must be ISO 8601 format' }),
    })
    .optional(),
  start_date: z.string().datetime({ message: 'start_date must be ISO 8601 format' }).optional(),
  days: z.number().int().positive('Days must be a positive integer').optional(),
  mode: z.enum(['walk', 'drive', 'transit', 'mixed']).optional(),
  party: PartySchema.optional(),
  party_profile: PartyProfileSchema.optional(),
  constraints: ConstraintsSchema,
  preferences: PreferencesSchema,
});

export type TripPlanRequestInput = z.infer<typeof TripPlanRequestSchema>;

// ============================================================================
// GateResult Schema
// ============================================================================

export const GateResultStatusSchema = z.enum(['ALLOW', 'ADJUST_REQUIRED', 'BLOCK', 'NEED_USER_CONFIRM']);

export const GateViolationSchema = z.object({
  type: z.enum([
    'REACHABILITY',
    'SAFETY',
    'DEM',
    'DATA_MISSING',
    'TIME_CONFLICT',
    'FATIGUE',
    'BUDGET',
    'META_BUDGET',
    'HARNESS_GATE',
  ]),
  severity: z.enum(['HARD', 'SOFT']),
  detail: z.string().min(1, 'Violation detail is required'),
  evidence_refs: z.array(z.string()).optional(),
});

export const RequiredAdjustmentSchema = z.object({
  action: z.enum([
    'CHANGE_MODE',
    'CHANGE_DATES',
    'SHORTEN_DAY',
    'REPLACE_SEGMENT',
    'REPLACE_POI',
    'ADD_BUFFER',
    'CHANGE_TRANSPORT',
    'REDUCE_SCOPE_OR_ADD_EVIDENCE',
  ]),
  why: z.string().min(1, 'Adjustment reason is required'),
  target: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
});

export const GateResultSchema = z.object({
  gate_result: GateResultStatusSchema,
  violations: z.array(GateViolationSchema),
  required_adjustments: z.array(RequiredAdjustmentSchema),
  confidence: z.number().min(0).max(1, 'Confidence must be between 0 and 1'),
  evidence_refs: z.array(z.string()).optional(),
  guardian_results: z
    .object({
      abu: z
        .object({
          verdict: z.enum(['ALLOW', 'REJECT']),
          evidence: z.array(z.string()),
        })
        .optional(),
      drdre: z
        .object({
          verdict: z.enum(['ALLOW', 'ADJUST', 'REJECT']),
          evidence: z.array(z.string()),
        })
        .optional(),
      neptune: z
        .object({
          verdict: z.enum(['ALLOW', 'REPLACE', 'REJECT']),
          evidence: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
});

export type GateResultInput = z.infer<typeof GateResultSchema>;

// ============================================================================
// EvidenceRef Schema
// ============================================================================

export const EvidenceRefSchema = z.object({
  evidence_id: z.string().min(1, 'Evidence ID is required'),
  source: z.string().min(1, 'Source is required'),
  source_title: z.string().optional(),
  source_url: z
    .string()
    .url('Source URL must be valid URL')
    .optional()
    .or(z.literal('').optional()),
  publisher: z.string().optional(),
  published_at: z.string().optional(), // Allow any ISO datetime string
  retrieved_at: z.string().optional(), // Allow any ISO datetime string
  last_verified_at: z.string(), // Allow any datetime string format
  data_timestamp: z.string().optional(),
  excerpt: z.string().optional(),
  relevance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1, 'Confidence must be between 0 and 1'),
  related_decision_ids: z.array(z.string()).optional(),
  url: z
    .string()
    .url('URL must be valid URL')
    .optional()
    .or(z.literal('').optional()),
  data: z.record(z.string(), z.any()).optional(),
});

export type EvidenceRefInput = z.infer<typeof EvidenceRefSchema>;

// ============================================================================
// Itinerary Schema
// ============================================================================

export const ItineraryItemTypeSchema = z.enum(['TRANSIT', 'DRIVE', 'WALK', 'POI', 'REST', 'MEAL', 'ACCOMMODATION']);

export const ItineraryItemSchema = z.object({
  id: z.string().min(1, 'Item ID is required'),
  type: ItineraryItemTypeSchema,
  start_window: z.string().min(1, 'Start window is required'),
  end_window: z.string().min(1, 'End window is required'),
  location_ref: z.object({
    place_id: z.string().optional(),
    name: z.string().min(1, 'Location name is required'),
    coordinates: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    address: z.string().optional(),
  }),
  notes: z.string().optional(),
  evidence_refs: z.array(z.string()),
  verified: z.boolean(),
  verification_status: z.enum(['VERIFIED', 'UNVERIFIED', 'NEED_TOOL', 'ASSUMPTION']).optional(),
  metadata: z
    .object({
      duration_minutes: z.number().nonnegative().optional(),
      cost: z.number().nonnegative().optional(),
      opening_hours: z.string().optional(),
      accessibility: z.string().optional(),
      risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      distance_meters: z.number().nonnegative().optional(),
      transport_mode_changed: z.boolean().optional(),
    })
    .optional(),
});

export const ItineraryDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  items: z.array(ItineraryItemSchema),
});

export const ItinerarySchema = z.object({
  request_id: z.string().min(1, 'Request ID is required'),
  days: z.array(ItineraryDaySchema),
  metadata: z
    .object({
      total_days: z.number().int().positive('Total days must be positive integer'),
      total_cost_estimate: z.number().nonnegative().optional(),
      robustness_score: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type ItineraryInput = z.infer<typeof ItinerarySchema>;

// ============================================================================
// DecisionLogEntry Schema
// ============================================================================

export const OrchestrationStepSchema = z.enum([
  'INTAKE',
  'RESEARCH',
  'GATE_EVAL',
  'PLAN_GEN',
  'VERIFY',
  'COMPLIANCE',
  'REPAIR',
  'NARRATE',
  'FEEDBACK',
  'DONE',
  'FAILED',
  'TIMEOUT',
  'HALLUCINATION_DETECTION',
]);

export const SubAgentTypeSchema = z.enum([
  'Orchestrator',
  'Planner',
  'Gatekeeper',
  'Compliance',
  'LocalInsight',
  'CoreDecision',
  'Narrator',
  'HallucinationDetection',
]);

export const GuardianTypeSchema = z.enum(['ABU', 'DR_DRE', 'NEPTUNE']);

export const DecisionLogEntrySchema = z.object({
  request_id: z.string().min(1, 'Request ID is required'),
  step: OrchestrationStepSchema,
  actor: SubAgentTypeSchema,
  inputs_summary: z.string().min(1, 'Inputs summary is required'),
  outputs_summary: z.string().min(1, 'Outputs summary is required'),
  evidence_refs: z.array(z.string()),
  timestamp: z.string().datetime({ message: 'Timestamp must be ISO 8601 format' }),
  metadata: z
    .object({
      duration_ms: z.number().nonnegative().optional(),
      tool_calls: z.number().int().nonnegative().optional(),
      cost_est_usd: z.number().nonnegative().optional(),
      alternatives_considered: z.number().int().nonnegative().optional(),
      guardian: GuardianTypeSchema.optional(),
    })
    .passthrough() // Allow extra fields
    .optional(),
});

export type DecisionLogEntryInput = z.infer<typeof DecisionLogEntrySchema>;

// ============================================================================
// 实用工具函数
// ============================================================================

/**
 * 校验 TripPlanRequest 并返回结果
 *
 * @param data 待校验数据
 * @returns { success: true, data } 或 { success: false, error }
 */
export function validateTripPlanRequest(data: unknown) {
  return TripPlanRequestSchema.safeParse(data);
}

/**
 * 校验 GateResult 并返回结果
 */
export function validateGateResult(data: unknown) {
  return GateResultSchema.safeParse(data);
}

/**
 * 校验 EvidenceRef 并返回结果
 */
export function validateEvidenceRef(data: unknown) {
  return EvidenceRefSchema.safeParse(data);
}

/**
 * 校验 Itinerary 并返回结果
 */
export function validateItinerary(data: unknown) {
  return ItinerarySchema.safeParse(data);
}

/**
 * 校验 DecisionLogEntry 并返回结果
 */
export function validateDecisionLogEntry(data: unknown) {
  return DecisionLogEntrySchema.safeParse(data);
}
