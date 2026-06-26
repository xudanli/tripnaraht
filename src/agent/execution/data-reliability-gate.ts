import type { DecisionState, VerificationIssue } from '../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import type {
  DataReliabilityEntityRef,
  DataReliabilityEvidenceEnvelope,
  DataReliabilityFactType,
  DataReliabilityFinding,
  DataReliabilityGateResult,
  DataReliabilitySourceType,
} from './data-reliability.types';

const SEC = 1000;

export const DATA_RELIABILITY_TTL_SEC: Record<DataReliabilityFactType, number> = {
  WEATHER: 6 * 60 * 60,
  ROAD_STATUS: 60 * 60,
  OPENING_HOURS: 7 * 24 * 60 * 60,
  SAFETY_ALERT: 60 * 60,
  TRANSPORT_TIME: 15 * 60,
  FLIGHT_STATUS: 5 * 60,
  POI_EXISTENCE: 30 * 24 * 60 * 60,
};

const LOW_CONFIDENCE_THRESHOLD = 0.45;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseTimeMs(value: unknown): number | undefined {
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : undefined;
}

function clamp01(value: unknown, fallback = 0.7): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function parseEntityRef(value: Record<string, unknown>): DataReliabilityEntityRef {
  const rawType = String(value.type ?? '').trim().toUpperCase();
  const type: DataReliabilityEntityRef['type'] =
    rawType === 'POI' ||
    rawType === 'DAY' ||
    rawType === 'SEGMENT' ||
    rawType === 'BUDGET' ||
    rawType === 'DESTINATION'
      ? rawType
      : 'OTHER';
  const id = value.id != null ? String(value.id) : undefined;
  return id ? { type, id } : { type };
}

function normalizeSourceType(value: unknown): DataReliabilitySourceType {
  const s = String(value ?? '').trim().toUpperCase();
  if (s === 'OFFICIAL' || s === 'COMMERCIAL' || s === 'COMMUNITY' || s === 'MODEL' || s === 'USER') {
    return s;
  }
  return 'UNKNOWN';
}

function inferSourceType(provider: string): DataReliabilitySourceType {
  const p = provider.toLowerCase();
  if (p.includes('official') || p.includes('vedur') || p.includes('safetravel') || p.includes('road')) return 'OFFICIAL';
  if (p.includes('model') || p.includes('heuristic') || p.includes('llm')) return 'MODEL';
  if (p.includes('user')) return 'USER';
  if (p.includes('review') || p.includes('community')) return 'COMMUNITY';
  if (p) return 'COMMERCIAL';
  return 'UNKNOWN';
}

function inferFactTypeFromKey(key: string): DataReliabilityFactType | undefined {
  const k = key.toLowerCase();
  if (k.includes('weather') || k.includes('wind')) return 'WEATHER';
  if (k.includes('road') || k.includes('froad') || k.includes('closure')) return 'ROAD_STATUS';
  if (k.includes('opening')) return 'OPENING_HOURS';
  if (k.includes('safety') || k.includes('alert') || k.includes('advisory')) return 'SAFETY_ALERT';
  if (k.includes('transport') || k.includes('eta') || k.includes('route')) return 'TRANSPORT_TIME';
  if (k.includes('flight')) return 'FLIGHT_STATUS';
  if (k.includes('poi') || k.includes('place')) return 'POI_EXISTENCE';
  return undefined;
}

function makeEnvelope(params: {
  id: string;
  factType: DataReliabilityFactType;
  entityRef?: DataReliabilityEntityRef;
  value: unknown;
  provider: string;
  sourceType?: DataReliabilitySourceType;
  observedAt?: unknown;
  validUntil?: unknown;
  confidence?: unknown;
  ttlSec?: number;
}): DataReliabilityEvidenceEnvelope | undefined {
  const observedAtMs = parseTimeMs(params.observedAt);
  if (!observedAtMs) return undefined;
  const validUntilMs = parseTimeMs(params.validUntil);
  const provider = params.provider || 'unknown';
  return {
    id: params.id,
    factType: params.factType,
    entityRef: params.entityRef ?? { type: 'OTHER' },
    value: params.value,
    source: {
      provider,
      sourceType: params.sourceType ?? inferSourceType(provider),
    },
    observedAt: new Date(observedAtMs).toISOString(),
    ...(validUntilMs ? { validUntil: new Date(validUntilMs).toISOString() } : {}),
    confidence: clamp01(params.confidence),
    freshnessTtlSec: params.ttlSec ?? DATA_RELIABILITY_TTL_SEC[params.factType],
  };
}

