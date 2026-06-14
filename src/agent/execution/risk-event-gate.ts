import type { DecisionState, VerificationIssue } from '../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import type {
  RiskGateResult,
  TravelRiskCategory,
  TravelRiskEntityRef,
  TravelRiskEvent,
  TravelRiskSourceType,
  TravelRiskUrgency,
} from './risk-event.types';
import { normalizeTravelSignals } from './travel-signal-normalizer';
import { assessRiskImpacts } from './trip-impact-graph';
import type { TravelSignalEvent } from './travel-signal.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clamp01(value: unknown, fallback = 0.7): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeUrgency(value: unknown): TravelRiskUrgency {
  const n = Math.round(Number(value));
  if (n >= 1 && n <= 5) return n as TravelRiskUrgency;
  return 3;
}

function normalizeCategory(value: unknown): TravelRiskCategory | undefined {
  const s = String(value ?? '').trim().toUpperCase();
  if (
    s === 'WEATHER_NATURAL' ||
    s === 'TRANSPORT_DISRUPTION' ||
    s === 'SAFETY_SECURITY' ||
    s === 'HEALTH' ||
    s === 'ROAD_ACCESS' ||
    s === 'OPENING_CLOSURE'
  ) {
    return s;
  }
  if (/weather|wind|storm|snow|rain|natural|disaster/i.test(s)) return 'WEATHER_NATURAL';
  if (/transport|flight|delay|cancel|rail|transit/i.test(s)) return 'TRANSPORT_DISRUPTION';
  if (/road|closure|froad|access/i.test(s)) return 'ROAD_ACCESS';
  if (/opening|closed|closure|poi/i.test(s)) return 'OPENING_CLOSURE';
  if (/safety|security|protest|conflict|crime|alert|advisory/i.test(s)) return 'SAFETY_SECURITY';
  if (/health|medical|disease|epidemic/i.test(s)) return 'HEALTH';
  return undefined;
}

function normalizeSourceType(value: unknown): TravelRiskSourceType {
  const s = String(value ?? '').trim().toUpperCase();
  if (s === 'OFFICIAL' || s === 'COMMERCIAL' || s === 'COMMUNITY' || s === 'MODEL') return s;
  return 'UNKNOWN';
}

function normalizeEntityRef(raw: unknown, fallback: TravelRiskEntityRef = { type: 'OTHER' }): TravelRiskEntityRef {
  if (!isRecord(raw)) return fallback;
  const t = String(raw.type ?? fallback.type).trim().toUpperCase();
  const allowed = new Set(['DESTINATION', 'DAY', 'SEGMENT', 'POI', 'FLIGHT', 'ROAD', 'OTHER']);
  return {
    type: (allowed.has(t) ? t : fallback.type) as TravelRiskEntityRef['type'],
    ...(raw.id !== undefined ? { id: String(raw.id) } : fallback.id ? { id: fallback.id } : {}),
  };
}

function normalizeRiskEvent(raw: unknown): TravelRiskEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const category = normalizeCategory(raw.category ?? raw.type);
  if (!category) return undefined;
  const source = isRecord(raw.source) ? raw.source : {};
  const id = String(raw.id ?? raw.event_id ?? `${category.toLowerCase()}_${raw.observedAt ?? Date.now()}`);
  const observedAt = String(raw.observedAt ?? raw.observed_at ?? raw.data_timestamp ?? raw.retrieved_at ?? '').trim();
  if (!observedAt) return undefined;
  const tw = isRecord(raw.timeWindow) ? raw.timeWindow : isRecord(raw.time_window) ? raw.time_window : undefined;
  return {
    id,
    category,
    urgency: normalizeUrgency(raw.urgency ?? raw.severity),
    entityRef: normalizeEntityRef(raw.entityRef ?? raw.entity_ref),
    ...(tw
      ? {
          timeWindow: {
            ...(tw.startsAt ? { startsAt: String(tw.startsAt) } : {}),
            ...(tw.endsAt ? { endsAt: String(tw.endsAt) } : {}),
          },
        }
      : {}),
    message: String(raw.message ?? raw.description ?? category),
    source: {
      provider: String(source.provider ?? raw.provider ?? raw.source ?? 'unknown'),
      sourceType: normalizeSourceType(source.sourceType ?? source.source_type ?? raw.sourceType),
    },
    validUntil: raw.validUntil || raw.valid_until ? String(raw.validUntil ?? raw.valid_until) : undefined,
    observedAt,
    confidence: clamp01(raw.confidence),
    suggestedAction: normalizeSuggestedAction(raw.suggestedAction ?? raw.suggested_action),
  };
}

