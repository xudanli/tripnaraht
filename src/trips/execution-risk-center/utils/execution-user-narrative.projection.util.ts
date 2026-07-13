/**
 * User-facing narrative — 事实 → 影响 → 建议 → 操作
 * @see internal-docs/frontend/EXECUTION-USER-NARRATIVE-CONTRACT.md
 */

import type {
  ExecutionAlertDto,
  ExecutionAlertRequiredAction,
  ExecutionInterventionActionButtonDto,
  ExecutionInterventionDto,
  ExecutionUserActionDto,
  ExecutionUserNarrativeDto,
} from '../../../mobile/dto/mobile-execution.types';
import { mergeRecoveryIntoUserActions } from './execution-recovery-user-actions.util';
import { buildRouteLabelFromRisk, buildWeatherHazardPhrase } from './execution-alert-copy.util';
import type { ActiveRisk } from '../types/execution-risk.types';

const INTERNAL_TITLE_PATTERNS = [
  /^道路\s*\/\s*可行性/i,
  /^执行偏差：\d+\s*个行程项受影响/,
  /^当前行程无法按原计划执行$/,
  /RFC-001/i,
  /FEASIBILITY_FAILURE/i,
  /EXECUTION_SCHEDULE/,
  /urgency\s*HIGH/i,
  /urgency\s*MEDIUM/i,
  /·\s*urgency/i,
];

export function enrichAlertWithUserNarrative(
  alert: ExecutionAlertDto,
  opts?: { requiredAction?: ExecutionAlertRequiredAction; sourceRisk?: ActiveRisk },
): ExecutionAlertDto {
  const narrative = projectUserNarrativeFromAlert(alert, opts);
  const userActions = projectUserActionsFromAlert(alert, opts?.requiredAction, narrative);
  return { ...alert, userNarrative: narrative, userActions };
}

export function enrichInterventionWithUserNarrative(
  item: ExecutionInterventionDto,
): ExecutionInterventionDto {
  const userNarrative = projectUserNarrativeFromIntervention(item);
  const userActions = projectUserActionsFromIntervention(item, userNarrative);
  return { ...item, userNarrative, userActions };
}

export function projectUserNarrativeFromAlert(
  alert: ExecutionAlertDto,
  opts?: { requiredAction?: ExecutionAlertRequiredAction; sourceRisk?: ActiveRisk },
): ExecutionUserNarrativeDto {
  const risk = opts?.sourceRisk;
  const route =
    alert.affectedRoute ??
    (risk ? buildRouteLabelFromRisk(risk) : undefined) ??
    firstActivityLabel(alert.affectedActivities);
  const activities = buildAffectedActivities(alert.affectedActivities, alert.observedAt);

  if (risk && isWeatherRisk(risk)) {
    return projectWeatherNarrative({ route, risk, alert, activities });
  }
  if (risk?.code === 'ROAD_CLOSED' || alert.riskType === 'ROAD_CLOSURE') {
    return projectRoadClosedNarrative({ route, alert, activities });
  }
  if (isTimeConflictAlert(alert)) {
    return projectTimeConflictNarrative({ route, alert, activities });
  }
  if (alert.level === 'STOP' || alert.executionGate === 'STOP') {
    return projectStopNarrative({ route, alert, activities });
  }
  if (alert.level === 'REPLAN_REQUIRED') {
    return projectReplanNarrative({ route, alert, activities });
  }

  return projectGenericNarrative({ route, alert, activities });
}

export function projectUserNarrativeFromIntervention(
  item: ExecutionInterventionDto,
): ExecutionUserNarrativeDto {
  const route = inferRouteFromActivities(item.affectedActivities);
  const activities = buildAffectedActivities(item.affectedActivities, item.actionDeadline);
  const recommendation = reconcileRecommendationText(
    item.recommendation?.title ?? item.recommendedAction,
    item.priority === 'CRITICAL',
  );

  const specialized = projectInterventionByType(item, route, activities, recommendation);
  if (specialized) return specialized;

  const whatHappened = sanitizeUserSentence(
    item.causalChain?.headline && !isInternalCopy(item.causalChain.headline)
      ? item.causalChain.headline
      : humanizeTitle(item.title, route),
  );
  const impactOnTrip = buildImpactSentence({
    reason: item.reason,
    activities,
    deadline: item.actionDeadline,
    consequenceLabels: item.consequenceImpacts?.map((c) => c.label),
  });

  return {
    whatHappened,
    impactOnTrip,
    recommendation: recommendation ?? '查看替代方案后再决定下一步',
    affected: activities.length > 0 ? { activities } : route ? { route } : undefined,
  };
}

