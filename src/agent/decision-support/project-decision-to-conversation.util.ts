import {
  optionDimensionsForCard,
} from './build-travel-decision-problem.util';
import type { TravelDecisionProblem } from './travel-decision.types';

/** 客户端可安全填入输入框的选择话术（禁止用 optionId 如 2WD） */
export function buildOptionComposerMessageZh(params: {
  label_zh: string;
  recommended?: boolean;
}): string {
  const label = String(params.label_zh ?? '').trim() || '该方案';
  return params.recommended ? `我选择（推荐）：${label}` : `我选择：${label}`;
}

/**
 * 决策卡主文案：短结论 + 指向卡片，避免把 2WD/4WD 等技术 id 与长选项列表塞进气泡/下一轮提示词。
 */
export function buildDecisionSupportAnswerText(problem: TravelDecisionProblem): string {
  const lines: string[] = [];
  lines.push(`${problem.subject.title_zh}：${problem.subject.question_zh}`);
  if (problem.recommendation) {
    const rec = problem.options.find((o) => o.optionId === problem.recommendation?.optionId);
    lines.push(
      `建议优先考虑「${rec?.label_zh ?? problem.recommendation.optionId}」——${problem.recommendation.reason_zh}`,
    );
  } else {
    lines.push(problem.subject.reason_zh);
  }
  lines.push('请在下方方案对比卡中点选一项；确认后只写入旅行决策，不会静默改行程。');
  return lines.join('\n');
}

/** 投影到 conversation assembler 的 tradeoff 源 */
export function projectDecisionProblemToTradeoffSource(problem: TravelDecisionProblem): {
  travel_decision_problem: TravelDecisionProblem;
  negotiation_payload: {
    hash: string;
    problem_zh: string;
    recommendation_zh?: string;
    alternatives: Array<{
      id: string;
      title_zh: string;
      summary_zh: string;
      recommended?: boolean;
      feasibility?: string;
      /** 点击后应提交的中文 message（勿提交 id） */
      message?: string;
      composer_message_zh?: string;
      dimensions?: ReturnType<typeof optionDimensionsForCard>;
      blocking_reasons_zh?: string[];
      required_changes_zh?: string[];
    }>;
  };
  requires_consent: boolean;
  suggested_operations: Array<{
    id: string;
    label: string;
    label_zh: string;
    kind: 'route_and_run_message';
    payload: {
      message: string;
      trip_id: string;
      decision_id: string;
      option_id: string;
      decision_key: string;
    };
  }>;
} {
  const alternatives = problem.options.map((o) => {
    const composer = buildOptionComposerMessageZh({
      label_zh: o.label_zh,
      recommended: o.recommended,
    });
    return {
      id: o.optionId,
      title_zh: o.label_zh,
      summary_zh: o.summary_zh,
      recommended: o.recommended === true,
      feasibility: o.feasibility,
      message: composer,
      composer_message_zh: composer,
      dimensions: optionDimensionsForCard(o),
      ...(o.blockingReasons_zh?.length
        ? { blocking_reasons_zh: o.blockingReasons_zh }
        : {}),
      ...(o.requiredChanges_zh?.length
        ? { required_changes_zh: o.requiredChanges_zh }
        : {}),
    };
  });

  const suggested_operations = problem.options
    .filter((o) => o.feasibility !== 'BLOCKED')
    .map((o) => {
      const composer = buildOptionComposerMessageZh({
        label_zh: o.label_zh,
        recommended: o.recommended,
      });
      return {
        id: `select_${o.optionId}`,
        label: o.recommended ? `选推荐：${o.label_zh}` : `选择：${o.label_zh}`,
        label_zh: o.recommended ? `选推荐：${o.label_zh}` : `选择：${o.label_zh}`,
        kind: 'route_and_run_message' as const,
        payload: {
          message: composer,
          trip_id: problem.tripId,
          decision_id: problem.decisionId,
          option_id: o.optionId,
          decision_key: problem.decisionKey,
        },
      };
    });

  return {
    travel_decision_problem: problem,
    requires_consent: true,
    negotiation_payload: {
      hash: problem.decisionId,
      problem_zh: `${problem.subject.question_zh}（${problem.subject.reason_zh}）`,
      recommendation_zh: problem.recommendation?.reason_zh,
      alternatives,
    },
    suggested_operations,
  };
}

export function buildDecisionCommitAnswerText(problem: TravelDecisionProblem): string {
  const opt = problem.options.find((o) => o.optionId === problem.selection?.optionId);
  const label = opt?.label_zh ?? problem.selection?.optionId ?? '所选方案';
  const lines = [
    `已记录决策：${problem.subject.title_zh} → 「${label}」。`,
    `写入目标：${problem.persistenceTarget}（已写入旅行决策；尚未自动改行程）。`,
  ];
  if (problem.downstreamDraftHint_zh) {
    lines.push(problem.downstreamDraftHint_zh);
  }
  lines.push('若行程需对齐该策略，请点击「生成调整草案」。');
  return lines.join('\n');
}