function normalizeEnvelope(raw: unknown): DataReliabilityEvidenceEnvelope | undefined {
  if (!isRecord(raw)) return undefined;
  const factType = raw.factType ?? raw.fact_type ?? raw.type;
  const normalizedFact = inferFactTypeFromKey(String(factType ?? ''));
  if (!normalizedFact) return undefined;
  const id = String(raw.id ?? raw.evidence_id ?? `${normalizedFact.toLowerCase()}_${raw.observedAt ?? raw.retrieved_at ?? ''}`);
  const source = isRecord(raw.source) ? raw.source : {};
  const provider = String(source.provider ?? raw.provider ?? raw.source ?? 'unknown');
  return makeEnvelope({
    id,
    factType: normalizedFact,
    entityRef: isRecord(raw.entityRef) ? parseEntityRef(raw.entityRef) : { type: 'OTHER' },
    value: raw.value ?? raw.data ?? raw,
    provider,
    sourceType: normalizeSourceType(source.sourceType ?? raw.sourceType),
    observedAt: raw.observedAt ?? raw.observed_at ?? raw.data_timestamp ?? raw.retrieved_at ?? raw.last_verified_at,
    validUntil: raw.validUntil ?? raw.valid_until ?? raw.expires_at,
    confidence: raw.confidence,
    ttlSec: Number(raw.freshnessTtlSec ?? raw.freshness_ttl_sec) || undefined,
  });
}

function pushIfPresent(out: DataReliabilityEvidenceEnvelope[], env: DataReliabilityEvidenceEnvelope | undefined): void {
  if (env) out.push(env);
}

function collectFromEvidenceRegistry(researchData: Record<string, unknown> | undefined): DataReliabilityEvidenceEnvelope[] {
  const registry = researchData?.evidence_registry;
  const entries: unknown[] =
    registry instanceof Map
      ? Array.from(registry.values())
      : isRecord(registry)
        ? Object.values(registry)
        : [];
  return entries
    .map((row) => {
      if (!isRecord(row)) return undefined;
      const factType = inferFactTypeFromKey(String(row.source ?? row.source_title ?? row.evidence_id ?? ''));
      if (!factType) return undefined;
      return makeEnvelope({
        id: String(row.evidence_id ?? `${factType.toLowerCase()}_${row.last_verified_at ?? ''}`),
        factType,
        value: row.data ?? row.excerpt ?? row,
        provider: String(row.source ?? row.publisher ?? 'evidence_registry'),
        observedAt: row.data_timestamp ?? row.retrieved_at ?? row.last_verified_at,
        validUntil: isRecord(row.data) ? row.data.expires_at ?? row.data.validUntil : undefined,
        confidence: row.confidence,
      });
    })
    .filter((x): x is DataReliabilityEvidenceEnvelope => !!x);
}

