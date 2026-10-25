/**
 * Traveler Memory Object 校验 + Ledger 往返 + 默认策略。
 */

import type { MemoryEventV1 } from '../types/memory-event.types';
import type { MemoryEvidenceRefV1 } from '../types/memory-evidence-ref.types';
import type {
  EffectiveMemoryOverridePolicy,
  EffectiveMemorySensitivity,
} from '../effective-context/effective-traveler-context.types';
import {
  TRAVELER_MEMORY_DOMAINS,
  TRAVELER_MEMORY_OBJECT_SCHEMA,
  TRAVELER_MEMORY_SEMANTIC_TYPES,
  type TravelerMemoryEvidenceSource,
  type TravelerMemoryLedgerValueV1,
  type TravelerMemoryObjectStatus,
  type TravelerMemoryObjectV1,
  type TravelerMemoryVisibility,
  type WriteTravelerMemoryRequestV1,
} from './traveler-memory-contract.types';
import {
  encodeTravelerMemoryPredicate,
  resolvePredicateParts,
} from './traveler-memory-predicate.util';

const SOURCES: readonly TravelerMemoryEvidenceSource[] = [
  'EXPLICIT',
  'BEHAVIORAL',
  'INFERRED',
  'EPISODIC',
];

export type TravelerMemoryValidationIssue = {
  field: string;
  message: string;
};

export function defaultSensitivityForDomain(
  domain: WriteTravelerMemoryRequestV1['domain'],
): EffectiveMemorySensitivity {
  return domain === 'SLEEP' ? 'SENSITIVE' : 'NORMAL';
}

export function defaultVisibilityForDomain(
  domain: WriteTravelerMemoryRequestV1['domain'],
  sensitivity: EffectiveMemorySensitivity,
): TravelerMemoryVisibility {
  if (sensitivity === 'SENSITIVE' || domain === 'SLEEP') {
    return 'SENSITIVE_HIDDEN';
  }
  return 'USER_VISIBLE';
}

export function defaultOverridePolicyForScope(
  scope: WriteTravelerMemoryRequestV1['scope'],
): EffectiveMemoryOverridePolicy {
  if (scope === 'TRIP' || scope === 'DAY' || scope === 'SESSION') {
    return 'L2_WINS';
  }
  return 'L2_WINS';
}

export function validateWriteTravelerMemoryRequest(
  req: WriteTravelerMemoryRequestV1,
): TravelerMemoryValidationIssue[] {
  const issues: TravelerMemoryValidationIssue[] = [];
  if (!String(req.subject_id ?? '').trim()) {
    issues.push({ field: 'subject_id', message: 'required' });
  }
  if (!TRAVELER_MEMORY_DOMAINS.includes(req.domain)) {
    issues.push({ field: 'domain', message: 'invalid_domain' });
  }
  if (!TRAVELER_MEMORY_SEMANTIC_TYPES.includes(req.semantic_type)) {
    issues.push({ field: 'semantic_type', message: 'invalid_semantic_type' });
  }
  if (!String(req.key ?? '').trim()) {
    issues.push({ field: 'key', message: 'required' });
  }
  if (req.value === undefined) {
    issues.push({ field: 'value', message: 'required' });
  }
  if (!Array.isArray(req.source) || req.source.length === 0) {
    issues.push({ field: 'source', message: 'at_least_one_source' });
  } else {
    for (const s of req.source) {
      if (!(SOURCES as readonly string[]).includes(s)) {
        issues.push({ field: 'source', message: `invalid_source:${s}` });
      }
    }
  }
  if (
    req.confidence != null &&
    (!Number.isFinite(req.confidence) ||
      req.confidence < 0 ||
      req.confidence > 1)
  ) {
    issues.push({ field: 'confidence', message: 'must_be_0_1' });
  }
  // Sleep CONSTRAINT 必须敏感
  if (req.domain === 'SLEEP' && req.sensitivity === 'NORMAL') {
    issues.push({
      field: 'sensitivity',
      message: 'sleep_must_be_sensitive',
    });
  }
  return issues;
}

