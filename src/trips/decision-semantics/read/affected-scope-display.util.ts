import type { FeasibilityIssueDto, FeasibilityProofDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { AffectedScope, AffectedScopeDisplay, AffectedScopeType } from '../types/decision-semantics.types';

export interface AffectedScopeDisplayContext {
  issue?: FeasibilityIssueDto;
  proofs?: FeasibilityProofDto[];
  problemTitle?: string;
  problemDescription?: string;
}

interface ParsedScopeNarrative {
  dayIndex?: number;
  fromPlace?: string;
  toPlace?: string;
  distanceKm?: number;
  hint?: string;
}

/** Parse common feasibility / conflict copy: 第N天 · A → B（约 462 km）· … */
export function parseScopeNarrative(text: string | undefined): ParsedScopeNarrative | undefined {
  if (!text?.trim()) return undefined;
  const raw = text.trim();
  const dayMatch = raw.match(/第\s*(\d+)\s*天/);
  const dayIndex = dayMatch && Number.isFinite(Number(dayMatch[1])) ? Number(dayMatch[1]) : undefined;

  const arrowIdx = raw.indexOf('→');
  let fromPlace: string | undefined;
  let toPlace: string | undefined;
  if (arrowIdx > 0) {
    fromPlace =
      raw
        .slice(0, arrowIdx)
        .replace(/^第\s*\d+\s*天\s*·?\s*/u, '')
        .trim() || undefined;
    toPlace =
      raw
        .slice(arrowIdx + 1)
        .split(/[·（(]/u)[0]
        ?.replace(/\s*驾车.*/u, '')
        .trim() || undefined;
  }

  const distMatch =
    raw.match(/[（(]\s*约\s*(\d+(?:\.\d+)?)\s*km\s*[）)]/iu) ??
    raw.match(/约\s*(\d+(?:\.\d+)?)\s*km/iu);
  const distanceKm = distMatch ? Math.round(Number(distMatch[1])) : undefined;

  const driveMinutesMatch = raw.match(/驾车约\s*(\d+)\s*分钟/u);
  let hint: string | undefined;
  if (driveMinutesMatch) {
    hint = `驾车约 ${driveMinutesMatch[1]} 分钟`;
  } else if (raw.includes('·')) {
    const segments = raw
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean);
    const tail = segments.length >= 3 ? segments.slice(2).join(' · ') : segments[segments.length - 1];
    hint = tail?.includes('→') ? undefined : tail?.replace(/[（(]约\s*\d+(?:\.\d+)?\s*km\s*[）)]/iu, '').trim();
  }

  if (!dayIndex && !fromPlace && !toPlace && distanceKm == null) return undefined;
  return { dayIndex, fromPlace, toPlace, distanceKm, hint };
}

function narrativeTextForScope(scope: AffectedScope, ctx: AffectedScopeDisplayContext): string | undefined {
  return (
    scope.explanation?.trim() ||
    ctx.issue?.message?.trim() ||
    ctx.issue?.title?.trim() ||
    ctx.problemDescription?.trim() ||
    ctx.problemTitle?.trim()
  );
}

function buildRouteLabel(
  dayIndex: number | undefined,
  fromPlace: string | undefined,
  toPlace: string | undefined,
): string | undefined {
  if (!fromPlace || !toPlace) return undefined;
  return dayIndex ? `${formatDayLabel(dayIndex)} · ${fromPlace} → ${toPlace}` : `${fromPlace} → ${toPlace}`;
}

function distanceSecondaryLabel(distanceKm: number | undefined, hint?: string): string | undefined {
  if (distanceKm != null) return `${distanceKm}km 自驾路段`;
  if (hint && hint.length <= 80) return hint;
  return hint?.slice(0, 80);
}

function resolveNarrative(
  scope: AffectedScope,
  ctx: AffectedScopeDisplayContext,
): ParsedScopeNarrative | undefined {
  const parsed = parseScopeNarrative(narrativeTextForScope(scope, ctx));
  const dayIndex = parsed?.dayIndex ?? parseDayIndex(scope.scopeId);
  return parsed ? { ...parsed, dayIndex: parsed.dayIndex ?? dayIndex } : dayIndex ? { dayIndex } : undefined;
}

function formatDayLabel(day: number): string {
  return `第 ${day} 天`;
}

function parseDayIndex(scopeId: string): number | undefined {
  const n = Number(scopeId);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function proofLabelForItem(proofs: FeasibilityProofDto[] | undefined, itemId: string): string | undefined {
  if (!proofs?.length) return undefined;
  const hit = proofs.find((p) => p.itemId === itemId || p.fromItemId === itemId || p.toItemId === itemId);
  if (hit?.placeLabel) return hit.placeLabel;
  if (hit?.entity && !hit.entity.includes('→')) return hit.entity;
  const placeProof = proofs.find((p) => p.placeLabel);
  return placeProof?.placeLabel;
}

/** 「第1天 · 蓝湖温泉：需要预约」→ 蓝湖温泉 */
function extractPoiNameFromTitle(title: string | undefined): string | undefined {
  if (!title?.trim()) return undefined;
  const match = title.match(/^第\s*\d+\s*天\s*·\s*(.+)$/u);
  if (!match) return undefined;
  const afterDay = match[1].trim();
  if (!afterDay || afterDay.includes('→')) return undefined;
  return afterDay.split(/[：:]/u)[0]?.trim() || undefined;
}

function extractConstraintHint(ctx: AffectedScopeDisplayContext): string | undefined {
  const fromTitle = ctx.problemTitle?.split(/[：:]/u).slice(1).join('：').trim();
  const fromDescription = ctx.problemDescription?.split(/[：:]/u).slice(1).join('：').trim();
  const candidates = [
    fromTitle,
    fromDescription,
    ctx.issue?.actionRequired,
    ctx.issue?.proofs?.[0]?.conclusion,
    parseScopeNarrative(ctx.issue?.message)?.hint,
  ];
  for (const text of candidates) {
    if (!text?.trim()) continue;
    const trimmed = text.trim();
    if (trimmed.length <= 48 && !trimmed.includes('→')) return trimmed;
  }
  return undefined;
}

function isDayOnlyDisplay(display: AffectedScopeDisplay): boolean {
  if (display.scopeType !== 'DAY' || display.dayIndex == null) return false;
  const dayLabel = formatDayLabel(display.dayIndex);
  return display.label === dayLabel || display.label === `Day ${display.scopeId}`;
}

function resolvePoiLabel(scope: AffectedScope, ctx: AffectedScopeDisplayContext): string | undefined {
  const proofLabel = proofLabelForItem(ctx.proofs, scope.scopeId);
  const anchorLabel =
    ctx.issue?.anchors?.toPlaceLabel && ctx.issue?.toItemId === scope.scopeId
      ? ctx.issue.anchors.toPlaceLabel
      : ctx.issue?.anchors?.fromPlaceLabel && ctx.issue?.fromItemId === scope.scopeId
        ? ctx.issue.anchors.fromPlaceLabel
        : undefined;
  const narrative = resolveNarrative(scope, ctx);
  return (
    proofLabel ??
    anchorLabel ??
    extractPoiNameFromTitle(ctx.problemTitle) ??
    extractPoiNameFromTitle(ctx.issue?.title) ??
    narrative?.fromPlace ??
    narrative?.toPlace
  );
}

function consolidateScopeDisplays(
  displays: AffectedScopeDisplay[],
  ctx: AffectedScopeDisplayContext,
): AffectedScopeDisplay[] {
  const dropIndices = new Set<number>();

  for (let i = 0; i < displays.length; i++) {
    const row = displays[i];
    if (row.scopeType !== 'ITINERARY_ITEM' && row.scopeType !== 'POI') continue;
    if (row.dayIndex == null) continue;

    const dayIdx = displays.findIndex(
      (d, j) =>
        j !== i &&
        !dropIndices.has(j) &&
        d.scopeType === 'DAY' &&
        d.dayIndex === row.dayIndex &&
        isDayOnlyDisplay(d),
    );
    if (dayIdx < 0) continue;

    const hint = extractConstraintHint(ctx);
    displays[i] = {
      ...row,
      secondaryLabel: hint ?? row.secondaryLabel,
      placeNames: row.placeNames?.length ? row.placeNames : row.label ? [row.label] : undefined,
    };
    dropIndices.add(dayIdx);
  }

  const kept = displays.filter((_, i) => !dropIndices.has(i));

  return kept.map((row) => {
    if (!isDayOnlyDisplay(row)) return row;
    const poiName =
      extractPoiNameFromTitle(ctx.problemTitle) ?? extractPoiNameFromTitle(ctx.issue?.title);
    if (!poiName || row.dayIndex == null) return row;
    const hint = extractConstraintHint(ctx);
    return {
      ...row,
      label: poiName,
      secondaryLabel: hint,
      placeNames: [poiName],
    };
  });
}

function projectLegScope(
  scope: AffectedScope,
  issue?: FeasibilityIssueDto,
): AffectedScopeDisplay {
  const day =
    issue?.anchors?.toDayNumber ??
    issue?.anchors?.fromDayNumber ??
    issue?.affectedDays?.[0];
  const from = issue?.anchors?.fromPlaceLabel;
  const to = issue?.anchors?.toPlaceLabel;
  const label =
    from && to && day
      ? `${formatDayLabel(day)} · ${from} → ${to}`
      : from && to
        ? `${from} → ${to}`
        : scope.scopeId;

  const distanceKm = issue?.anchors?.travelDistanceMeters
    ? Math.round(issue.anchors.travelDistanceMeters / 1000)
    : undefined;
  const secondaryLabel =
    distanceKm != null
      ? `${distanceKm}km 自驾路段`
      : typeof issue?.anchors?.travelMinutes === 'number'
        ? `约 ${issue.anchors.travelMinutes} 分钟车程`
        : undefined;

  return {
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    label,
    secondaryLabel,
    dayIndex: day,
    placeNames: [from, to].filter((v): v is string => Boolean(v)),
  };
}

function projectItemScope(
  scope: AffectedScope,
  ctx: AffectedScopeDisplayContext,
): AffectedScopeDisplay {
  const narrative = resolveNarrative(scope, ctx);
  const day =
    ctx.issue?.anchors?.toDayNumber ??
    ctx.issue?.anchors?.fromDayNumber ??
    narrative?.dayIndex ??
    ctx.issue?.affectedDays?.[0];
  const label = resolvePoiLabel(scope, ctx);
  const constraintHint = extractConstraintHint(ctx);

  return {
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    label: label ?? `行程项 ${scope.scopeId.slice(0, 8)}`,
    secondaryLabel:
      constraintHint ??
      distanceSecondaryLabel(narrative?.distanceKm, narrative?.hint) ??
      (day && !label ? formatDayLabel(day) : undefined),
    dayIndex: day,
    placeNames: [label].filter((v): v is string => Boolean(v)),
  };
}

function projectDayScope(scope: AffectedScope, ctx: AffectedScopeDisplayContext): AffectedScopeDisplay {
  const narrative = resolveNarrative(scope, ctx);
  const dayIndex = narrative?.dayIndex ?? parseDayIndex(scope.scopeId);
  const routeLabel = buildRouteLabel(dayIndex, narrative?.fromPlace, narrative?.toPlace);

  return {
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    label: routeLabel ?? (dayIndex ? formatDayLabel(dayIndex) : `Day ${scope.scopeId}`),
    secondaryLabel: distanceSecondaryLabel(narrative?.distanceKm, narrative?.hint),
    dayIndex,
    placeNames: [narrative?.fromPlace, narrative?.toPlace].filter((v): v is string => Boolean(v)),
  };
}

function projectMemberScope(scope: AffectedScope): AffectedScopeDisplay {
  const memberId = scope.scopeId;
  const displayName = memberId.startsWith('__derived:') ? undefined : memberId;
  return {
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    label: displayName ? `成员 ${displayName}` : '受影响成员',
    secondaryLabel: scope.memberImpacts?.[0]?.explanation?.slice(0, 80),
    memberNames: displayName ? [displayName] : undefined,
  };
}

function projectTripScope(scope: AffectedScope, ctx: AffectedScopeDisplayContext): AffectedScopeDisplay {
  const issue = ctx.issue;
  const narrative = resolveNarrative(scope, ctx);
  const routeLabel = buildRouteLabel(narrative?.dayIndex, narrative?.fromPlace, narrative?.toPlace);

  return {
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    label: routeLabel ?? '整段行程',
    secondaryLabel:
      distanceSecondaryLabel(narrative?.distanceKm, narrative?.hint) ??
      (issue?.affectedDays?.length
        ? `涉及 ${issue.affectedDays.map((d) => formatDayLabel(d)).join('、')}`
        : scope.explanation?.slice(0, 80)),
    dayIndex: narrative?.dayIndex ?? issue?.affectedDays?.[0],
    placeNames: [narrative?.fromPlace, narrative?.toPlace].filter((v): v is string => Boolean(v)),
  };
}

function projectScope(scope: AffectedScope, ctx: AffectedScopeDisplayContext): AffectedScopeDisplay {
  switch (scope.scopeType as AffectedScopeType) {
    case 'DAY':
      return projectDayScope(scope, ctx);
    case 'ITINERARY_ITEM':
    case 'POI':
      return projectItemScope(scope, ctx);
    case 'JOURNEY_LEG':
    case 'ROUTE_SEGMENT':
      return projectLegScope(scope, ctx.issue);
    case 'MEMBER':
    case 'MEMBER_GROUP':
      return projectMemberScope(scope);
    case 'TRIP':
    default:
      return projectTripScope(scope, ctx);
  }
}

export function projectAffectedScopeDisplays(
  scopes: AffectedScope[],
  ctx: AffectedScopeDisplayContext = {},
): AffectedScopeDisplay[] {
  const seen = new Set<string>();
  const displays: AffectedScopeDisplay[] = [];

  for (const scope of scopes) {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    displays.push(projectScope(scope, ctx));
  }

  return consolidateScopeDisplays(displays, ctx);
}
