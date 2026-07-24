import type { InterventionAction } from '../../../generated/execution-risk-contracts';
import {
  InterventionActionCategory,
  RecommendationStatus,
  RecommendationType,
} from '../../../generated/execution-risk-contracts';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import type { ActiveRisk } from '../types/execution-risk.types';
import type { PackageHarnessExpectedPlan } from '../harness/package-harness.types';
import { assertSafetyVetoOnPlans } from './execution-risk-plan-safety.util';

export interface ExecutionRiskPlanAction {
  category: InterventionActionCategory;
  actionCode: string;
  label?: string;
}

export interface ExecutionRiskThreePlan {
  planType: RecommendationType;
  title: string;
  actionCodes: string[];
  actions: ExecutionRiskPlanAction[];
  status: RecommendationStatus;
  timeDeltaMinutes: { min: number; max: number };
  experienceRetention: { min: number; max: number };
  safetyDelta: { min: number; max: number };
  unavailableReason?: string;
}

export function generateThreePlansFromHarnessExpected(
  expectedPlans: PackageHarnessExpectedPlan[] | undefined,
  cluster: ExecutionRiskCluster,
): ExecutionRiskThreePlan[] {
  if (!expectedPlans?.length) return [];

  return expectedPlans.map((plan) => {
    const planType =
      plan.planType === 'UNAVAILABLE'
        ? RecommendationType.UNAVAILABLE
        : (plan.planType as RecommendationType);
    const timeDelta = plan.timeDeltaMinutes ?? { min: 0, max: 0 };
    const experience = plan.experienceRetention ?? { min: 70, max: 90 };
    const safety = plan.safetyDelta ?? { min: 10, max: 30 };

    return {
      planType,
      title: planTitleForType(planType, cluster.primaryKnowledgeCode),
      actionCodes: [...plan.actionCodes],
      actions: plan.actionCodes.map((code) => ({
        category: inferActionCategory(code),
        actionCode: code,
        label: code,
      })),
      status:
        plan.status === 'UNAVAILABLE' || planType === RecommendationType.UNAVAILABLE
          ? RecommendationStatus.REJECTED
          : RecommendationStatus.PRESENTED,
      timeDeltaMinutes: timeDelta,
      experienceRetention: experience,
      safetyDelta: safety,
      unavailableReason:
        planType === RecommendationType.UNAVAILABLE
          ? 'No additional feasible plan under current constraints'
          : undefined,
    };
  });
}

export function generateThreePlansFromKnowledge(input: {
  cluster: ExecutionRiskCluster;
  risks: ActiveRisk[];
  actionsByCode: Map<string, InterventionAction>;
}): ExecutionRiskThreePlan[] {
  const knowledgeCodes = collectClusterKnowledgeCodes(input.cluster, input.risks);
  const applicable = [...input.actionsByCode.values()].filter((action) =>
    action.applicableRiskCodes.some((code) => knowledgeCodes.includes(code)),
  );
  if (applicable.length === 0) return [];

  const recommended = pickActions(applicable, 'RECOMMENDED');
  const conservative = pickActions(applicable, 'CONSERVATIVE');
  const minimal = pickActions(applicable, 'MINIMAL_CHANGE');

  const plans = [
    buildKnowledgePlan(RecommendationType.RECOMMENDED, recommended, input.cluster),
    buildKnowledgePlan(RecommendationType.CONSERVATIVE, conservative, input.cluster),
    buildKnowledgePlan(RecommendationType.MINIMAL_CHANGE, minimal, input.cluster),
  ];
  return vetoUnsafePlansUnderStop(plans, input.cluster.severity);
}

function vetoUnsafePlansUnderStop(
  plans: ExecutionRiskThreePlan[],
  severity: ExecutionRiskCluster['severity'] | undefined,
): ExecutionRiskThreePlan[] {
  if (severity !== 'STOP') return plans;

  return plans.map((plan) => {
    if (plan.planType === RecommendationType.UNAVAILABLE) return plan;
    const vetoFailures = assertSafetyVetoOnPlans('runtime', 'STOP', [
      { planType: plan.planType, actionCodes: plan.actionCodes },
    ]);
    if (vetoFailures.length === 0) return plan;

    return {
      ...plan,
      actionCodes: [],
      actions: [],
      status: RecommendationStatus.REJECTED,
      unavailableReason: 'VETOED_BY_SAFETY',
    };
  });
}

export function assertThreePlanDiversity(
  plans: ExecutionRiskThreePlan[],
  expectedPlans?: PackageHarnessExpectedPlan[],
): string[] {
  const failures: string[] = [];
  const available = plans.filter((p) => p.planType !== RecommendationType.UNAVAILABLE);
  if (available.length < 3) return failures;

  const lowImpactScenario = (expectedPlans ?? []).every(
    (p) => (p.safetyDelta?.max ?? 1) === 0 && (p.safetyDelta?.min ?? 1) === 0,
  );

  const codes = available.map((p) => [...p.actionCodes].sort().join('|'));
  if (codes[0] === codes[1] && codes[0] === codes[2]) {
    failures.push('all 3 plans share identical actionCodes');
  }
  const uniqueSets = new Set(codes);
  if (uniqueSets.size < 2) {
    failures.push('fewer than 2 distinct actionCodes sets across 3 plans');
  }

  if (lowImpactScenario) return failures;

  const recommended = available.find((p) => p.planType === RecommendationType.RECOMMENDED);
  const minimal = available.find((p) => p.planType === RecommendationType.MINIMAL_CHANGE);
  const conservative = available.find((p) => p.planType === RecommendationType.CONSERVATIVE);

  if (recommended && minimal) {
    const recMid = midpoint(recommended.timeDeltaMinutes);
    const minMid = midpoint(minimal.timeDeltaMinutes);
    if (recMid === minMid) {
      failures.push('RECOMMENDED and MINIMAL_CHANGE timeDeltaMinutes ranges lack spread');
    }
  }

  if (conservative && minimal) {
    const conExp = midpoint(conservative.experienceRetention);
    const minExp = midpoint(minimal.experienceRetention);
    if (Math.abs(conExp - minExp) < 10) {
      failures.push(
        'experienceRetention spread < 10 between CONSERVATIVE and MINIMAL_CHANGE',
      );
    }
    const conSafe = midpoint(conservative.safetyDelta);
    const minSafe = midpoint(minimal.safetyDelta);
    if (Math.abs(conSafe - minSafe) < 10) {
      failures.push('safetyDelta spread < 10 between CONSERVATIVE and MINIMAL_CHANGE');
    }
  }

  return failures;
}