export function collectDataReliabilityEvidence(
  dso: DecisionState,
  ctx: PhaseExecutorContext,
): DataReliabilityEvidenceEnvelope[] {
  const out: DataReliabilityEvidenceEnvelope[] = [];
  const rd = ctx.researchData;
  const standard = [
    ...((Array.isArray(rd?.__data_reliability_evidence) ? rd?.__data_reliability_evidence : []) as unknown[]),
    ...((Array.isArray(rd?.__evidence_envelopes) ? rd?.__evidence_envelopes : []) as unknown[]),
  ];
  out.push(...standard.map(normalizeEnvelope).filter((x): x is DataReliabilityEvidenceEnvelope => !!x));
  out.push(...collectFromEvidenceRegistry(rd));

  if (isRecord(rd?.weather_forecast)) {
    const w = rd.weather_forecast;
    const dq = isRecord(w.data_quality) ? w.data_quality : {};
    pushIfPresent(
      out,
      makeEnvelope({
        id: String(w.evidence_id ?? 'weather_forecast'),
        factType: 'WEATHER',
        value: w,
        provider: String(w.source ?? dq.source_type ?? 'weather_forecast'),
        observedAt: w.data_timestamp ?? w.retrieved_at ?? dq.retrieved_at ?? dso.environmentState?._weatherUpdateAt,
        validUntil: w.validUntil ?? w.expires_at ?? dq.expires_at,
        confidence: w.confidence ?? dq.confidence,
      }),
    );
  }

  if (isRecord(rd?.transport_evidence)) {
    const t = rd.transport_evidence;
    pushIfPresent(
      out,
      makeEnvelope({
        id: String(t.evidence_id ?? 'transport_evidence'),
        factType: 'TRANSPORT_TIME',
        value: t,
        provider: String(t.source ?? 'transport_evidence'),
        observedAt: t.data_timestamp ?? t.retrieved_at ?? t.last_verified_at,
        validUntil: t.validUntil ?? t.expires_at,
        confidence: t.confidence,
      }),
    );
  }

  const openingRows = Array.isArray(rd?.opening_hours_evidence)
    ? rd?.opening_hours_evidence
    : isRecord(rd?.opening_hours_evidence) && Array.isArray(rd.opening_hours_evidence.opening_hours)
      ? rd.opening_hours_evidence.opening_hours
      : [];
  for (const row of openingRows as unknown[]) {
    if (!isRecord(row)) continue;
    pushIfPresent(
      out,
      makeEnvelope({
        id: String(row.evidence_id ?? `opening_hours_${row.poi_id ?? 'unknown'}`),
        factType: 'OPENING_HOURS',
        entityRef: { type: 'POI', id: row.poi_id ? String(row.poi_id) : undefined },
        value: row.opening_hours ?? row,
        provider: String(row.source ?? 'opening_hours.get'),
        observedAt: row.data_timestamp ?? row.retrieved_at ?? row.last_verified_at,
        validUntil: row.validUntil ?? row.expires_at,
        confidence: row.confidence,
      }),
    );
  }

  const flights = dso.environmentState?.flights;
  if (Array.isArray(flights)) {
    for (const f of flights) {
      if (!isRecord(f)) continue;
      pushIfPresent(
        out,
        makeEnvelope({
          id: String(f.flight ?? f.id ?? 'flight_status'),
          factType: 'FLIGHT_STATUS',
          entityRef: { type: 'SEGMENT', id: f.flight ? String(f.flight) : undefined },
          value: f.status ?? f,
          provider: String(f.source ?? 'environmentState.flights'),
          observedAt: f.observedAt ?? f.updatedAt ?? f.data_timestamp,
          validUntil: f.validUntil ?? f.expires_at,
          confidence: f.confidence,
        }),
      );
    }
  }

  const unique = new Map<string, DataReliabilityEvidenceEnvelope>();
  for (const e of out) unique.set(e.id, e);
  return Array.from(unique.values());
}

function isStale(e: DataReliabilityEvidenceEnvelope, nowMs: number): boolean {
  const validUntil = parseTimeMs(e.validUntil);
  if (validUntil !== undefined) return validUntil < nowMs;
  const observedAt = parseTimeMs(e.observedAt);
  return observedAt !== undefined && observedAt + e.freshnessTtlSec * SEC < nowMs;
}

function formatFactTypeZh(factType: DataReliabilityFactType): string {
  switch (factType) {
    case 'WEATHER':
      return '天气';
    case 'ROAD_STATUS':
      return '道路状态';
    case 'OPENING_HOURS':
      return '开放时间';
    case 'SAFETY_ALERT':
      return '安全警报';
    case 'TRANSPORT_TIME':
      return '交通时间';
    case 'FLIGHT_STATUS':
      return '航班状态';
    case 'POI_EXISTENCE':
      return '地点存在性';
  }
}