function projectInterventionByType(
  item: ExecutionInterventionDto,
  route: string | undefined,
  activities: ExecutionUserNarrativeDto['affected'] extends infer A
    ? A extends { activities?: infer B }
      ? B
      : never
    : never,
  recommendation: string | undefined,
): ExecutionUserNarrativeDto | null {
  const text = `${item.title} ${item.reason}`.toLowerCase();
  if (item.type === 'DYNAMIC_REPLAN' && /强风|wind|weather/.test(text)) {
    const place = route ?? firstActivityLabel(item.affectedActivities) ?? '当前路段';
    return {
      whatHappened: `${place}预计受强风影响，部分活动可能无法按原计划进行`,
      impactOnTrip: buildImpactSentence({
        reason: item.reason,
        activities,
        deadline: item.actionDeadline,
      }),
      recommendation: recommendation ?? '查看替代方案或调整活动顺序',
      affected: { route: place, activities },
    };
  }
  if (/封路|closed|road/.test(text) && item.type === 'SAFETY_INTERVENTION') {
    const place = route ?? '原规划路线';
    return {
      whatHappened: `前往${place}的道路临时封闭，原路线无法通行`,
      impactOnTrip: buildImpactSentence({
        reason: item.reason,
        activities,
        deadline: item.actionDeadline,
      }),
      recommendation: recommendation ?? '采用绕行方案',
      affected: { route: place, activities },
    };
  }
  return null;
}

function projectWeatherNarrative(input: {
  route?: string;
  risk: ActiveRisk;
  alert: ExecutionAlertDto;
  activities: NonNullable<ExecutionUserNarrativeDto['affected']>['activities'];
}): ExecutionUserNarrativeDto {
  const place = input.route ?? '当前路段';
  const hazard = buildWeatherHazardPhrase(input.risk);
  const whatHappened =
    input.alert.level === 'STOP'
      ? `${place}：${hazard}，当前路线不建议继续行驶`
      : `${place}：${hazard}，请结合路况评估是否继续出发`;

  return {
    whatHappened,
    impactOnTrip: buildImpactSentence({
      reason: input.alert.reason,
      activities: input.activities,
      consequenceLabels: [input.alert.impact].filter(Boolean),
    }),
    recommendation:
      reconcileRecommendationText(input.alert.recommendedAction, input.alert.level === 'STOP') ??
      '查看影响详情并确认替代方案',
    affected: { route: place, activities: input.activities },
  };
}

function projectRoadClosedNarrative(input: {
  route?: string;
  alert: ExecutionAlertDto;
  activities: NonNullable<ExecutionUserNarrativeDto['affected']>['activities'];
}): ExecutionUserNarrativeDto {
  const place = input.route ?? firstActivityLabel(input.alert.affectedActivities) ?? '原规划路线';
  return {
    whatHappened: `前往${place}的道路临时封闭，原路线无法通行`,
    impactOnTrip: buildImpactSentence({
      reason: input.alert.reason,
      activities: input.activities,
    }),
    recommendation:
      reconcileRecommendationText(input.alert.recommendedAction, input.alert.level === 'STOP') ??
      '采用绕行方案',
    affected: { route: place, activities: input.activities },
  };
}

function projectTimeConflictNarrative(input: {
  route?: string;
  alert: ExecutionAlertDto;
  activities: NonNullable<ExecutionUserNarrativeDto['affected']>['activities'];
}): ExecutionUserNarrativeDto {
  const names = input.activities?.map((a) => a.label).filter(Boolean) ?? [];
  const pair =
    names.length >= 2
      ? `「${names[0]}」与「${names[1]}」`
      : names[0]
        ? `「${names[0]}」`
        : undefined;
  const whatHappened = pair
    ? `${pair}活动时间发生冲突，无法同时按原计划进行`
    : '部分活动时间发生冲突，无法同时按原计划进行';

  return {
    whatHappened,
    impactOnTrip: buildImpactSentence({
      reason: input.alert.reason,
      activities: input.activities,
      consequenceLabels: [input.alert.impact].filter(Boolean),
    }),
    recommendation:
      reconcileRecommendationText(input.alert.recommendedAction, input.alert.level === 'STOP') ??
      '查看替代方案并调整活动顺序',
    affected: input.activities.length > 0 ? { activities: input.activities } : undefined,
  };
}

function isTimeConflictAlert(alert: ExecutionAlertDto): boolean {
  return /时间冲突|time.?conflict/i.test(`${alert.title} ${alert.reason ?? ''}`);
}

