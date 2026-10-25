/**
 * Traveler Memory Contract V1 — 产品侧统一记忆对象（冻结）。
 *
 * 落点：仍写入 TMR Ledger（predicate = traveler.{domain}.{semantic}.{key}），
 * 不新建第三存储平面。Decision 模块只读 EffectiveTravelerContext。
 *
 * @see Traveler Memory 产品方案 §2 / §12 / 里程碑 M4
 */

import type { MemoryScope } from '../types/memory-scope.types';
import type { MemoryEvidenceRefV1 } from '../types/memory-evidence-ref.types';
import type {
  EffectiveMemoryOverridePolicy,
  EffectiveMemorySensitivity,
  TravelerMemoryDomain,
  TravelerMemorySemanticType,
} from '../effective-context/effective-traveler-context.types';

export const TRAVELER_MEMORY_OBJECT_SCHEMA =
  'tripnara.traveler_memory_object@v1' as const;

export const TRAVELER_MEMORY_PREDICATE_PREFIX = 'traveler.' as const;

/** 产品 Evidence Source（§6） */
export type TravelerMemoryEvidenceSource =
  | 'EXPLICIT'
  | 'BEHAVIORAL'
  | 'INFERRED'
  | 'EPISODIC';

/** 产品生命周期（§5） */
export type TravelerMemoryObjectStatus =
  | 'OBSERVED'
  | 'CANDIDATE'
  | 'CONFIRMED'
  | 'STABLE'
  | 'DECAYED'
  | 'REVOKED';

/** 用户侧可见性（§7 Profile Card） */
export type TravelerMemoryVisibility =
  | 'USER_VISIBLE'
  | 'INTERNAL_ONLY'
  | 'SENSITIVE_HIDDEN';

/**
 * 统一 Memory Object（产品 JSON）。
 * Memory Value 与 Evidence 分离：本对象只存当前结论。
 */
export type TravelerMemoryObjectV1 = {
  schemaId: typeof TRAVELER_MEMORY_OBJECT_SCHEMA;
  version: 1;
  memory_id: string;
  subject_id: string;
  domain: TravelerMemoryDomain;
  semantic_type: TravelerMemorySemanticType;
  key: string;
  value: unknown;
  scope: MemoryScope;
  confidence: number;
  status: TravelerMemoryObjectStatus;
  source: TravelerMemoryEvidenceSource[];
  evidence_refs: MemoryEvidenceRefV1[];
  evidence_count: number;
  sensitivity: EffectiveMemorySensitivity;
  visibility: TravelerMemoryVisibility;
  override_policy: EffectiveMemoryOverridePolicy;
  created_at: string;
  last_observed_at: string;
  last_confirmed_at: string | null;
};

/** Ledger value 信封（与 predicate 配套） */
export type TravelerMemoryLedgerValueV1 = {
  contract: typeof TRAVELER_MEMORY_OBJECT_SCHEMA;
  domain: TravelerMemoryDomain;
  semantic_type: TravelerMemorySemanticType;
  key: string;
  value: unknown;
  sensitivity: EffectiveMemorySensitivity;
  visibility: TravelerMemoryVisibility;
  override_policy: EffectiveMemoryOverridePolicy;
  source: TravelerMemoryEvidenceSource[];
  /** TMR Profile View 门控：仅 CONFIRMED/STABLE 可为 true */
  profileEligible: boolean;
};

export type WriteTravelerMemoryRequestV1 = {
  subject_id: string;
  domain: TravelerMemoryDomain;
  semantic_type: TravelerMemorySemanticType;
  key: string;
  value: unknown;
  /** 默认 GLOBAL_USER；Trip Override 用 TRIP */
  scope?: MemoryScope;
  confidence?: number;
  source: TravelerMemoryEvidenceSource[];
  evidence_refs?: MemoryEvidenceRefV1[];
  sensitivity?: EffectiveMemorySensitivity;
  visibility?: TravelerMemoryVisibility;
  override_policy?: EffectiveMemoryOverridePolicy;
  /** true → CONFIRM/ACTIVE；false → 按 source 走 Candidate/Explicit policy */
  explicitConfirm?: boolean;
  conversationId?: string;
  turnId?: string;
  decisionId?: string;
  episodeId?: string;
  /** L2：绑定 trip subject（scope=TRIP 时建议提供） */
  trip_id?: string | null;
};

export type WriteTravelerMemoryResultV1 =
  | { ok: true; object: TravelerMemoryObjectV1; eventId: string }
  | { ok: false; reason: string; keepEpisodeOnly?: boolean };

export const TRAVELER_MEMORY_DOMAINS: readonly TravelerMemoryDomain[] = [
  'FOOD',
  'STAY',
  'SLEEP',
  'MOBILITY',
  'EXPERIENCE',
  'PACE',
  'SPENDING',
  'DECISION_STYLE',
] as const;

export const TRAVELER_MEMORY_SEMANTIC_TYPES: readonly TravelerMemorySemanticType[] =
  [
    'PREFERENCE',
    'AVOIDANCE',
    'CONSTRAINT',
    'HABIT',
    'TRADEOFF',
  ] as const;
