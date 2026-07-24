/**
 * Projects Execution Risk Center ActiveRisk → Mobile ExecutionAlertsDto (BFF).
 */

import type { ActiveRisk } from '../../trips/execution-risk-center/types/execution-risk.types';
import {
  aggregateExecutionAlertRisks,
  buildActionOrientedRecommendation,
  mapRiskTypeLabel,
  resolveRequiredAction,
  type AggregatedExecutionAlertRisk,
} from '../../trips/execution-risk-center/utils/execution-alerts-aggregation.util';
import {
  alertLevelSortWeight,
  buildAffectedRouteLabel,
  buildAlertImpactSummary,
  executionGateToAlertLevel,
} from '../../trips/execution-risk-center/utils/execution-alerts-projection.util';
import { projectExecutionAlertCopy } from '../../trips/execution-risk-center/utils/execution-alert-copy.util';
import { enrichAlertWithUserNarrative } from '../../trips/execution-risk-center/utils/execution-user-narrative.projection.util';
import {
  enrichAlertWithAttentionPrimaryHeadline,
  filterRisksForPrimarySso,
  findAttentionPrimaryForRisk,
  resolveAnchorRiskForPrimarySso,
} from '../../trips/execution-risk-center/utils/attention-primary-sso-projection.util';
import type { AttentionPrimarySsoCutoverPlan } from '../../trips/guardian-decision-core/attention/attention-primary-sso-cutover.util';
import { filterKnowledgeNoiseForExecutionAlerts } from '../../trips/execution-risk-center/utils/execution-alert-knowledge-noise.util';
import { buildRiskCausalChain } from '../../trips/execution-risk-center/adapters/active-risk-intervention.adapter';
import type { ExecutionCausalInsightDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import {
  EXECUTION_ALERTS_SCHEMA_ID,
  EXECUTION_ALERTS_SCHEMA_V2_ID,
} from '../../trips/execution-risk-center/utils/execution-intervention.projection.util';
import type {
  ExecutionAlertDto,
  ExecutionAlertLevel,
  ExecutionAlertsDto,
  ExecutionInterventionCausalChainDto,
  ExecutionInterventionCausalNodeType,
} from '../dto/mobile-execution.types';

export { executionGateToAlertLevel, alertLevelSortWeight };

const MILD_INTERVENTION_COPY =
  /最小干预|提前\s*\d+\s*分钟|提早\s*\d+\s*分钟|advance/i;

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Card already shows title + reason — causalChain only carries structured nodes + non-overlapping supplement. */
export function slimCausalChainForExecutionAlertCard(
  chain: ExecutionInterventionCausalChainDto,
  copy: { title: string; reason: string; recommendedAction?: string },
  opts?: { requiredAction?: ReturnType<typeof resolveRequiredAction> },
): ExecutionInterventionCausalChainDto {
  const suppressMildIntervention =
    opts?.requiredAction === 'STOP' || opts?.requiredAction === 'REPLAN';
  const assessment = suppressMildIntervention
    ? stripMildInterventionCopy(extractAssessmentSupplement(chain.assessment, copy.reason))
    : extractAssessmentSupplement(chain.assessment, copy.reason);
  const headline = isAlertCausalHeadlineRedundant(chain.headline, copy.title) ? '' : chain.headline;
  let nodes = sanitizeCausalNodesForAlertCard(chain.nodes, copy.reason, copy.recommendedAction);
  if (suppressMildIntervention) {
    nodes = nodes.filter((node) => !isMildInterventionCausalNode(node));
  }

  return {
    ...chain,
    headline,
    assessment,
    nodes,
  };
}

function stripMildInterventionCopy(text: string): string {
  if (!text.trim()) return '';
  if (MILD_INTERVENTION_COPY.test(text)) return '';
  return text;
}

function isMildInterventionCausalNode(
  node: ExecutionInterventionCausalChainDto['nodes'][number],
): boolean {
  if (node.type !== 'OPTION') return false;
  const blob = `${node.title ?? ''} ${node.description ?? ''}`;
  return MILD_INTERVENTION_COPY.test(blob);
}

function normalizeCopyText(text: string): string {
  return text.replace(/\s+/g, '').replace(/。+/g, '。').trim();
}

/** Text in assessment that is not already covered by reason (e.g. recommendation hint). */
export function extractAssessmentSupplement(assessment: string, reason: string): string {
  const full = assessment.trim();
  const body = reason.trim();
  if (!full) return '';
  if (!body) return full;

  if (normalizeCopyText(full) === normalizeCopyText(body)) return '';

  const bodyCore = body.replace(/。+$/, '');
  if (full === bodyCore || full.startsWith(bodyCore)) {
    const delta = full.slice(bodyCore.length).replace(/^[。；;\s]+/, '').trim();
    return delta;
  }

  if (body && full.includes(bodyCore) && full.length - bodyCore.length < 80) {
    return full.replace(bodyCore, '').replace(/^[。；;\s]+/, '').trim();
  }

  return full;
}

function extractRouteLabel(text: string): string | undefined {
  const match = text.match(/([^\s。；：:]+?\s*(?:→|->)\s*[^\s。；：:\s]+)/);
  return match?.[1]?.trim();
}

export function isAlertCausalHeadlineRedundant(headline: string, title: string): boolean {
  const h = headline.trim();
  const t = title.trim();
  if (!h || !t) return false;

  const routeH = extractRouteLabel(h);
  const routeT = extractRouteLabel(t);
  if (routeH && routeT && normalizeCopyText(routeH) === normalizeCopyText(routeT)) {
    if (/安全提示|不建议|强风|预警|暴雨/.test(h) && /不建议|预警|强风|暴雨/.test(t)) {
      return true;
    }
  }

  const hCore = h.replace(/^安全提示[：:]\s*/, '').replace(/[。；;]+$/, '').trim();
  const tCore = t.replace(/，不建议按原计划出发$/, '').replace(/[。；;]+$/, '').trim();

  if (!hCore) return true;
  if (t.includes(hCore) || hCore.includes(tCore)) return true;

  return normalizeCopyText(hCore) === normalizeCopyText(tCore);
}

function sanitizeCausalNodesForAlertCard(
  nodes: ExecutionInterventionCausalChainDto['nodes'],
  reason: string,
  recommendedAction?: string,
): ExecutionInterventionCausalChainDto['nodes'] {
  const reasonNorm = normalizeCopyText(reason);

  return nodes.map((node) => {
    if (node.type !== 'CONFLICT') return node;

    const desc = node.description?.trim() ?? '';
    if (!desc) return node;

    const descNorm = normalizeCopyText(desc);
    if (
      descNorm.length > 48 &&
      (reasonNorm.includes(descNorm.slice(0, Math.min(40, descNorm.length))) ||
        /P90|m\/s|错过.*概率/.test(desc))
    ) {
      return {
        ...node,
        description: '按原计划出发可能无法满足当前行程约束',
      };
    }

    if (
      recommendedAction &&
      node.type === 'CONFLICT' &&
      desc === recommendedAction
    ) {
      return node;
    }

    return node;
  });
}

export function resolvePrimaryRiskCausalChain(input: {
  causalInsight?: ExecutionCausalInsightDto;
  risk: ActiveRisk;
  title: string;
  reason: string;
  recommendedAction?: string;
}): ExecutionInterventionCausalChainDto {
  const story = input.causalInsight?.causalStory;
  if (story?.chain?.length) {
    return {
      headline: input.causalInsight!.guardianHeadline || input.title,
      assessment: story.assessment || input.reason,
      nodes: story.chain.map((node) => ({
        nodeId: node.nodeId,
        type: node.type as ExecutionInterventionCausalNodeType,
        title: node.title,
        description: node.description,
        ...(node.sourceRefs?.length ? { sourceRefs: node.sourceRefs } : {}),
      })),
    };
  }

  return buildRiskCausalChain(
    input.risk,
    input.recommendedAction ?? '查看并确认调整方案',
  );
}

export function projectActiveRiskToExecutionAlert(
  risk: ActiveRisk,
  opts?: {
    presentationRole?: ExecutionAlertDto['presentationRole'];
    parentRiskId?: string;
    assessmentText?: string;
    recommendedAction?: string;
    routeLabel?: string;
  },
): ExecutionAlertDto {
  const level = executionGateToAlertLevel(risk.executionGate, risk.level);
  const copy = projectExecutionAlertCopy(risk, {
    assessmentText: opts?.assessmentText,
    recommendedAction: opts?.recommendedAction,
    routeLabel: opts?.routeLabel,
  });
  const affectedRoute = buildAffectedRouteLabel(risk) ?? opts?.routeLabel;
  const affectedActivities = uniqueLabels([
    ...risk.affectedActivities.map((a) => a.label),
    ...risk.affectedLocations.map((a) => a.label),
    ...risk.affectedRouteSegments.map((a) => a.label),
  ]);

  return {
    id: risk.id,
    riskId: risk.id,
    riskKey: risk.riskKey,
    riskLevel: risk.level,
    executionGate: risk.executionGate,
    acknowledgementStatus: risk.acknowledgementStatus,
    presentationRole: opts?.presentationRole,
    parentRiskId: opts?.parentRiskId,
    riskType: mapRiskTypeLabel(risk),
    affectedRoute,
    level,
    title: copy.title,
    reason: copy.reason,
    recommendedAction: copy.recommendedAction,
    impact: buildAlertImpactSummary(risk),
    affectedActivities,
    evidenceRefs: risk.evidenceRefs.map((e) => e.id),
    observedAt: risk.updatedAt,
    requiresImmediateAttention: level === 'STOP' || level === 'REPLAN_REQUIRED',
    treatmentStatus: risk.treatmentStatus,
    recommendationIds: risk.recommendationIds,
    decisionProblemIds: risk.decisionProblemIds,
  };
}

function projectAggregatedAlert(
  entry: AggregatedExecutionAlertRisk,
  copyCtx?: { assessmentText?: string; recommendedAction?: string },
): ExecutionAlertDto {
  return projectActiveRiskToExecutionAlert(entry.risk, {
    presentationRole: entry.role,
    parentRiskId: entry.parentRiskId,
    assessmentText: copyCtx?.assessmentText,
    recommendedAction: copyCtx?.recommendedAction,
  });
}

export function buildExecutionAlertsFromActiveRisks(input: {
  tripId: string;
  contextVersion: number;
  risks: ActiveRisk[];
  summaryHeadline?: string;
  summaryDetail?: string;
  summaryRecommendedAction?: string;
  causalInsight?: ExecutionCausalInsightDto;
  evidenceIds?: string[];
  cutoverPlan?: AttentionPrimarySsoCutoverPlan | null;
}): ExecutionAlertsDto {
    const cutoverPlan = input.cutoverPlan ?? null;
    const ssoAnchorRisk =
      cutoverPlan && input.risks.length > 0
        ? resolveAnchorRiskForPrimarySso(input.risks, cutoverPlan)
        : undefined;
    const risks = filterKnowledgeNoiseForExecutionAlerts(
      cutoverPlan ? filterRisksForPrimarySso(input.risks, cutoverPlan) : input.risks,
      ssoAnchorRisk,
    );
    const aggregation = aggregateExecutionAlertRisks(risks, ssoAnchorRisk);
  const copyCtx = {
    assessmentText: input.summaryDetail,
    recommendedAction: input.summaryRecommendedAction,
  };
  const primaryBase = aggregation.primary
    ? projectAggregatedAlert(aggregation.primary, copyCtx)
    : undefined;
  const primaryAlert =
    primaryBase && aggregation.primary
      ? (() => {
          const primaryRequiredAction = resolveRequiredAction(
            executionGateToAlertLevel(
              aggregation.primary.risk.executionGate,
              aggregation.primary.risk.level,
            ),
          );
          const recommendedAction = reconcilePrimaryRecommendedAction({
            recommendedAction: primaryBase.recommendedAction,
            requiredAction: primaryRequiredAction,
            level: primaryBase.level,
          });
          const rawChain = resolvePrimaryRiskCausalChain({
            causalInsight: input.causalInsight,
            risk: aggregation.primary.risk,
            title: primaryBase.title,
            reason: primaryBase.reason,
            recommendedAction,
          });
          return {
            ...primaryBase,
            recommendedAction,
            causalChain: slimCausalChainForExecutionAlertCard(
              rawChain,
              {
                title: primaryBase.title,
                reason: primaryBase.reason,
                recommendedAction,
              },
              { requiredAction: primaryRequiredAction },
            ),
          };
        })()
      : undefined;
  const independentAlerts = aggregation.independent.map((e) => projectAggregatedAlert(e));
  const listAlerts = aggregation.listAlerts.map((e) => {
    if (e.role === 'PRIMARY' && primaryAlert) return primaryAlert;
    if (e.role === 'PRIMARY') return projectAggregatedAlert(e, copyCtx);
    return projectAggregatedAlert(e);
  });
  const topLevel = resolveTopAlertLevel(listAlerts);
  const requiredAction = resolveRequiredAction(topLevel);

  const banner =
    primaryAlert && (topLevel === 'STOP' || topLevel === 'REPLAN_REQUIRED')
      ? {
          level: topLevel,
          title: primaryAlert.title,
          detail: primaryAlert.reason,
        }
      : undefined;

  const recommendation = buildActionOrientedRecommendation({
    primary: aggregation.primary?.risk ?? null,
    requiredAction,
    advisoryDetail: input.summaryDetail,
  });

  const basedOnRiskIds = [
    ...(aggregation.primary ? [aggregation.primary.risk.id] : []),
    ...aggregation.independent.map((e) => e.risk.id),
  ];

  const riskById = new Map(risks.map((r) => [r.id, r]));
  const enrichedPrimary = primaryAlert
    ? (() => {
        let alert = enrichAlertWithUserNarrative(primaryAlert, {
          requiredAction,
          sourceRisk: aggregation.primary?.risk ?? riskById.get(primaryAlert.id),
        });
        if (cutoverPlan && aggregation.primary?.risk) {
          const attentionPrimary = findAttentionPrimaryForRisk(
            aggregation.primary.risk,
            cutoverPlan,
          );
          if (attentionPrimary) {
            alert = enrichAlertWithAttentionPrimaryHeadline(alert, attentionPrimary);
          }
        }
        return alert;
      })()
    : undefined;
  const enrichedIndependent = independentAlerts.map((alert) => {
    const entry = aggregation.independent.find((e) => e.risk.id === alert.id);
    return enrichAlertWithUserNarrative(alert, {
      requiredAction,
      sourceRisk: entry?.risk ?? riskById.get(alert.id),
    });
  });

  return {
    schemaId: EXECUTION_ALERTS_SCHEMA_V2_ID,
    tripId: input.tripId,
    contextVersion: input.contextVersion,
    projectionSource: cutoverPlan
      ? 'execution_risk_center+attention_primary_sso'
      : 'execution_risk_center',
    banner,
    requiredAction,
    primaryRisk: enrichedPrimary,
    impacts: aggregation.impacts,
    independentRisks: enrichedIndependent,
    // v2 list field: independent only — primary is in primaryRisk / aiRecommendation (iOS 活跃风险提醒)
    alerts: enrichedIndependent,
    aiRecommendation: {
      title: recommendation?.title ?? '建议',
      detail:
        recommendation?.detail ??
        (listAlerts.length > 0 ? '优先处理执行预警后再继续行程' : '可继续按当前计划执行'),
      evidenceIds: input.evidenceIds ?? listAlerts.flatMap((a) => a.evidenceRefs),
      basedOnRiskIds,
      headline: input.summaryHeadline,
    },
  };
}

/** Trip-level advisory may say "保持原计划" while STOP primary requires replan — suppress conflict. */
export function reconcilePrimaryRecommendedAction(input: {
  recommendedAction?: string;
  requiredAction: ReturnType<typeof resolveRequiredAction>;
  level: ExecutionAlertLevel;
}): string | undefined {
  const action = input.recommendedAction?.trim();
  if (!action) return undefined;
  if (input.requiredAction === 'STOP' || input.requiredAction === 'REPLAN') {
    if (/保持原计划|keep\s*original/i.test(action)) {
      return undefined;
    }
    if (MILD_INTERVENTION_COPY.test(action)) {
      return undefined;
    }
  }
  if (input.level === 'STOP' && /保持原计划|keep\s*original/i.test(action)) {
    return undefined;
  }
  return action;
}

function resolveTopAlertLevel(alerts: ExecutionAlertDto[]): ExecutionAlertLevel {
  if (alerts.length === 0) return 'AT_RISK';
  return [...alerts].sort((a, b) => alertLevelSortWeight(a.level) - alertLevelSortWeight(b.level))[0]!
    .level;
}

/** @deprecated legacy schema id for non-ERC paths */
export { EXECUTION_ALERTS_SCHEMA_ID };