export function buildTravelerMemoryLedgerValue(
  req: WriteTravelerMemoryRequestV1,
): TravelerMemoryLedgerValueV1 {
  const sensitivity =
    req.sensitivity ?? defaultSensitivityForDomain(req.domain);
  const visibility =
    req.visibility ?? defaultVisibilityForDomain(req.domain, sensitivity);
  const override_policy =
    req.override_policy ??
    defaultOverridePolicyForScope(req.scope ?? 'GLOBAL_USER');
  const profileEligible =
    req.explicitConfirm === true || req.source.includes('EXPLICIT');

  return {
    contract: TRAVELER_MEMORY_OBJECT_SCHEMA,
    domain: req.domain,
    semantic_type: req.semantic_type,
    key: req.key.trim().toLowerCase().replace(/\s+/g, '_'),
    value: req.value,
    sensitivity,
    visibility,
    override_policy,
    source: [...req.source],
    profileEligible,
  };
}

function mapEventStatusToObjectStatus(
  event: MemoryEventV1,
): TravelerMemoryObjectStatus {
  if (event.status === 'INVALIDATED' || event.status === 'REDACTED') {
    return 'REVOKED';
  }
  if (event.status === 'SUPERSEDED') return 'DECAYED';
  if (event.status === 'CANDIDATE') return 'CANDIDATE';
  if (event.status === 'INFERRED') return 'OBSERVED';
  if (event.op === 'CONFIRM' || event.status === 'ACTIVE') {
    return event.source.type === 'USER_EXPLICIT' ? 'STABLE' : 'CONFIRMED';
  }
  return 'OBSERVED';
}

function isLedgerValue(v: unknown): v is TravelerMemoryLedgerValueV1 {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as TravelerMemoryLedgerValueV1).contract === TRAVELER_MEMORY_OBJECT_SCHEMA
  );
}

/**
 * MemoryEvent → TravelerMemoryObject（新 predicate 或 legacy 别名）。
 */
export function memoryEventToTravelerMemoryObject(
  event: MemoryEventV1,
): TravelerMemoryObjectV1 | null {
  const parts = resolvePredicateParts(event.predicate);
  if (!parts) return null;

  const envelope = isLedgerValue(event.value) ? event.value : null;
  const domain = envelope?.domain ?? parts.domain;
  const semantic_type = envelope?.semantic_type ?? parts.semantic_type;
  const key = envelope?.key ?? parts.key;
  const value = envelope ? envelope.value : event.value;

  const source: TravelerMemoryEvidenceSource[] = envelope?.source?.length
    ? [...envelope.source]
    : event.source.type === 'USER_EXPLICIT'
      ? ['EXPLICIT']
      : event.source.type === 'DECISION_OUTCOME'
        ? ['EPISODIC']
        : ['INFERRED'];

  const evidence_refs: MemoryEvidenceRefV1[] = [...(event.evidenceRefs ?? [])];
  const sensitivity =
    envelope?.sensitivity ??
    (domain === 'SLEEP' ? 'SENSITIVE' : 'NORMAL');
  const visibility =
    envelope?.visibility ??
    defaultVisibilityForDomain(domain, sensitivity);

  return {
    schemaId: TRAVELER_MEMORY_OBJECT_SCHEMA,
    version: 1,
    memory_id: event.memoryEventId,
    subject_id: event.subject.id,
    domain,
    semantic_type,
    key,
    value,
    scope: event.scope,
    confidence: event.confidence,
    status: mapEventStatusToObjectStatus(event),
    source,
    evidence_refs,
    evidence_count: evidence_refs.length,
    sensitivity,
    visibility,
    override_policy: envelope?.override_policy ?? 'L2_WINS',
    created_at: event.systemTime.recordedAt,
    last_observed_at: event.systemTime.recordedAt,
    last_confirmed_at:
      event.op === 'CONFIRM' ? event.systemTime.recordedAt : null,
  };
}

export function travelerMemoryObjectPredicate(
  req: Pick<WriteTravelerMemoryRequestV1, 'domain' | 'semantic_type' | 'key'>,
): string {
  return encodeTravelerMemoryPredicate({
    domain: req.domain,
    semantic_type: req.semantic_type,
    key: req.key,
  });
}
