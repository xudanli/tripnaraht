/**
 * value.scopeBinding — 持久化 / BFF scopeLabel / check·solver 范围过滤
 */

import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type {
  ConstraintMemberScopeBinding,
  ConstraintScopeBinding,
  ConstraintTemporalScopeBinding,
  TripConstraint,
  TripConstraintScope,
} from '../types/trip-constraint.types';

export interface ConstraintEvaluationContext {
  phase?: 'planning' | 'execution';
  dayNumber?: number;
  dayNumbers?: number[];
  segmentId?: string;
  fromItemId?: string;
  toItemId?: string;
  destinationId?: string;
  memberIds?: string[];
  primaryDriverMemberId?: string;
}

export interface ScopeBindingValidationError {
  field: string;
  message: string;
}

const EXTENDED_VALUES_KEY = 'constraintExtendedValues';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function readScopeBindingFromValue(value: unknown): ConstraintScopeBinding | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value.scopeBinding;
  if (!isRecord(raw)) return undefined;
  const temporal = raw.temporal;
  const member = raw.member;
  const phase = raw.phase;
  const activity = raw.activity;
  if (!isRecord(temporal) || !isRecord(member) || !isRecord(phase) || !isRecord(activity)) {
    return undefined;
  }
  return raw as unknown as ConstraintScopeBinding;
}

export function readConstraintExtendedValue(
  metadata: unknown,
  constraintId: string,
): Record<string, unknown> | undefined {
  if (!isRecord(metadata)) return undefined;
  const bag = metadata[EXTENDED_VALUES_KEY];
  if (!isRecord(bag)) return undefined;
  const raw = bag[constraintId];
  return isRecord(raw) ? raw : undefined;
}

export function writeConstraintExtendedValue(
  metadata: Record<string, unknown>,
  constraintId: string,
  patch: unknown,
): Record<string, unknown> {
  const merged = mergeConstraintValueOnPatch(
    readConstraintExtendedValue(metadata, constraintId),
    patch,
  );
  const bag = isRecord(metadata[EXTENDED_VALUES_KEY])
    ? { ...(metadata[EXTENDED_VALUES_KEY] as Record<string, unknown>) }
    : {};
  bag[constraintId] = merged;
  return { ...metadata, [EXTENDED_VALUES_KEY]: bag };
}

export function mergeConstraintValueOnPatch(
  prev: unknown,
  patch: unknown,
): Record<string, unknown> {
  const base = isRecord(prev) ? { ...prev } : {};
  if (patch == null) return base;
  if (!isRecord(patch)) return { ...base, raw: patch };
  const next = { ...base, ...patch };
  if (isRecord(patch.scopeBinding)) {
    next.scopeBinding = patch.scopeBinding;
  }
  return next;
}

export function inferCoarseScopeFromBinding(
  binding: ConstraintScopeBinding | undefined,
): TripConstraintScope | undefined {
  if (!binding) return undefined;
  const { temporal } = binding;
  switch (temporal.kind) {
    case 'trip':
      return { type: 'TRIP' };
    case 'day': {
      const day = temporal.dayNumber;
      return day != null ? { type: 'DAY', ids: [String(day)], dayIndex: day } : { type: 'DAY' };
    }
    case 'day_range': {
      const from = temporal.dayFrom;
      const to = temporal.dayTo ?? temporal.dayFrom;
      if (from == null) return { type: 'DAY' };
      const ids =
        to != null && to !== from
          ? Array.from({ length: to - from + 1 }, (_, i) => String(from + i))
          : [String(from)];
      return { type: 'DAY', ids, dayIndex: from };
    }
    case 'route_segment':
      return {
        type: 'ROUTE_SEGMENT',
        ids: temporal.segmentId ? [temporal.segmentId] : undefined,
      };
    case 'destination':
      return {
        type: 'DOMAIN',
        ids: temporal.destinationId ? [temporal.destinationId] : undefined,
      };
    default:
      return { type: 'TRIP' };
  }
}

export function resolveScopeFromPatch(input: {
  scopeBinding?: ConstraintScopeBinding;
  scope?: TripConstraintScope;
}): TripConstraintScope | undefined {
  if (input.scopeBinding) return inferCoarseScopeFromBinding(input.scopeBinding);
  if (input.scope) return input.scope;
  return undefined;
}

const TEMPORAL_KIND_LABELS: Record<ConstraintTemporalScopeBinding['kind'], string> = {
  trip: '整趟行程',
  day: '指定天数',
  day_range: '天数区间',
  route_segment: '路线分段',
  destination: '目的地',
};