function normalizeSuggestedAction(value: unknown): TravelRiskEvent['suggestedAction'] | undefined {
  const s = String(value ?? '').trim().toUpperCase();
  if (
    s === 'RECHECK' ||
    s === 'DELAY' ||
    s === 'REORDER' ||
    s === 'REPLACE' ||
    s === 'ADD_BUFFER' ||
    s === 'ASK_USER' ||
    s === 'AVOID'
  ) {
    return s;
  }
  return undefined;
}

function eventFromFlight(row: Record<string, unknown>): TravelRiskEvent | undefined {
  const status = String(row.status ?? '').toLowerCase();
  if (!/delayed|cancelled|canceled|diverted|disrupted/.test(status)) return undefined;
  const flight = String(row.flight ?? row.id ?? 'flight');
  const observedAt = String(row.observedAt ?? row.updatedAt ?? row.data_timestamp ?? '').trim();
  if (!observedAt) return undefined;
  const cancelled = /cancelled|canceled/.test(status);
  return {
    id: `flight_${flight}_${status}`,
    category: 'TRANSPORT_DISRUPTION',
    urgency: cancelled ? 5 : 4,
    entityRef: { type: 'FLIGHT', id: flight },
    message: cancelled ? `航班 ${flight} 已取消。` : `航班 ${flight} 存在延误或中断风险。`,
    source: { provider: String(row.source ?? 'environmentState.flights'), sourceType: 'COMMERCIAL' },
    observedAt,
    confidence: clamp01(row.confidence, 0.8),
    suggestedAction: cancelled ? 'ASK_USER' : 'ADD_BUFFER',
  };
}

function eventFromSignal(signal: TravelSignalEvent): TravelRiskEvent | undefined {
  const observedAt = signal.observedAt;
  const confidence = signal.severity === 'HIGH' ? 0.85 : signal.severity === 'MEDIUM' ? 0.7 : 0.55;
  switch (signal.type) {
    case 'WEATHER_CHANGED':
      return {
        id: `risk_from_${signal.id}`,
        category: 'WEATHER_NATURAL',
        urgency: signal.severity === 'HIGH' ? 5 : 4,
        entityRef: signal.entityRef,
        message: '天气或自然环境信号发生变化，可能影响当前行程。',
        source: { provider: signal.source, sourceType: signal.source.includes('environmentState') ? 'MODEL' : 'UNKNOWN' },
        observedAt,
        confidence,
        suggestedAction: 'RECHECK',
      };
    case 'ROAD_CLOSED':
      return {
        id: `risk_from_${signal.id}`,
        category: 'ROAD_ACCESS',
        urgency: 5,
        entityRef: signal.entityRef,
        message: '道路或通行条件出现关闭信号。',
        source: { provider: signal.source, sourceType: 'UNKNOWN' },
        observedAt,
        confidence,
        suggestedAction: 'REPLACE',
      };
    case 'FLIGHT_CANCELLED':
    case 'FLIGHT_DELAYED':
      return {
        id: `risk_from_${signal.id}`,
        category: 'TRANSPORT_DISRUPTION',
        urgency: signal.type === 'FLIGHT_CANCELLED' ? 5 : 4,
        entityRef: signal.entityRef,
        message: signal.type === 'FLIGHT_CANCELLED' ? '航班取消信号可能影响后续安排。' : '航班延误信号可能压缩后续缓冲。',
        source: { provider: signal.source, sourceType: 'COMMERCIAL' },
        observedAt,
        confidence,
        suggestedAction: signal.type === 'FLIGHT_CANCELLED' ? 'ASK_USER' : 'ADD_BUFFER',
      };
    case 'POI_CLOSED':
      return {
        id: `risk_from_${signal.id}`,
        category: 'OPENING_CLOSURE',
        urgency: signal.severity === 'HIGH' ? 5 : 4,
        entityRef: signal.entityRef,
        message: '地点关闭信号可能影响当天锚点。',
        source: { provider: signal.source, sourceType: 'UNKNOWN' },
        observedAt,
        confidence,
        suggestedAction: 'REPLACE',
      };
    case 'SAFETY_ALERT':
      return {
        id: `risk_from_${signal.id}`,
        category: 'SAFETY_SECURITY',
        urgency: signal.severity === 'HIGH' ? 5 : 4,
        entityRef: signal.entityRef,
        message: '安全警报信号与当前行程相关。',
        source: { provider: signal.source, sourceType: 'UNKNOWN' },
        observedAt,
        confidence,
        suggestedAction: 'ASK_USER',
      };
    case 'DATA_STALE':
      return undefined;
  }
}