function buildConflictFindings(evidence: DataReliabilityEvidenceEnvelope[]): DataReliabilityFinding[] {
  const groups = new Map<string, DataReliabilityEvidenceEnvelope[]>();
  for (const e of evidence) {
    const key = `${e.factType}:${e.entityRef.type}:${e.entityRef.id ?? ''}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const findings: DataReliabilityFinding[] = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const normalizedValues = new Set(arr.map((x) => JSON.stringify(x.value)));
    if (normalizedValues.size < 2) continue;
    const official = arr.some((x) => x.source.sourceType === 'OFFICIAL');
    const highConfidence = arr.filter((x) => x.confidence >= 0.7).length >= 2;
    if (!official && !highConfidence) continue;
    findings.push({
      kind: 'CONFLICT',
      factType: arr[0].factType,
      entityRef: arr[0].entityRef,
      evidenceIds: arr.map((x) => x.id),
      message: `${formatFactTypeZh(arr[0].factType)}存在多源冲突，已降低确定性判断强度。`,
      confidenceImpact: -0.08,
    });
  }
  return findings;
}

export function evaluateDataReliability(
  dso: DecisionState,
  ctx: PhaseExecutorContext,
  opts?: { nowMs?: number },
): DataReliabilityGateResult {
  const nowMs = opts?.nowMs ?? Date.now();
  const evidence = collectDataReliabilityEvidence(dso, ctx);
  const findings: DataReliabilityFinding[] = [];

  for (const e of evidence) {
    if (isStale(e, nowMs)) {
      findings.push({
        kind: 'STALE',
        factType: e.factType,
        entityRef: e.entityRef,
        evidenceIds: [e.id],
        message: `${formatFactTypeZh(e.factType)}证据已过期或超过建议 TTL，不能支撑强确定性判断。`,
        confidenceImpact: -0.06,
      });
    }
    if (e.confidence < LOW_CONFIDENCE_THRESHOLD) {
      findings.push({
        kind: 'LOW_CONFIDENCE',
        factType: e.factType,
        entityRef: e.entityRef,
        evidenceIds: [e.id],
        message: `${formatFactTypeZh(e.factType)}证据置信度偏低。`,
        confidenceImpact: -0.04,
      });
    }
    if (e.source.sourceType === 'MODEL') {
      findings.push({
        kind: 'MODEL_ONLY',
        factType: e.factType,
        entityRef: e.entityRef,
        evidenceIds: [e.id],
        message: `${formatFactTypeZh(e.factType)}仅来自模型或启发式推断，需要外部事实复核。`,
        confidenceImpact: -0.04,
      });
    }
  }
  findings.push(...buildConflictFindings(evidence));

  const confidenceDelta = Math.max(-0.25, findings.reduce((sum, f) => sum + f.confidenceImpact, 0));
  const disclosure =
    findings.length === 0
      ? evidence.length > 0
        ? `已检查 ${evidence.length} 条事实证据的新鲜度与置信度，未发现可靠性降级。`
        : '未发现可做可靠性审计的结构化事实证据；本轮不基于数据新鲜度给出强加分。'
      : `发现 ${findings.length} 个数据可靠性问题；涉及 ${Array.from(new Set(findings.map((f) => formatFactTypeZh(f.factType)))).join('、')}。`;

  return { evidence, findings, confidenceDelta, disclosure };
}

export function dataReliabilityFindingsToVerificationIssues(
  findings: DataReliabilityFinding[],
  nowIso = new Date().toISOString(),
): VerificationIssue[] {
  return findings.map((f) => ({
    code: 'CONFIDENCE_DEGRADED',
    class: 'ADVISORY',
    message: `[数据可靠性] ${f.message}（证据: ${f.evidenceIds.join(', ') || 'n/a'}）`,
    source: 'OTHER',
    at: nowIso,
    entityRef: f.entityRef,
    suggestedActions: [{ action: 'ASK_USER', detail: '出发前复核该事实来源，或采用更保守的替代方案' }],
    confidence01: Math.max(0, 1 + f.confidenceImpact),
    metadata: {
      confidence_impact: f.confidenceImpact,
      evidenceKind: 'NONE',
    },
  }));
}