export function formatConstraintScopeSummary(binding: ConstraintScopeBinding): string {
  const parts: string[] = [];
  const { temporal, member, phase, activity } = binding;

  switch (temporal.kind) {
    case 'trip':
      parts.push('整趟行程');
      break;
    case 'day':
      parts.push(
        temporal.dayNumber != null ? `第 ${temporal.dayNumber} 天` : TEMPORAL_KIND_LABELS.day,
      );
      break;
    case 'day_range': {
      const from = temporal.dayFrom;
      const to = temporal.dayTo ?? temporal.dayFrom;
      if (from != null && to != null && to !== from) parts.push(`第 ${from}–${to} 天`);
      else if (from != null) parts.push(`第 ${from} 天`);
      else parts.push(TEMPORAL_KIND_LABELS.day_range);
      break;
    }
    case 'route_segment':
      parts.push(temporal.label ?? (temporal.segmentId ? `路段 ${temporal.segmentId}` : '路线分段'));
      break;
    case 'destination':
      parts.push(temporal.label ?? (temporal.destinationId ? '指定目的地' : '目的地'));
      break;
    default:
      parts.push(TEMPORAL_KIND_LABELS.trip);
  }

  switch (member.kind) {
    case 'all':
      break;
    case 'primary_driver':
      parts.push('主驾');
      break;
    case 'members': {
      const labels = member.labels?.filter(Boolean);
      if (labels?.length) parts.push(labels.join('、'));
      else if (member.memberIds?.length) parts.push(`${member.memberIds.length} 名成员`);
      else parts.push('指定成员');
      break;
    }
  }

  if (phase.planning && !phase.execution) parts.push('规划阶段');
  else if (!phase.planning && phase.execution) parts.push('执行阶段');

  if (activity.kind !== 'all' && activity.labels?.length) {
    parts.push(activity.labels.join('、'));
  }

  return parts.join(' · ') || '整趟行程';
}

export function validateScopeBinding(
  binding: ConstraintScopeBinding,
): ScopeBindingValidationError[] {
  const errors: ScopeBindingValidationError[] = [];
  const { temporal, member, phase } = binding;

  if (temporal.kind === 'day' && temporal.dayNumber == null) {
    errors.push({ field: 'temporal.dayNumber', message: 'day 范围需指定 dayNumber' });
  }
  if (temporal.kind === 'day_range') {
    if (temporal.dayFrom == null) {
      errors.push({ field: 'temporal.dayFrom', message: 'day_range 需指定 dayFrom' });
    } else if (temporal.dayTo != null && temporal.dayTo < temporal.dayFrom) {
      errors.push({ field: 'temporal.dayTo', message: 'dayTo 不能小于 dayFrom' });
    }
  }
  if (temporal.kind === 'route_segment') {
    if (!temporal.segmentId && !(temporal.fromItemId && temporal.toItemId)) {
      errors.push({
        field: 'temporal.route_segment',
        message: 'route_segment 需 segmentId 或 fromItemId/toItemId',
      });
    }
  }
  if (member.kind === 'members' && (!member.memberIds || member.memberIds.length === 0)) {
    errors.push({ field: 'member.memberIds', message: 'members 范围需非空 memberIds' });
  }
  if (!phase.planning && !phase.execution) {
    errors.push({ field: 'phase', message: 'planning 与 execution 至少一项为 true' });
  }
  return errors;
}

const DRIVER_ROLE_RE = /驾驶|主驾|driver/i;

export function resolvePrimaryDriverMemberId(input: {
  teamGovernance?: unknown;
  fallbackMemberIds?: string[];
}): string | undefined {
  const gov = input.teamGovernance;
  if (isRecord(gov)) {
    const roles = gov.memberRoles ?? gov.roles ?? gov.members;
    if (Array.isArray(roles)) {
      for (const entry of roles) {
        if (!isRecord(entry)) continue;
        const role = String(entry.role ?? entry.roles ?? '');
        if (DRIVER_ROLE_RE.test(role)) {
          const id = entry.memberId ?? entry.id ?? entry.userId;
          if (typeof id === 'string' && id) return id;
        }
      }
    }
    if (isRecord(roles)) {
      for (const [memberId, roleRaw] of Object.entries(roles)) {
        const role = Array.isArray(roleRaw) ? roleRaw.join(' ') : String(roleRaw);
        if (DRIVER_ROLE_RE.test(role)) return memberId;
      }
    }
  }
  return input.fallbackMemberIds?.[0];
}

export function enrichScopeBindingWithResolvedMember(
  binding: ConstraintScopeBinding,
  teamGovernance?: unknown,
): ConstraintScopeBinding {
  if (binding.member.kind !== 'primary_driver') return binding;
  if (binding.member.resolvedMemberId) return binding;
  const resolved = resolvePrimaryDriverMemberId({ teamGovernance });
  if (!resolved) return binding;
  return {
    ...binding,
    member: { ...binding.member, resolvedMemberId: resolved },
  };
}

function dayInTemporal(temporal: ConstraintTemporalScopeBinding, dayNumber: number): boolean {
  switch (temporal.kind) {
    case 'trip':
      return true;
    case 'day':
      return temporal.dayNumber == null || temporal.dayNumber === dayNumber;
    case 'day_range': {
      const from = temporal.dayFrom;
      const to = temporal.dayTo ?? temporal.dayFrom;
      if (from == null) return true;
      if (to == null) return dayNumber === from;
      return dayNumber >= from && dayNumber <= to;
    }
    case 'route_segment':
      return temporal.dayNumber == null || temporal.dayNumber === dayNumber;
    case 'destination':
      return true;
    default:
      return true;
  }
}

