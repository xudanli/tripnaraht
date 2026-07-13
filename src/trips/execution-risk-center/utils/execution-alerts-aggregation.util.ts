/**
 * Aggregates ActiveRisk[] → execution-alerts v2 (primary + impacts + independent).
 * @see execution-alerts risk aggregation semantics (iOS)
 */

import type { ActiveRisk, ActiveRiskCode, ActiveRiskType } from '../types/execution-risk.types';
import {
  alertLevelSortWeight,
  executionGateToAlertLevel,
  isExecutionAlertEligibleRisk,
  isScheduleTightnessRisk,
} from './execution-alerts-projection.util';
import { shouldExcludeRiskFromPrimaryImpacts } from './execution-alert-knowledge-noise.util';

export type ExecutionAlertPresentationRole = 'PRIMARY' | 'IMPACT' | 'INDEPENDENT';

export type ExecutionAlertRequiredAction = 'NONE' | 'REPLAN' | 'STOP' | 'ACKNOWLEDGE';

export type ExecutionAlertImpactType =
  | 'SAFETY'
  | 'ROUTE'
  | 'DELAY'
  | 'ITINERARY'
  | 'ACTIVITY'
  | 'CONSTRAINT';

export interface ExecutionAlertImpactProjection {
  id: string;
  type: ExecutionAlertImpactType;
  label: string;
  sourceRiskId?: string;
}

export interface AggregatedExecutionAlertRisk {
  risk: ActiveRisk;
  role: ExecutionAlertPresentationRole;
  parentRiskId?: string;
}

export interface ExecutionAlertsAggregationResult {
  primary: AggregatedExecutionAlertRisk | null;
  independent: AggregatedExecutionAlertRisk[];
  impacts: ExecutionAlertImpactProjection[];
  listAlerts: AggregatedExecutionAlertRisk[];
}

const ROOT_CAUSE_TYPES: ActiveRiskType[] = ['ENVIRONMENT', 'ROAD_TRANSPORT', 'MEMBER_STATE'];

const TYPE_PRIORITY: Record<ActiveRiskType, number> = {
  ENVIRONMENT: 0,
  ROAD_TRANSPORT: 1,
  MEMBER_STATE: 2,
  ROUTE_EXECUTION: 3,
  BOOKING_FULFILLMENT: 4,
  TEAM_COORDINATION: 5,
  SCHEDULE: 6,
  RESOURCE: 7,
};

const GATE_PRIORITY: Record<string, number> = {
  STOP: 0,
  REPLAN_REQUIRED: 1,
  AT_RISK: 2,
  ALLOW: 3,
};

export function aggregateExecutionAlertRisks(
  risks: ActiveRisk[],
  forcedPrimary?: ActiveRisk,
): ExecutionAlertsAggregationResult {
  const primaryRisk = forcedPrimary ?? selectPrimaryRisk(risks);
  const eligible = risks.filter(isExecutionAlertEligibleRisk);
  const dedupedEligible = dedupeRelatedRootRisks(eligible);

  const independent: AggregatedExecutionAlertRisk[] = [];
  const impactSourceRisks: ActiveRisk[] = [];

  for (const risk of dedupedEligible) {
    if (primaryRisk && risk.id === primaryRisk.id) continue;
    if (primaryRisk && isDerivedImpactOf(risk, primaryRisk)) {
      if (shouldSkipImpactSourceRisk(risk, primaryRisk)) continue;
      impactSourceRisks.push(risk);
    } else {
      independent.push({ risk, role: 'INDEPENDENT' });
    }
  }

  // Non-eligible risks (e.g. SCHEDULE / same_day_travel) — fold only when causally linked to primary
  for (const risk of risks) {
    if (isExecutionAlertEligibleRisk(risk)) continue;
    if (primaryRisk && risk.id === primaryRisk.id) continue;
    if (primaryRisk && isDerivedImpactOf(risk, primaryRisk)) {
      if (shouldSkipImpactSourceRisk(risk, primaryRisk)) continue;
      if (!impactSourceRisks.some((r) => r.id === risk.id)) {
        impactSourceRisks.push(risk);
      }
    }
  }

  const primary: AggregatedExecutionAlertRisk | null = primaryRisk
    ? { risk: primaryRisk, role: 'PRIMARY' }
    : null;

  const impacts = buildImpactProjections(primaryRisk, impactSourceRisks, risks);
  const listAlerts = [
    ...(primary ? [primary] : []),
    ...independent,
  ].sort((a, b) => compareAlertRiskPriority(a.risk, b.risk));

  return { primary, independent, impacts, listAlerts };
}