function projectStopNarrative(input: {
  route?: string;
  alert: ExecutionAlertDto;
  activities: NonNullable<ExecutionUserNarrativeDto['affected']>['activities'];
}): ExecutionUserNarrativeDto {
  const place = input.route ?? firstActivityLabel(input.alert.affectedActivities);
  const fact = place
    ? `${place}在当前条件下无法按原计划继续`
    : '当前路线不建议继续按原计划行驶';

  return {
    whatHappened: fact,
    impactOnTrip: buildImpactSentence({
      reason: input.alert.reason,
      activities: input.activities,
      consequenceLabels: [input.alert.impact].filter(Boolean),
    }),
    recommendation:
      reconcileRecommendationText(input.alert.recommendedAction, true) ??
      '查看替代方案后再继续行程',
    affected: place ? { route: place, activities: input.activities } : { activities: input.activities },
  };
}

function projectReplanNarrative(input: {
  route?: string;
  alert: ExecutionAlertDto;
  activities: NonNullable<ExecutionUserNarrativeDto['affected']>['activities'];
}): ExecutionUserNarrativeDto {
  const place = input.route ?? firstActivityLabel(input.alert.affectedActivities) ?? '今日行程';
  return {
    whatHappened: humanizeTitle(input.alert.title, place) || `${place}需要调整安排`,
    impactOnTrip: buildImpactSentence({
      reason: input.alert.reason,
      activities: input.activities,
    }),
    recommendation:
      reconcileRecommendationText(input.alert.recommendedAction, false) ??
      '查看替代方案',
    affected: { route: place, activities: input.activities },
  };
}

function projectGenericNarrative(input: {
  route?: string;
  alert: ExecutionAlertDto;
  activities: NonNullable<ExecutionUserNarrativeDto['affected']>['activities'];
}): ExecutionUserNarrativeDto {
  const place = input.route ?? firstActivityLabel(input.alert.affectedActivities);
  return {
    whatHappened: humanizeTitle(input.alert.title, place),
    impactOnTrip: buildImpactSentence({
      reason: input.alert.reason,
      activities: input.activities,
      consequenceLabels: [input.alert.impact].filter(Boolean),
    }),
    recommendation: reconcileRecommendationText(input.alert.recommendedAction, false),
    affected: place ? { route: place, activities: input.activities } : { activities: input.activities },
  };
}

export function projectUserActionsFromAlert(
  alert: ExecutionAlertDto,
  requiredAction?: ExecutionAlertRequiredAction,
  narrative?: ExecutionUserNarrativeDto,
): ExecutionUserActionDto[] {
  const rec = narrative?.recommendation ?? alert.recommendedAction;
  const primaryLabel = pickPrimaryActionLabel(alert, requiredAction, rec);
  const actions: ExecutionUserActionDto[] = [];

  if (primaryLabel) {
    actions.push({
      label: primaryLabel,
      action: requiredAction === 'STOP' || requiredAction === 'REPLAN' ? 'view_alternatives' : 'confirm',
      enabled: true,
      role: 'primary',
    });
  }
  actions.push({
    label: '查看影响详情',
    action: 'view_impact',
    enabled: true,
    role: 'secondary',
  });
  return actions;
}

export function projectUserActionsFromIntervention(
  item: ExecutionInterventionDto,
  narrative?: ExecutionUserNarrativeDto,
): ExecutionUserActionDto[] {
  return mergeRecoveryIntoUserActions(item, narrative?.recommendation);
}

function pickPrimaryActionLabel(
  alert: ExecutionAlertDto,
  requiredAction: ExecutionAlertRequiredAction | undefined,
  recommendation: string | undefined,
): string | undefined {
  if (recommendation && !isKeepOriginalPhrase(recommendation)) {
    return recommendation;
  }
  if (requiredAction === 'STOP') return '查看替代方案';
  if (requiredAction === 'REPLAN') return '采用调整方案';
  if (alert.recommendationIds?.length) return '查看建议方案';
  return undefined;
}

