import {
  AdjustmentItemType,
  AffectedMembersScope,
  AutomationCapability,
  ExecutionMode,
  ExecutionRiskSeverity,
  MemberImpactDegree,
  MemberImpactDirection,
  MemberImpactType,
  type AdjustmentQueueItem,
  type MemberImpact,
  type RiskConsequenceImpact,
} from '../../../generated/execution-risk-contracts';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import type {
  ActiveRisk,
  ExecutionRiskMemberImpactDto,
} from '../types/execution-risk.types';
import type { ExecutionInterventionType } from '../../../mobile/dto/mobile-execution.types';
import { buildClusterHeadline, buildClusterTitle } from './execution-risk-cluster.util';
import {
  buildMemberImpactsForCluster,
  resolveAffectedMembersScope,
} from './execution-risk-member.util';
import type { ExecutionRiskThreePlan } from './execution-risk-three-plan-generator.util';

const ADJUSTMENT_TYPE_MAP: Record<ExecutionInterventionType, AdjustmentItemType> = {
  SAFETY_INTERVENTION: AdjustmentItemType.SAFETY_INTERVENTION,
  DYNAMIC_REPLAN: AdjustmentItemType.DYNAMIC_REPLAN,
  EXECUTION_PREPARATION: AdjustmentItemType.EXECUTION_PREPARATION,
  TEAM_COORDINATION: AdjustmentItemType.TEAM_COORDINATION,
};

export function projectClusterToAdjustmentQueueItem(input: {
  cluster: ExecutionRiskCluster;
  risks: ActiveRisk[];
  plans: ExecutionRiskThreePlan[];
  tripMembers?: Array<{ id: string; label: string }>;
}): AdjustmentQueueItem | null {
  const primary = input.risks.find((r) => r.id === input.cluster.primaryRiskId);
  if (!primary) return null;

  const scope = resolveAffectedMembersScope({
    cluster: input.cluster,
    risks: input.risks,
    explicitScope: undefined,
    explicitMemberIds: input.cluster.affectedMemberIds,
  });

  const memberImpacts =
    scope === AffectedMembersScope.FOCUSED
      ? buildMemberImpactsForCluster({
          cluster: input.cluster,
          risks: input.risks,
          tripMembers: input.tripMembers,
        })
      : undefined;

  return {
    itemId: `adj_${input.cluster.clusterId}`,
    clusterId: input.cluster.clusterId,
    type:
      ADJUSTMENT_TYPE_MAP[input.cluster.adjustmentType] ??
      AdjustmentItemType.DYNAMIC_REPLAN,
    title: buildClusterTitle(primary),
    description: buildClusterHeadline(primary),
    affectedMembersScope: scope,
    affectedMemberIds:
      scope === AffectedMembersScope.FOCUSED
        ? input.cluster.affectedMemberIds
        : (input.tripMembers ?? []).map((m) => m.id),
    recommendations: input.plans.map((plan) => ({
      recommendationId: `rec_${input.cluster.clusterId}_${plan.planType}`,
      clusterId: input.cluster.clusterId,
      tripId: input.cluster.tripId,
      planType: plan.planType,
      title: plan.title,
      actions: plan.actions.map((action) => ({
        category: action.category,
        actionCode: action.actionCode,
        label: action.label,
        executionMode: ExecutionMode.CONFIRM_BEFORE_WRITE,
        capabilities: [AutomationCapability.UPDATE_PLAN],
        reversibility: 'YES' as const,
      })),
      status: plan.status,
      impactSummary: {
        safetyDelta: midpoint(plan.safetyDelta) / 15,
        timeDeltaMinutes: midpoint(plan.timeDeltaMinutes),
        fatigueDelta: 0,
        experienceDelta: (midpoint(plan.experienceRetention) - 80) / 10,
        bookingImpact: 'NONE' as const,
      },
      memberImpacts: memberImpacts?.map(toContractMemberImpact),
      experienceRetention: midpoint(plan.experienceRetention),
      safetyScore: midpoint(plan.safetyDelta),
      reversibility: 'YES',
      executionMode: ExecutionMode.CONFIRM_BEFORE_WRITE,
      capabilities: [AutomationCapability.UPDATE_PLAN],
    })),
    consequenceImpacts: input.cluster.consequenceImpacts.map((impact) =>
      toContractConsequenceImpact(impact, input.cluster),
    ),
    status: 'PENDING',
  };
}

function midpoint(range: { min: number; max: number }): number {
  return (range.min + range.max) / 2;
}

function toContractMemberImpact(dto: ExecutionRiskMemberImpactDto): MemberImpact {
  return {
    memberId: dto.memberId,
    memberName: dto.label,
    impactType: asMemberImpactType(dto.impactType),
    direction: asMemberImpactDirection(dto.direction),
    degree: asMemberImpactDegree(dto.degree),
    explanation: dto.explanation,
  };
}

function asMemberImpactType(value: string): MemberImpactType {
  return (Object.values(MemberImpactType) as string[]).includes(value)
    ? (value as MemberImpactType)
    : MemberImpactType.DELAYED;
}

function asMemberImpactDirection(value?: string): MemberImpactDirection {
  return (Object.values(MemberImpactDirection) as string[]).includes(value ?? '')
    ? (value as MemberImpactDirection)
    : MemberImpactDirection.NEGATIVE;
}

function asMemberImpactDegree(value?: string): MemberImpactDegree {
  return (Object.values(MemberImpactDegree) as string[]).includes(value ?? '')
    ? (value as MemberImpactDegree)
    : MemberImpactDegree.MEDIUM;
}

function toContractConsequenceImpact(
  impact: ExecutionRiskCluster['consequenceImpacts'][number],
  cluster: ExecutionRiskCluster,
): RiskConsequenceImpact {
  return {
    impactId: `impact_${impact.sourceRiskId}_${impact.code}`,
    sourceRiskId: impact.sourceRiskId,
    targetRiskId: cluster.primaryRiskId,
    impactType: impact.code,
    description: impact.label,
    severity: clusterSeverityToContract(cluster.severity),
    causalLinkType: 'DERIVED',
  };
}

function clusterSeverityToContract(
  severity: ExecutionRiskCluster['severity'],
): ExecutionRiskSeverity {
  switch (severity) {
    case 'STOP':
      return ExecutionRiskSeverity.STOP;
    case 'REPLAN_REQUIRED':
      return ExecutionRiskSeverity.REPLAN_REQUIRED;
    default:
      return ExecutionRiskSeverity.AT_RISK;
  }
}