function collectRiskEvents(dso: DecisionState, ctx: PhaseExecutorContext): TravelRiskEvent[] {
  const out: TravelRiskEvent[] = [];
  const rd = ctx.researchData;
  const rawEvents = [
    ...((Array.isArray(rd?.__risk_events) ? rd?.__risk_events : []) as unknown[]),
    ...((Array.isArray(rd?.risk_events) ? rd?.risk_events : []) as unknown[]),
  ];
  out.push(...rawEvents.map(normalizeRiskEvent).filter((x): x is TravelRiskEvent => !!x));
  out.push(...normalizeTravelSignals(dso, ctx).map(eventFromSignal).filter((x): x is TravelRiskEvent => !!x));

  const flights = dso.environmentState?.flights;
  if (Array.isArray(flights)) {
    for (const row of flights) {
      if (isRecord(row)) {
        const ev = eventFromFlight(row);
        if (ev) out.push(ev);
      }
    }
  }

  const weatherRisk = Number(dso.environmentState?.weatherRisk);
  if (Number.isFinite(weatherRisk) && weatherRisk >= 0.7) {
    out.push({
      id: `weather_risk_${ctx.requestId}`,
      category: 'WEATHER_NATURAL',
      urgency: weatherRisk >= 0.9 ? 5 : 4,
      entityRef: { type: 'DESTINATION', id: String(ctx.tripPlanRequest?.destination ?? '') || ctx.requestId },
      message: '天气风险评分较高，可能影响户外活动或交通可达性。',
      source: { provider: 'environmentState.weatherRisk', sourceType: 'MODEL' },
      observedAt: new Date().toISOString(),
      confidence: Math.min(0.9, Math.max(0.6, weatherRisk)),
      suggestedAction: 'RECHECK',
    });
  }

  const roadConditions = dso.environmentState?.roadConditions;
  if (isRecord(roadConditions)) {
    for (const [id, value] of Object.entries(roadConditions)) {
      const status = isRecord(value) ? value.status : value;
      if (!/closed|closure|blocked|cancelled|canceled/i.test(String(status ?? ''))) continue;
      out.push({
        id: `road_${id}_closed`,
        category: 'ROAD_ACCESS',
        urgency: 5,
        entityRef: { type: 'ROAD', id },
        message: `道路或通行点 ${id} 当前不可用。`,
        source: { provider: 'environmentState.roadConditions', sourceType: 'UNKNOWN' },
        observedAt: new Date().toISOString(),
        confidence: 0.75,
        suggestedAction: 'REPLACE',
      });
    }
  }

  const unique = new Map<string, TravelRiskEvent>();
  for (const event of out) unique.set(event.id, event);
  return Array.from(unique.values());
}

function mapEntityRef(ref: TravelRiskEntityRef): VerificationIssue['entityRef'] {
  switch (ref.type) {
    case 'POI':
      return { type: 'POI', id: ref.id };
    case 'DAY':
      return { type: 'DAY', id: ref.id };
    case 'SEGMENT':
    case 'FLIGHT':
    case 'ROAD':
      return { type: 'SEGMENT', id: ref.id };
    case 'DESTINATION':
      return { type: 'DESTINATION', id: ref.id };
    default:
      return { type: 'OTHER', id: ref.id };
  }
}