function buildImpactSentence(input: {
  reason?: string;
  activities?: Array<{ label: string; time?: string }>;
  deadline?: string;
  consequenceLabels?: string[];
}): string {
  const parts: string[] = [];
  const cleanReason = input.reason && !isInternalCopy(input.reason) ? sanitizeUserSentence(input.reason) : '';
  const localizedReason = localizeImpactLabel(cleanReason) || (isMostlyEnglish(cleanReason) ? '' : cleanReason);
  if (localizedReason) parts.push(localizedReason);

  const activityPart = formatAffectedActivities(input.activities);
  if (activityPart) parts.push(activityPart);

  const deadline = formatDeadlineLabel(input.deadline);
  if (deadline && !parts.some((p) => p.includes(deadline))) {
    parts.push(`需在 ${deadline} 前处理`);
  }

  const consequences = (input.consequenceLabels ?? [])
    .map((l) => localizeImpactLabel(l))
    .filter((l) => l && !isInternalCopy(l));
  if (consequences.length > 0 && parts.length === 0) {
    parts.push(consequences.join('；'));
  }

  return parts.join('。').replace(/。+/g, '。') || '今日部分安排可能受到影响';
}

function buildAffectedActivities(
  labels: string[],
  timeIso?: string,
): Array<{ label: string; time?: string }> {
  const time = formatDeadlineLabel(timeIso);
  return labels.filter(Boolean).map((label) => ({ label, ...(time ? { time } : {}) }));
}

function formatAffectedActivities(
  activities?: Array<{ label: string; time?: string }>,
): string | undefined {
  if (!activities?.length) return undefined;
  const formatted = activities.map((a) =>
    a.time ? `${a.label} · ${a.time}` : a.label,
  );
  return `受影响：${formatted.join('、')}`;
}

function formatDeadlineLabel(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function humanizeTitle(title: string, route?: string): string {
  if (!isInternalCopy(title) && !isMostlyEnglish(title)) return sanitizeUserSentence(title);
  if (/时间冲突|time.?conflict/i.test(title)) {
    return route ? `${route}活动时间发生冲突` : '部分活动时间发生冲突';
  }
  if (/airspace closure/i.test(title)) return '空域关闭，航班可能受影响';
  if (/roads near volcano closed/i.test(title)) return '火山周边道路封闭，原路线无法通行';
  if (/volcanic ash/i.test(title)) return '火山灰预警，不建议进入受影响区域';
  if (route) return `${route}的安排需要调整`;
  return '今日部分行程需要调整';
}

function sanitizeUserSentence(text: string): string {
  return text
    .replace(/RFC-001\s*/gi, '')
    .replace(/FEASIBILITY_FAILURE\s*/gi, '')
    .replace(/·\s*urgency\s*(HIGH|MEDIUM|LOW)\s*/gi, '')
    .replace(/urgency\s*(HIGH|MEDIUM|LOW)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/；+/g, '；')
    .trim();
}

function isInternalCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return INTERNAL_TITLE_PATTERNS.some((p) => p.test(t));
}

function isWeatherRisk(risk: ActiveRisk): boolean {
  return (
    risk.type === 'ENVIRONMENT' ||
    risk.code.startsWith('WEATHER_') ||
    /强风|暴雨|weather|wind/i.test(`${risk.title} ${risk.summary}`)
  );
}

function firstActivityLabel(activities: string[]): string | undefined {
  return activities.find(Boolean);
}

function inferRouteFromActivities(activities: string[]): string | undefined {
  if (activities.length >= 2) {
    return `${activities[0]} → ${activities[activities.length - 1]}`;
  }
  return activities[0];
}

function reconcileRecommendationText(
  text: string | undefined,
  isStop: boolean,
): string | undefined {
  const t = text?.trim();
  if (!t) return undefined;
  if (isStop && isKeepOriginalPhrase(t)) return undefined;
  if (isInternalCopy(t)) return undefined;
  return t;
}

function isKeepOriginalPhrase(text: string): boolean {
  return /保持原计划|keep\s*original/i.test(text);
}

function localizeImpactLabel(label: string): string {
  if (/driving hours exceeding safe daily limits/i.test(label)) {
    return '驾驶时长超出单日安全上限';
  }
  if (/no backup driver available/i.test(label)) {
    return '无可用替补司机接管';
  }
  if (/airspace closure/i.test(label)) {
    return '空域关闭，航班可能受影响';
  }
  if (/roads near volcano closed/i.test(label)) {
    return '火山周边道路封闭，原路线无法通行';
  }
  if (/volcanic ash/i.test(label)) {
    return '火山灰沉降可能导致空气质量下降，不建议进入受影响区域';
  }
  if (/当前路段不建议按原计划行驶/.test(label)) {
    return '当前路段不建议按原计划行驶';
  }
  if (isMostlyEnglish(label)) {
    return '';
  }
  return label.trim();
}

function isMostlyEnglish(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const latin = (t.match(/[a-zA-Z]/g) ?? []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latin > 12 && latin > cjk * 2;
}