export function resolvePrimaryRiskId(risks: ActiveRisk[], riskId: string): string {
  const primary = selectPrimaryRisk(risks);
  if (!primary) return riskId;
  const risk = risks.find((r) => r.id === riskId);
  if (!risk) return riskId;
  if (risk.id === primary.id) return primary.id;
  if (isDerivedImpactOf(risk, primary)) {
    return primary.id;
  }
  return riskId;
}

export function resolveRequiredAction(
  level: 'STOP' | 'REPLAN_REQUIRED' | 'AT_RISK',
): ExecutionAlertRequiredAction {
  if (level === 'STOP') return 'STOP';
  if (level === 'REPLAN_REQUIRED') return 'REPLAN';
  return 'NONE';
}

export function mapRiskTypeLabel(risk: ActiveRisk): string {
  switch (risk.code) {
    case 'WEATHER_STRONG_WIND':
    case 'WEATHER_HEAVY_RAIN':
    case 'WEATHER_SEVERE':
      return 'SEVERE_WEATHER';
    case 'ROAD_CLOSED':
      return 'ROAD_CLOSURE';
    case 'ROAD_SLIPPERY':
      return 'ROAD_HAZARD';
    case 'SCHEDULE_DELAY':
      return 'SCHEDULE_DELAY';
    default:
      return risk.type;
  }
}

export function buildBannerTitle(risk: ActiveRisk): string {
  if (risk.code === 'WEATHER_STRONG_WIND' || risk.code === 'WEATHER_SEVERE') {
    return '强风天气影响当前行程';
  }
  if (risk.code === 'WEATHER_HEAVY_RAIN') {
    return '强降雨影响当前行程';
  }
  if (risk.code === 'ROAD_CLOSED') {
    return '道路封闭影响当前行程';
  }
  if (risk.executionGate === 'STOP') {
    return '当前行程无法按原计划执行';
  }
  if (risk.executionGate === 'REPLAN_REQUIRED') {
    return '需要重新规划部分行程';
  }
  return risk.title;
}

export function buildBannerDetail(
  risk: ActiveRisk,
  impacts: ExecutionAlertImpactProjection[],
): string {
  const routeImpact = impacts.find((i) => i.type === 'ROUTE');
  if (routeImpact) {
    const route = routeImpact.label.replace(/^影响路段：/, '');
    return `${route}存在安全风险，当前不建议按原计划出发。`;
  }
  const firstClause = risk.summary.split(/[；;。]/)[0]?.trim();
  if (firstClause && firstClause.length <= 80) {
    return firstClause.endsWith('。') ? firstClause : `${firstClause}。`;
  }
  return `${risk.title}，请查看影响后再决定是否继续执行。`;
}

export function buildActionOrientedRecommendation(input: {
  primary: ActiveRisk | null;
  requiredAction: ExecutionAlertRequiredAction;
  advisoryDetail?: string;
}): { title: string; detail: string } | null {
  const { primary, requiredAction, advisoryDetail } = input;
  if (!primary) {
    return { title: '建议', detail: '可继续按当前计划执行' };
  }

  const primaryClause = primary.summary.split(/[；;。]/)[0]?.trim() ?? primary.title;
  if (advisoryDetail?.trim()) {
    const advisory = advisoryDetail.trim();
    if (!textOverlaps(advisory, primaryClause) && !textOverlaps(advisory, primary.title)) {
      return { title: '建议', detail: advisory };
    }
  }

  if (requiredAction === 'STOP') {
    return {
      title: '优先确认替代路线',
      detail: '在风险解除或改走备选方案前，请勿按原计划出发。',
    };
  }
  if (requiredAction === 'REPLAN') {
    return {
      title: '优先处理路线安全',
      detail: '确认替代方案后再恢复执行，避免重复暴露于风险路段。',
    };
  }
  return {
    title: '关注风险变化',
    detail: '留意环境变化并在必要时进入待调整事项处理。',
  };
}

function selectPrimaryRisk(risks: ActiveRisk[]): ActiveRisk | null {
  const eligible = dedupeRelatedRootRisks(risks.filter(isExecutionAlertEligibleRisk));
  if (eligible.length === 0) return null;
  return [...eligible].sort(compareAlertRiskPriority)[0] ?? null;
}

