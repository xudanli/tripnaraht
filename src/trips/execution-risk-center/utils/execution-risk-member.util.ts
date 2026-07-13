import type {
  ActiveRisk,
  ActiveRiskCode,
  AffectedRef,
  ExecutionRiskMemberImpactDto,
} from '../types/execution-risk.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import {
  AffectedMembersScope,
  MemberImpactDegree,
  MemberImpactDirection,
} from '../../../generated/execution-risk-contracts';
import type { PackageHarnessExpectedMemberImpact } from '../harness/package-harness.types';

export function memberNamesMapToAffectedRefs(
  memberNamesById: Map<string, string>,
): AffectedRef[] {
  return [...memberNamesById.entries()].map(([id, label]) => ({
    id,
    label,
    kind: 'member' as const,
  }));
}

export function shouldInheritTripMembers(risk: ActiveRisk): boolean {
  if (risk.type === 'ENVIRONMENT' || risk.type === 'TEAM_COORDINATION') return true;
  if (risk.type === 'MEMBER_STATE') return true;
  if (risk.executionGate === 'STOP' || risk.executionGate === 'REPLAN_REQUIRED') return true;
  return risk.affectedActivities.length > 0;
}

export function resolveAffectedMemberLabelsFromRisks(risks: ActiveRisk[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const risk of risks) {
    for (const member of risk.affectedMembers) {
      if (seen.has(member.id)) continue;
      seen.add(member.id);
      labels.push(member.label);
    }
  }
  return labels;
}

export function enrichRiskWithTripMembers(
  risk: ActiveRisk,
  tripMembers: AffectedRef[],
): ActiveRisk {
  if (risk.affectedMembers.length > 0 || tripMembers.length === 0) {
    return risk;
  }
  if (!shouldInheritTripMembers(risk)) {
    return risk;
  }
  return { ...risk, affectedMembers: tripMembers };
}

export function resolveAffectedMembersScope(input: {
  cluster?: ExecutionRiskCluster;
  risks: ActiveRisk[];
  explicitScope?: 'ALL_MEMBERS' | 'FOCUSED';
  explicitMemberIds?: string[];
}): AffectedMembersScope {
  if (input.explicitScope === 'ALL_MEMBERS') return AffectedMembersScope.ALL_MEMBERS;
  if (input.explicitScope === 'FOCUSED') return AffectedMembersScope.FOCUSED;

  const cluster = input.cluster;
  if (cluster) {
    if (cluster.adjustmentType === 'TEAM_COORDINATION') {
      return AffectedMembersScope.FOCUSED;
    }
    const related = input.risks.filter((r) => cluster.relatedRiskIds.includes(r.id));
    const hasMemberRoot = related.some(
      (r) => r.type === 'MEMBER_STATE' && r.isRootCause !== false,
    );
    if (hasMemberRoot) return AffectedMembersScope.FOCUSED;
    if (cluster.affectedMemberIds.length > 0 && !hasEnvironmentRoot(related)) {
      return AffectedMembersScope.FOCUSED;
    }
    return AffectedMembersScope.ALL_MEMBERS;
  }

  const primary = input.risks[0];
  if (primary?.type === 'MEMBER_STATE') return AffectedMembersScope.FOCUSED;
  return AffectedMembersScope.ALL_MEMBERS;
}

export function buildMemberImpactsForCluster(input: {
  cluster: ExecutionRiskCluster;
  risks: ActiveRisk[];
  tripMembers?: Array<{ id: string; label: string }>;
}): ExecutionRiskMemberImpactDto[] {
  const primary = input.risks.find((r) => r.id === input.cluster.primaryRiskId);
  if (!primary) return [];

  const memberIds =
    input.cluster.affectedMemberIds.length > 0
      ? input.cluster.affectedMemberIds
      : primary.affectedMembers.map((m) => m.id);

  if (memberIds.length === 0) return [];

  const labelById = new Map<string, string>();
  for (const risk of input.risks) {
    for (const member of risk.affectedMembers) {
      labelById.set(member.id, member.label);
    }
  }
  for (const member of input.tripMembers ?? []) {
    labelById.set(member.id, member.label);
  }

  return memberIds.map((memberId) => ({
    memberId,
    label: labelById.get(memberId) ?? memberId,
    impactType: resolveImpactType(primary.code),
    direction: MemberImpactDirection.NEGATIVE,
    degree: MemberImpactDegree.MEDIUM,
    explanation: primary.summary || primary.title,
  }));
}