function mapIssueCode(event: TravelRiskEvent): VerificationIssue['code'] {
  switch (event.category) {
    case 'WEATHER_NATURAL':
      return 'WEATHER_RISK';
    case 'ROAD_ACCESS':
      return 'ROUTE_INFEASIBLE';
    case 'TRANSPORT_DISRUPTION':
      return event.urgency >= 5 ? 'ROUTE_INFEASIBLE' : 'TIME_WINDOW_BREACH';
    case 'OPENING_CLOSURE':
      return 'POI_CLOSED';
    case 'SAFETY_SECURITY':
    case 'HEALTH':
      return event.urgency >= 5 ? 'DESTINATION_CLOSED_DISASTER' : 'CONFIDENCE_DEGRADED';
  }
}

function mapSuggestedAction(event: TravelRiskEvent): VerificationIssue['suggestedActions'] {
  const action = event.suggestedAction;
  if (action === 'REPLACE' || action === 'AVOID') return [{ action: 'REPLACE', detail: '采用更低风险替代路线或替代地点' }];
  if (action === 'REORDER') return [{ action: 'REORDER', detail: '调整当天顺序，避免把关键体验压到风险窗口内' }];
  if (action === 'ADD_BUFFER' || action === 'DELAY') return [{ action: 'RELAX', detail: '增加交通/等待缓冲，或延后执行该安排' }];
  if (action === 'ASK_USER') return [{ action: 'ASK_USER', detail: '需要用户确认是否接受该风险并自行处理外部安排' }];
  return [{ action: 'ASK_USER', detail: '复核风险来源，并选择保守替代方案' }];
}

export function riskEventsToVerificationIssues(
  events: TravelRiskEvent[],
  nowIso = new Date().toISOString(),
): VerificationIssue[] {
  return events.map((event) => ({
    code: mapIssueCode(event),
    class: event.urgency >= 5 ? 'CONFLICT' : event.urgency >= 4 ? 'CONFLICT' : 'ADVISORY',
    message: `[风险事件|${event.category}|U${event.urgency}] ${event.message}`,
    source: 'OTHER',
    at: nowIso,
    entityRef: mapEntityRef(event.entityRef),
    suggestedActions: mapSuggestedAction(event),
    confidence01: event.confidence,
    metadata: {
      confidence_impact: event.urgency >= 5 ? -0.18 : event.urgency >= 4 ? -0.1 : -0.04,
      evidenceKind: 'NONE',
    },
  }));
}

export function evaluateRiskEvents(dso: DecisionState, ctx: PhaseExecutorContext): RiskGateResult {
  const events = collectRiskEvents(dso, ctx);
  const impactAssessments = assessRiskImpacts(events, ctx);
  const critical = events.filter((e) => e.urgency >= 4);
  const confidenceDelta = Math.max(
    -0.35,
    events.reduce((sum, e) => sum + (e.urgency >= 5 ? -0.18 : e.urgency >= 4 ? -0.1 : -0.04), 0),
  );
  const recommendedActions = Array.from(
    new Set(
      events
        .map((e) => e.suggestedAction)
        .filter((x): x is NonNullable<TravelRiskEvent['suggestedAction']> => !!x),
    ),
  );
  return {
    events,
    issueCount: events.length,
    confidenceDelta,
    audit: {
      riskAssessmentCompleted: true,
      criticalRisks: critical.map((e) => e.id),
      evidenceIds: events.map((e) => e.id),
      userDisclosure:
        events.length === 0
          ? '未发现结构化风险事件；本轮仅基于常规可行性检查。'
          : `发现 ${events.length} 个结构化风险事件，其中 ${critical.length} 个需要优先处理。`,
      recommendedActions,
      unresolvedRisks: critical.filter((e) => !e.suggestedAction).map((e) => e.id),
      impactAssessments,
    },
  };
}