function dedupeRelatedRootRisks(risks: ActiveRisk[]): ActiveRisk[] {
  const byFamily = new Map<string, ActiveRisk>();
  for (const risk of [...risks].sort(compareAlertRiskPriority)) {
    const family = rootRiskFamilyKey(risk);
    if (!byFamily.has(family)) {
      byFamily.set(family, risk);
    }
  }
  return [...byFamily.values()].sort(compareAlertRiskPriority);
}

function rootRiskFamilyKey(risk: ActiveRisk): string {
  if (risk.type === 'ENVIRONMENT') {
    const scope =
      risk.affectedActivities[0]?.id ??
      risk.affectedRouteSegments[0]?.id ??
      risk.affectedLocations[0]?.id ??
      'trip';
    return `env:${risk.code}:${scope}`;
  }
  if (risk.type === 'ROAD_TRANSPORT') {
    return `road:${risk.code}:${risk.affectedRouteSegments[0]?.id ?? risk.riskKey}`;
  }
  return `risk:${risk.id}`;
}

export function isDerivedImpactOf(risk: ActiveRisk, primary: ActiveRisk): boolean {
  if (shouldExcludeRiskFromPrimaryImpacts(risk, primary)) return false;
  if (risk.causalParentId && risk.causalParentId === primary.id) return true;
  if (
    risk.generationMode === 'CAUSAL_DERIVATION' &&
    risk.rootEventId &&
    primary.rootEventId &&
    risk.rootEventId === primary.rootEventId
  ) {
    return true;
  }
  if (isScheduleTightnessRisk(risk) || risk.type === 'SCHEDULE') {
    return isScheduleDerivedFromPrimary(risk, primary);
  }
  if (risk.type === 'ENVIRONMENT' && primary.type === 'ENVIRONMENT') {
    if (risk.id === primary.id) return false;
    return sharesAffectedScope(risk, primary) || isWeatherCode(risk.code);
  }
  if (
    primary.type === 'ENVIRONMENT' &&
    risk.sourceRefs.some((s) => s.sourceSystem === 'ATTENTION_QUEUE') &&
    isWeatherCode(risk.code)
  ) {
    return true;
  }
  if (
    primary.type === 'ENVIRONMENT' &&
    risk.type === 'ROAD_TRANSPORT' &&
    (sharesAffectedScope(risk, primary) || risk.executionGate !== 'STOP')
  ) {
    return true;
  }
  return false;
}

/** Schedule impact only when same day or shared activity/route scope — not whole-trip fold. */
export function isScheduleDerivedFromPrimary(risk: ActiveRisk, primary: ActiveRisk): boolean {
  if (!isRootCauseRisk(primary)) return false;
  if (!isScheduleTightnessRisk(risk) && risk.type !== 'SCHEDULE') return false;
  if (sharesAffectedScope(risk, primary)) return true;
  return sharesSameDay(risk, primary);
}

export function extractRiskDayNumbers(risk: ActiveRisk): number[] {
  const days = new Set<number>();
  const parts = risk.riskKey.split('|');
  const subject = parts[3] ?? '';
  const scope = parts[4] ?? '';

  const subjectDay = subject.match(/(?:^|:)day[\-_]?(\d+)\b/i);
  if (subjectDay) days.add(Number(subjectDay[1]));

  const scopeDay = scope.match(/^day-(\d+)$/i);
  if (scopeDay) days.add(Number(scopeDay[1]));

  if (subject.toLowerCase() === 'travel' && /^\d+$/.test(scope)) {
    days.add(Number(scope));
  }

  for (const ref of [...risk.affectedActivities, ...risk.affectedLocations]) {
    const idDay = ref.id.match(/^day-(\d+)$/i);
    if (idDay) days.add(Number(idDay[1]));
    const labelDay = ref.label.match(/第\s*(\d+)\s*天/);
    if (labelDay) days.add(Number(labelDay[1]));
  }

  for (const match of risk.summary.matchAll(/第\s*(\d+)\s*天/g)) {
    days.add(Number(match[1]));
  }
  for (const match of risk.title.matchAll(/第\s*(\d+)\s*天/g)) {
    days.add(Number(match[1]));
  }

  return [...days].sort((a, b) => a - b);
}

function sharesSameDay(a: ActiveRisk, b: ActiveRisk): boolean {
  const daysA = extractRiskDayNumbers(a);
  const daysB = extractRiskDayNumbers(b);
  if (daysA.length === 0 || daysB.length === 0) return false;
  return daysA.some((d) => daysB.includes(d));
}