function temporalMatchesContext(
  temporal: ConstraintTemporalScopeBinding,
  ctx: ConstraintEvaluationContext,
): boolean {
  const days = ctx.dayNumbers?.length
    ? ctx.dayNumbers
    : ctx.dayNumber != null
      ? [ctx.dayNumber]
      : undefined;

  if (days?.length) {
    if (!days.some((d) => dayInTemporal(temporal, d))) return false;
  }

  if (temporal.kind === 'route_segment') {
    if (ctx.segmentId && temporal.segmentId && ctx.segmentId !== temporal.segmentId) {
      return false;
    }
    if (ctx.fromItemId && temporal.fromItemId && ctx.fromItemId !== temporal.fromItemId) {
      return false;
    }
    if (ctx.toItemId && temporal.toItemId && ctx.toItemId !== temporal.toItemId) {
      return false;
    }
  }

  if (temporal.kind === 'destination') {
    if (
      ctx.destinationId &&
      temporal.destinationId &&
      ctx.destinationId !== temporal.destinationId
    ) {
      return false;
    }
  }

  return true;
}

function memberMatchesContext(
  member: ConstraintMemberScopeBinding,
  ctx: ConstraintEvaluationContext,
): boolean {
  if (member.kind === 'all') return true;
  const targetIds = ctx.memberIds ?? [];
  if (member.kind === 'primary_driver') {
    const driverId = member.resolvedMemberId;
    if (!driverId) return true;
    if (!targetIds.length) return true;
    return targetIds.includes(driverId);
  }
  if (member.kind === 'members') {
    const ids = member.memberIds ?? [];
    if (!ids.length) return true;
    if (!targetIds.length) return true;
    return targetIds.some((id) => ids.includes(id));
  }
  return true;
}

function phaseMatchesContext(
  phase: ConstraintScopeBinding['phase'],
  ctx: ConstraintEvaluationContext,
): boolean {
  if (!ctx.phase) return true;
  if (ctx.phase === 'planning') return phase.planning !== false;
  return phase.execution !== false;
}

export function constraintAppliesInContext(
  binding: ConstraintScopeBinding | undefined,
  ctx: ConstraintEvaluationContext,
): boolean {
  if (!binding) return true;
  return (
    temporalMatchesContext(binding.temporal, ctx) &&
    memberMatchesContext(binding.member, ctx) &&
    phaseMatchesContext(binding.phase, ctx)
  );
}

export function constraintAppliesToConflict(
  constraint: Pick<TripConstraint, 'value' | 'status'>,
  conflict: PlanningConflictItem,
  ctx?: ConstraintEvaluationContext,
): boolean {
  if (constraint.status === 'DISABLED') return false;
  const binding = readScopeBindingFromValue(constraint.value);
  if (!binding) return true;
  const evalCtx: ConstraintEvaluationContext = {
    phase: 'planning',
    dayNumbers: conflict.affectedDays,
    dayNumber: conflict.affectedDays?.[0],
    segmentId: ctx?.segmentId,
    fromItemId: ctx?.fromItemId ?? conflict.studioConflict?.fromItemId,
    toItemId: ctx?.toItemId ?? conflict.studioConflict?.toItemId,
    ...ctx,
  };
  const studio = conflict.studioConflict;
  if (studio) {
    if (typeof studio.fromDayNumber === 'number' && !evalCtx.dayNumber) {
      evalCtx.dayNumber = studio.fromDayNumber;
    }
    if (Array.isArray(studio.affectedDays) && !evalCtx.dayNumbers?.length) {
      evalCtx.dayNumbers = studio.affectedDays
        .map((d) => Number(d))
        .filter((n) => Number.isFinite(n));
    }
    if (typeof studio.fromItemId === 'string') evalCtx.fromItemId = studio.fromItemId;
    if (typeof studio.toItemId === 'string') evalCtx.toItemId = studio.toItemId;
  }
  return constraintAppliesInContext(binding, evalCtx);
}

export function evaluationContextFromConflictDay(input: {
  dayNumber: number;
  fromItemId?: string;
  toItemId?: string;
  segmentId?: string;
  phase?: 'planning' | 'execution';
}): ConstraintEvaluationContext {
  return {
    phase: input.phase ?? 'planning',
    dayNumber: input.dayNumber,
    dayNumbers: [input.dayNumber],
    fromItemId: input.fromItemId,
    toItemId: input.toItemId,
    segmentId:
      input.segmentId ??
      (input.fromItemId && input.toItemId
        ? `${input.fromItemId}__${input.toItemId}`
        : undefined),
  };
}

export function readMaxDailyDriveScopeBinding(metadata: unknown): ConstraintScopeBinding | undefined {
  return readScopeBindingFromValue(readConstraintExtendedValue(metadata, 'c_max_daily_drive'));
}

export function readNoNightDriveScopeBinding(metadata: unknown): ConstraintScopeBinding | undefined {
  if (!isRecord(metadata)) return undefined;
  const constraints = metadata.constraints;
  if (!isRecord(constraints)) return undefined;
  return readScopeBindingFromValue(constraints.noNightDrive);
}
