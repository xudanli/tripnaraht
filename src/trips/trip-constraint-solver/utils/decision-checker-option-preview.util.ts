/**
 * Phase 3b — decision-checker counterfactual from unified option preview API.
 */

import type { UnifiedDecisionActionPreviewView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type {
  DecisionCheckerCounterfactualDto,
  DecisionCheckerScenarioDto,
} from '../types/decision-checker.types';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

const SCENARIO_VARIANTS: Array<'blue' | 'orange' | 'purple'> = ['blue', 'orange', 'purple'];
const SCENARIO_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function resolveDecisionCheckerProblemId(input: {
  focusConflictId?: string;
  planningConflictId?: string;
  issue?: FeasibilityIssueDto;
}): string | undefined {
  return (
    input.focusConflictId?.trim() ||
    input.planningConflictId?.trim() ||
    input.issue?.semanticKey ||
    input.issue?.id
  );
}

function previewToScenario(
  preview: UnifiedDecisionActionPreviewView,
  index: number,
  issue?: FeasibilityIssueDto,
): DecisionCheckerScenarioDto {
  const recommended = index === 0;
  const impact = preview.action.expectedImpact;
  const metrics: DecisionCheckerScenarioDto['metrics'] = [];
  if (typeof impact?.feasibilityDelta === 'number') {
    metrics.push({
      key: 'feasibility',
      label: '可行性',
      displayValue: `${impact.feasibilityDelta >= 0 ? '+' : ''}${Math.round(impact.feasibilityDelta)}`,
      tone: impact.feasibilityDelta >= 0 ? 'good' : 'bad',
    });
  }
  if (typeof impact?.durationDelta === 'number') {
    metrics.push({
      key: 'duration',
      label: '时长',
      displayValue: `${impact.durationDelta >= 0 ? '+' : ''}${Math.round(impact.durationDelta)} 分钟`,
      tone: impact.durationDelta <= 0 ? 'good' : 'neutral',
    });
  }

  return {
    id: preview.actionId,
    letter: SCENARIO_LETTERS[index] ?? String(index + 1),
    title: preview.action.title,
    badge: recommended ? 'recommended' : 'alternative',
    badgeLabel: recommended ? '推荐' : '备选',
    description: preview.action.summary,
    variant: SCENARIO_VARIANTS[index % SCENARIO_VARIANTS.length],
    metrics,
    action: {
      type: 'select_option',
      payload: {
        optionId: preview.actionId,
        problemId: preview.problemId,
        issueId: issue?.id,
        writeChain: 'decision-problems-preview',
      },
    },
  };
}

export function buildCounterfactualFromOptionPreviews(
  previews: UnifiedDecisionActionPreviewView[],
  issue?: FeasibilityIssueDto,
): DecisionCheckerCounterfactualDto {
  const scenarios = previews.slice(0, 5).map((p, i) => previewToScenario(p, i, issue));

  let ifUnchanged: DecisionCheckerCounterfactualDto['ifUnchanged'];
  if (issue?.priority === 'must_handle' && scenarios.length > 0) {
    const letters = scenarios.map((s) => s.letter).filter(Boolean).slice(0, 2);
    ifUnchanged = {
      riskLevel: issue.severity === 'high' ? 'high' : 'medium',
      label: issue.severity === 'high' ? '风险较高' : '风险中等',
      points: [{ title: issue.title, description: issue.message }],
      recommendation: {
        text: `建议选择 ${letters.join(' 或 ') || '推荐方案'}（来自 decision-problems option preview）。`,
        source: 'rule',
      },
    };
  }

  return {
    headline: '可选方案预览',
    subheadline: '正式 apply 请走 decision-problems',
    scenarios,
    ifUnchanged,
  };
}