function isRootCauseRisk(risk: ActiveRisk): boolean {
  return ROOT_CAUSE_TYPES.includes(risk.type) && risk.executionGate !== 'ALLOW';
}

function isWeatherCode(code: ActiveRiskCode): boolean {
  return (
    code === 'WEATHER_STRONG_WIND' ||
    code === 'WEATHER_HEAVY_RAIN' ||
    code === 'WEATHER_SEVERE'
  );
}

function sharesAffectedScope(a: ActiveRisk, b: ActiveRisk): boolean {
  const ids = new Set(
    [...a.affectedActivities, ...a.affectedRouteSegments, ...a.affectedLocations].map((x) => x.id),
  );
  if (
    [...b.affectedActivities, ...b.affectedRouteSegments, ...b.affectedLocations].some((x) =>
      ids.has(x.id),
    )
  ) {
    return true;
  }
  return sharesAffectedScopeByLabel(a, b);
}

function collectScopeLabels(risk: ActiveRisk): string[] {
  return [
    ...risk.affectedActivities,
    ...risk.affectedRouteSegments,
    ...risk.affectedLocations,
  ]
    .map((x) => x.label.trim())
    .filter(Boolean);
}

function labelMatchesScopeToken(token: string, label: string): boolean {
  const t = token.trim();
  const l = label.trim();
  if (!t || !l) return false;
  return l === t || l.includes(t) || t.includes(l);
}

function sharesAffectedScopeByLabel(a: ActiveRisk, b: ActiveRisk): boolean {
  const labelsA = collectScopeLabels(a);
  const labelsB = collectScopeLabels(b);
  if (labelsA.length === 0 || labelsB.length === 0) return false;

  for (const routeLabel of labelsA) {
    const endpoints = routeLabel.split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
    if (endpoints.length >= 2) {
      const matched = endpoints.filter((ep) =>
        labelsB.some((lb) => labelMatchesScopeToken(ep, lb)),
      );
      if (matched.length >= 2) return true;
    }
  }

  for (const routeLabel of labelsB) {
    const endpoints = routeLabel.split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
    if (endpoints.length >= 2) {
      const matched = endpoints.filter((ep) =>
        labelsA.some((la) => labelMatchesScopeToken(ep, la)),
      );
      if (matched.length >= 2) return true;
    }
  }

  return false;
}