export function buildMemberImpactsFromHarnessExpected(
  expected: PackageHarnessExpectedMemberImpact[],
): ExecutionRiskMemberImpactDto[] {
  return expected.map((impact) => ({
    memberId: impact.memberId,
    label: impact.memberId,
    impactType: impact.impactType,
    direction: impact.direction,
    degree: impact.degree,
    explanation: impact.explanation,
  }));
}

export function assertMemberImpactScopeExpectations(input: {
  scenarioId: string;
  affectedMembersScope?: 'ALL_MEMBERS' | 'FOCUSED';
  affectedMemberIds?: string[];
  memberImpacts?: PackageHarnessExpectedMemberImpact[];
  tripMemberIds: string[];
}): string[] {
  const failures: string[] = [];
  const scope = input.affectedMembersScope;
  if (!scope) return failures;

  if (scope === 'ALL_MEMBERS') {
    if ((input.memberImpacts ?? []).length > 0) {
      failures.push(`${input.scenarioId}: ALL_MEMBERS must not duplicate memberImpacts[]`);
    }
    return failures;
  }

  if (scope === 'FOCUSED') {
    const focusedIds = new Set(input.affectedMemberIds ?? []);
    for (const impact of input.memberImpacts ?? []) {
      if (!focusedIds.has(impact.memberId)) {
        failures.push(
          `${input.scenarioId}: FOCUSED memberImpacts includes non-focused member ${impact.memberId}`,
        );
      }
    }
  }

  return failures;
}

function hasEnvironmentRoot(risks: ActiveRisk[]): boolean {
  return risks.some((r) => r.type === 'ENVIRONMENT' && r.isRootCause !== false);
}

export function buildMemberImpactsForRecommendation(input: {
  risk: ActiveRisk;
  label: string;
  description?: string;
  impactSummary?: string;
  affectedMembersScope?: AffectedMembersScope;
}): ExecutionRiskMemberImpactDto[] {
  const { risk, label, description, impactSummary, affectedMembersScope } = input;
  if (affectedMembersScope === AffectedMembersScope.ALL_MEMBERS) return [];
  if (risk.affectedMembers.length === 0) return [];

  const activities = risk.affectedActivities.map((a) => a.label).join('、') || '相关活动';
  const impactType = resolveImpactType(risk.code, impactSummary);

  return risk.affectedMembers.map((member) => ({
    memberId: member.id,
    label: member.label,
    impactType,
    explanation: buildMemberImpactExplanation({
      risk,
      member,
      activities,
      label,
      description,
      impactSummary,
      impactType,
    }),
  }));
}

function resolveImpactType(code: ActiveRiskCode, impactSummary?: string): string {
  if (impactSummary && /^-?\d+min/i.test(impactSummary.trim())) {
    return 'DELAYED';
  }
  switch (code) {
    case 'WEATHER_STRONG_WIND':
    case 'WEATHER_SEVERE':
    case 'WEATHER_HEAVY_RAIN':
      return 'SAFETY_EXPOSURE';
    case 'ROAD_CLOSED':
    case 'ROAD_SLIPPERY':
      return 'BLOCKED';
    case 'MEMBER_DRIVER_FATIGUE':
    case 'MEMBER_PHYSICAL_FATIGUE':
      return 'FATIGUE_INCREASED';
    case 'SCHEDULE_DELAY':
      return 'DELAYED';
    default:
      return 'DELAYED';
  }
}

function buildMemberImpactExplanation(input: {
  risk: ActiveRisk;
  member: AffectedRef;
  activities: string;
  label: string;
  description?: string;
  impactSummary?: string;
  impactType: string;
}): string {
  const { risk, member, activities, label, description, impactSummary, impactType } = input;

  if (impactSummary && impactType === 'DELAYED') {
    return `${member.label}：采用「${label}」后，${activities} 预计${formatTimeAdjustment(impactSummary)}`;
  }

  if (risk.code === 'WEATHER_STRONG_WIND' || risk.code === 'WEATHER_SEVERE') {
    const planHint = description ? `，建议「${label}」` : '';
    return `${member.label}：强风影响下，${activities} 存在安全风险${planHint}`;
  }

  if (description) {
    return `${member.label}：${description}`;
  }

  return `${member.label}：${risk.summary || label}`;
}

function formatTimeAdjustment(impactSummary: string): string {
  const trimmed = impactSummary.trim();
  if (/^-\d+min$/i.test(trimmed)) {
    return `压缩约 ${trimmed.slice(1)}`;
  }
  if (/^\+\d+min$/i.test(trimmed)) {
    return `增加约 ${trimmed.slice(1)}`;
  }
  return `调整 ${trimmed}`;
}