function collectClusterKnowledgeCodes(cluster: ExecutionRiskCluster, risks: ActiveRisk[]): string[] {
  const codes = new Set<string>();
  if (cluster.primaryKnowledgeCode) codes.add(cluster.primaryKnowledgeCode);
  for (const id of cluster.relatedRiskIds) {
    const risk = risks.find((r) => r.id === id);
    if (risk?.knowledgeCode) codes.add(risk.knowledgeCode);
  }
  return [...codes];
}

function pickActions(
  actions: InterventionAction[],
  strategy: 'RECOMMENDED' | 'CONSERVATIVE' | 'MINIMAL_CHANGE',
): InterventionAction[] {
  const sorted = [...actions].sort((a, b) => compareActionForStrategy(a, b, strategy));
  return sorted.slice(0, Math.min(3, sorted.length));
}

function compareActionForStrategy(
  a: InterventionAction,
  b: InterventionAction,
  strategy: 'RECOMMENDED' | 'CONSERVATIVE' | 'MINIMAL_CHANGE',
): number {
  if (strategy === 'CONSERVATIVE') {
    return b.safetyImpact - a.safetyImpact || a.experienceImpact - b.experienceImpact;
  }
  if (strategy === 'MINIMAL_CHANGE') {
    const aTime = Math.abs(midpoint(a.timeImpactMinRange));
    const bTime = Math.abs(midpoint(b.timeImpactMinRange));
    return aTime - bTime || a.safetyImpact - b.safetyImpact;
  }
  return b.safetyImpact - a.safetyImpact || b.experienceImpact - a.experienceImpact;
}

function buildKnowledgePlan(
  planType: RecommendationType,
  actions: InterventionAction[],
  cluster: ExecutionRiskCluster,
): ExecutionRiskThreePlan {
  const timeMins = actions.map((a) => a.timeImpactMinRange.min);
  const timeMaxs = actions.map((a) => a.timeImpactMinRange.max);
  const safetyVals = actions.map((a) => a.safetyImpact * 15);
  const expVals = actions.map((a) => Math.max(0, 80 + a.experienceImpact * 10));

  return {
    planType,
    title: planTitleForType(planType, cluster.primaryKnowledgeCode),
    actionCodes: actions.map((a) => a.actionCode),
    actions: actions.map((a) => ({
      category: a.actionCategory,
      actionCode: a.actionCode,
      label: a.name,
    })),
    status: RecommendationStatus.PRESENTED,
    timeDeltaMinutes: {
      min: timeMins.length ? Math.min(...timeMins) : 0,
      max: timeMaxs.length ? Math.max(...timeMaxs) : 0,
    },
    experienceRetention: {
      min: expVals.length ? Math.min(...expVals) : 60,
      max: expVals.length ? Math.max(...expVals) : 90,
    },
    safetyDelta: {
      min: safetyVals.length ? Math.min(...safetyVals) : 10,
      max: safetyVals.length ? Math.max(...safetyVals) : 30,
    },
  };
}

function planTitleForType(planType: RecommendationType, knowledgeCode?: string): string {
  const subject = knowledgeCode ?? 'risk';
  switch (planType) {
    case RecommendationType.CONSERVATIVE:
      return `Conservative adjustment for ${subject}`;
    case RecommendationType.MINIMAL_CHANGE:
      return `Minimal-change adjustment for ${subject}`;
    case RecommendationType.UNAVAILABLE:
      return `No feasible plan for ${subject}`;
    default:
      return `Recommended adjustment for ${subject}`;
  }
}

function inferActionCategory(actionCode: string): InterventionActionCategory {
  const upper = actionCode.toUpperCase();
  if (upper.includes('ROUTE') || upper.includes('DRIVE') || upper.includes('DETOUR')) {
    return InterventionActionCategory.ROUTE;
  }
  if (upper.includes('BOOK') || upper.includes('HOTEL') || upper.includes('OPERATOR')) {
    return InterventionActionCategory.BOOKING;
  }
  if (upper.includes('TEAM') || upper.includes('MEMBER') || upper.includes('REST')) {
    return InterventionActionCategory.TEAM;
  }
  if (upper.includes('SKIP') || upper.includes('HIKE') || upper.includes('ACTIVITY')) {
    return InterventionActionCategory.ACTIVITY;
  }
  if (upper.includes('EMERGENCY') || upper.includes('EVAC')) {
    return InterventionActionCategory.EMERGENCY;
  }
  return InterventionActionCategory.TIME;
}

function midpoint(range: { min: number; max: number }): number {
  return (range.min + range.max) / 2;
}