function buildImpactProjections(
  primary: ActiveRisk | null,
  impactSources: ActiveRisk[],
  allRisks: ActiveRisk[],
): ExecutionAlertImpactProjection[] {
  const impacts: ExecutionAlertImpactProjection[] = [];
  const seen = new Set<string>();

  const add = (impact: ExecutionAlertImpactProjection) => {
    const key = `${impact.type}:${impact.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    impacts.push(impact);
  };

  if (primary) {
    if (primary.executionGate === 'STOP' || primary.executionGate === 'REPLAN_REQUIRED') {
      add({
        id: `imp_safety_${primary.id}`,
        type: 'SAFETY',
        label: '当前路段不建议按原计划行驶',
        sourceRiskId: primary.id,
      });
    }

    for (const segment of primary.affectedRouteSegments) {
      add({
        id: `imp_route_${segment.id}`,
        type: 'ROUTE',
        label: `影响路段：${segment.label}`,
        sourceRiskId: primary.id,
      });
    }

    for (const activity of primary.affectedActivities) {
      add({
        id: `imp_activity_${activity.id}`,
        type: 'ACTIVITY',
        label: `${activity.label}到达时间可能需要调整`,
        sourceRiskId: primary.id,
      });
    }
  }

  for (const risk of impactSources) {
    if (
      shouldSuppressScheduleImpactsForPrimary(primary) &&
      (isScheduleTightnessRisk(risk) || risk.type === 'SCHEDULE')
    ) {
      continue;
    }
    if (isScheduleTightnessRisk(risk) || risk.type === 'SCHEDULE') {
      const delayLabel = extractScheduleDelayImpactLabel(risk) ?? risk.title;
      add({
        id: `imp_delay_${risk.id}`,
        type: 'DELAY',
        label: delayLabel,
        sourceRiskId: risk.id,
      });
      add({
        id: `imp_itinerary_${risk.id}`,
        type: 'ITINERARY',
        label: buildScheduleItineraryImpactLabel(risk),
        sourceRiskId: risk.id,
      });
    } else if (risk.type === 'ROAD_TRANSPORT') {
      add({
        id: `imp_route_${risk.id}`,
        type: 'ROUTE',
        label: resolveImpactDisplayLabel(risk.summary || risk.title),
        sourceRiskId: risk.id,
      });
    } else if (risk.type === 'ENVIRONMENT') {
      add({
        id: `imp_safety_${risk.id}`,
        type: 'SAFETY',
        label: resolveImpactDisplayLabel(risk.summary || risk.title),
        sourceRiskId: risk.id,
      });
    }
  }

  if (impacts.length === 0 && allRisks.length > 0 && primary) {
    add({
      id: `imp_itinerary_${primary.id}`,
      type: 'ITINERARY',
      label: '部分行程安排需要调整',
      sourceRiskId: primary.id,
    });
  }

  return impacts;
}

function extractScheduleDelayImpactLabel(risk: ActiveRisk): string | undefined {
  const routeLabel = risk.affectedActivities[0]?.label;
  const minuteMatch = risk.summary.match(/(\d+)\s*分钟/);
  if (minuteMatch && routeLabel) {
    return `${routeLabel}：预计延误约 ${minuteMatch[1]} 分钟`;
  }
  if (minuteMatch) {
    return `预计延误约 ${minuteMatch[1]} 分钟`;
  }
  const localized = localizeImpactLabel(risk.summary || risk.title);
  if (localized) return localized;
  if (/偏紧|延误|delay/i.test(risk.summary)) {
    return extractFirstClause(risk.summary);
  }
  return undefined;
}

function resolveImpactDisplayLabel(text: string): string {
  return localizeImpactLabel(text) ?? extractFirstClause(text);
}

function localizeImpactLabel(text: string): string | undefined {
  const raw = text.trim();
  if (!raw) return undefined;
  if (/driving hours exceeding safe daily limits/i.test(raw)) {
    return '驾驶时长超出单日安全上限';
  }
  if (/no backup driver available/i.test(raw)) {
    return '无可用替补司机接管';
  }
  if (/airspace closure/i.test(raw)) {
    return '空域关闭';
  }
  if (/roads near volcano closed/i.test(raw)) {
    return '火山周边道路封闭';
  }
  if (/exposed road segments become dangerous for vehicles/i.test(raw)) {
    return '暴露路段横风较强，车辆通行风险升高';
  }
  if (/driving speed reduced.*exposed segments/i.test(raw)) {
    return '暴露路段需降速行驶';
  }
  if (/dangerous for vehicles/i.test(raw)) {
    return '路段对车辆通行构成危险';
  }
  return undefined;
}

function buildScheduleItineraryImpactLabel(risk: ActiveRisk): string {
  const days = extractRiskDayNumbers(risk);
  if (days.length === 1) {
    return `第 ${days[0]} 天后续活动时间需要顺延`;
  }
  return '当天后续活动时间需要顺延';
}

function extractFirstClause(text: string): string {
  return text.split(/[；;。]/)[0]?.trim() || text;
}

function compareAlertRiskPriority(a: ActiveRisk, b: ActiveRisk): number {
  const gateA = GATE_PRIORITY[a.executionGate ?? 'ALLOW'] ?? 9;
  const gateB = GATE_PRIORITY[b.executionGate ?? 'ALLOW'] ?? 9;
  if (gateA !== gateB) return gateA - gateB;

  const levelA = alertLevelSortWeight(executionGateToAlertLevel(a.executionGate, a.level));
  const levelB = alertLevelSortWeight(executionGateToAlertLevel(b.executionGate, b.level));
  if (levelA !== levelB) return levelA - levelB;

  const typeA = TYPE_PRIORITY[a.type] ?? 9;
  const typeB = TYPE_PRIORITY[b.type] ?? 9;
  if (typeA !== typeB) return typeA - typeB;

  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function textOverlaps(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

function shouldSuppressScheduleImpactsForPrimary(primary: ActiveRisk | null | undefined): boolean {
  return (
    primary != null &&
    (primary.executionGate === 'STOP' || primary.executionGate === 'REPLAN_REQUIRED')
  );
}

function shouldSkipImpactSourceRisk(risk: ActiveRisk, primary: ActiveRisk): boolean {
  if (shouldExcludeRiskFromPrimaryImpacts(risk, primary)) return true;
  return (
    shouldSuppressScheduleImpactsForPrimary(primary) &&
    (isScheduleTightnessRisk(risk) || risk.type === 'SCHEDULE')
  );
}
