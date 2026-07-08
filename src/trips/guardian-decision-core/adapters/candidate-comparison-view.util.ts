/**
 * Build FE CandidateComparisonView from RFC-001 problem read model.
 */

import type { Rfc001DecisionCenterProblemView } from './decision-center-bridge.adapter';
import type {
  CandidateComparisonView,
  CandidateComparisonRowView,
  CandidatePaceLevel,
  CandidateRejectionView,
  CandidateSafetyStatus,
} from '../../../decision-runtime/gateway/frontend/candidate-comparison-view.types';
import {
  collectIntentRefsFromProblemContext,
  resolveIntentRefLabels,
} from './intent-ref-labels.util';
import { resolveExcessiveDailyLoadDisplayDayIndex } from '../detection/excessive-daily-load-problem.util';

const REJECTION_MESSAGES: Record<string, string> = {
  EXCESSIVE_DAILY_LOAD:
    '当天累计驾驶与活动负荷超出团队可舒适完成的范围，因此没有被推荐。',
  CANDIDATE_BLOCKED_BY_HARD_CONSTRAINT:
    '存在无法满足的安全或硬约束，因此没有被推荐。',
  DOMINATED: '在其他维度上被更优方案完全覆盖，因此没有被推荐。',
  INCOMPLETE_ASSESSMENT: '证据不足，无法确认该方案可安全执行。',
  HARD_CONSTRAINT: '违反不可妥协的安全或规则约束。',
};

function schemeLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function mapSafety(
  abuVerdict: string | undefined,
  blocked: boolean,
): { status: CandidateSafetyStatus; label: string } {
  if (blocked || abuVerdict === 'BLOCK') {
    return { status: 'FAIL', label: '不通过' };
  }
  if (abuVerdict === 'WARNING' || abuVerdict === 'UNKNOWN') {
    return { status: 'WARN', label: '需确认' };
  }
  return { status: 'PASS', label: '通过' };
}

function mapPace(
  physicalLoad?: number,
  scheduleStress?: number,
): { level: CandidatePaceLevel; label: string } {
  const load = ((physicalLoad ?? 0.3) + (scheduleStress ?? 0.3)) / 2;
  if (load <= 0.35) return { level: 'COMFORTABLE', label: '最轻松' };
  if (load <= 0.55) return { level: 'BALANCED', label: '中等' };
  if (load <= 0.75) return { level: 'STRETCHED', label: '较累' };
  return { level: 'OVERLOADED', label: '高风险' };
}

function formatCost(amount: number, currency: string): string {
  if (!amount || amount === 0) return '¥0';
  if (currency === 'ISK') return `≈${Math.round(amount)} ISK`;
  if (currency === 'CNY') return `¥${Math.round(amount)}`;
  return `${Math.round(amount)} ${currency}`;
}

function buildCandidateTitle(
  candidateId: string,
  generationMethod: string,
  index: number,
): string {
  if (candidateId === 'original') return '维持原计划';
  switch (generationMethod) {
    case 'SPLIT_DAY':
      return '拆分超载日，降低驾驶负荷';
    case 'ONTOLOGY_EQUIVALENCE':
      return '保留核心体验的等价替代';
    case 'LOCAL_SUBSTITUTION':
      return '本地替代，尽量保留原意图';
    case 'ROUTE_REPAIR':
      return '绕路方案，保留主要体验';
    case 'TEMPLATE':
      return '模板修复方案';
    default:
      return `替代方案 ${schemeLabel(index)}`;
  }
}

function buildPaceNote(
  view: Rfc001DecisionCenterProblemView,
  candidateId: string,
  generationMethod: string,
  pace: { level: CandidatePaceLevel; label: string },
): string | undefined {
  if (view.rfc001Problem.semanticCapability !== 'EXCESSIVE_DAILY_LOAD') {
    return undefined;
  }
  const day = resolveExcessiveDailyLoadDisplayDayIndex(view.rfc001Problem);
  if (candidateId === 'original') {
    return day != null
      ? `第 ${day} 日驾驶负荷过高，团队难以按此节奏完成。`
      : '当前日驾驶负荷过高，团队难以按此节奏完成。';
  }
  if (generationMethod === 'SPLIT_DAY' && day != null) {
    return pace.level === 'OVERLOADED'
      ? `拆分后第 ${day + 1} 日负荷仍偏高，需关注恢复时间。`
      : `将部分活动移至第 ${day + 1} 日，降低第 ${day} 日总负荷。`;
  }
  return undefined;
}

function buildOriginalIntentNarrative(
  labels: string[],
  semanticCapability?: string,
): string {
  if (labels.length >= 2) {
    return `你选择此行的核心原因是「${labels.join(' · ')}」。系统在替代方案中优先保留这些旅行意图，而不是随便换一个附近景点。`;
  }
  if (labels.length === 1) {
    return `你希望保留的核心体验是「${labels[0]}」。替代方案会尽量守住这一意图。`;
  }
  if (semanticCapability === 'EXCESSIVE_DAILY_LOAD') {
    return '当前方案在时间上看似排得下，但当天驾驶与活动负荷已超出团队可舒适完成的范围。';
  }
  if (semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED') {
    return '原计划依赖的户外条件当前不满足；系统寻找能保留核心体验意图的替代安排。';
  }
  if (semanticCapability === 'ROAD_SEGMENT_UNAVAILABLE') {
    return '原定路线当前不可行；系统寻找能保留你原本想体验的内容的绕路或替代方案。';
  }
  return '系统正在比较各方案的安全、节奏、体验保留与费用，帮你完成复杂取舍。';
}

function buildRejectionMessage(
  candidateId: string,
  reasonCodes: string[],
  view: Rfc001DecisionCenterProblemView,
): string {
  for (const code of reasonCodes) {
    if (REJECTION_MESSAGES[code]) {
      if (code === 'EXCESSIVE_DAILY_LOAD' && candidateId === 'original') {
        const day = resolveExcessiveDailyLoadDisplayDayIndex(view.rfc001Problem);
        return day != null
          ? `原计划虽然可达，但第 ${day} 日累计驾驶负荷过高，团队难以按此节奏完成，因此没有被推荐。`
          : REJECTION_MESSAGES[code];
      }
      return REJECTION_MESSAGES[code];
    }
  }
  if (candidateId === 'original') {
    return '原计划在当前约束下不可行或负荷过高，因此没有被推荐。';
  }
  return '该方案未通过 Decision Core 综合评估，因此没有被推荐。';
}

export function buildCandidateComparisonView(
  view: Rfc001DecisionCenterProblemView,
  options?: { destinationCountry?: string | null },
): CandidateComparisonView {
  const country = options?.destinationCountry;
  const workspace = view.workspace;
  const record = view.record;
  const recommendedId = record?.selectedCandidateId;

  const allPreservedRefs =
    workspace?.repairCandidates.flatMap((c) => c.preservedIntentRefs ?? []) ?? [];
  const intentRefs = collectIntentRefsFromProblemContext({
    repairPreservedRefs: allPreservedRefs,
    semanticCapability: view.rfc001Problem.semanticCapability,
  });
  const intentLabels = resolveIntentRefLabels(intentRefs, country);

  const rejections: CandidateRejectionView[] = (record?.rejectedCandidates ?? []).map(
    (r) => ({
      candidateId: r.candidateId,
      reasonCodes: r.reasonCodes,
      message: buildRejectionMessage(r.candidateId, r.reasonCodes, view),
    }),
  );

  const utilityById = new Map(
    (record?.utilityEvaluation ?? []).map((u) => [u.candidateId, u.utility]),
  );

  const rows: CandidateComparisonRowView[] = view.candidates.map((c, index) => {
    const repair = workspace?.repairCandidates.find(
      (r) => r.candidateId === c.candidateId,
    );
    const option = view.options.find((o) => o.id === c.candidateId);
    const pace = mapPace(c.physicalLoad, c.scheduleStress);
    const paceNote = buildPaceNote(
      view,
      c.candidateId,
      c.generationMethod,
      pace,
    );
    const costAmount = repair?.estimatedAddedCost?.amount ?? 0;
    const costCurrency = repair?.estimatedAddedCost?.currency ?? 'ISK';
    const rejection = rejections.find((r) => r.candidateId === c.candidateId);

    return {
      candidateId: c.candidateId,
      schemeLabel: schemeLabel(index),
      title: buildCandidateTitle(c.candidateId, c.generationMethod, index),
      subtitle: option?.description,
      recommended: recommendedId === c.candidateId,
      selectable: !c.blocked,
      safety: {
        status: mapSafety(c.abuVerdict, c.blocked).status,
        label: mapSafety(c.abuVerdict, c.blocked).label,
      },
      pace: {
        status: pace.level,
        label: pace.label,
        note: paceNote ?? rejection?.message,
      },
      experienceRetention: c.intentPreservation,
      experienceRetentionLabel: `${Math.round(c.intentPreservation * 100)}%`,
      cost: {
        amount: costAmount,
        currency: costCurrency,
        label: formatCost(costAmount, costCurrency),
      },
      utility: c.utility ?? utilityById.get(c.candidateId),
      drivingDeltaMinutes: c.estimatedAddedDurationMinutes || undefined,
    };
  });

  const headline =
    recommendedId && rows.find((r) => r.candidateId === recommendedId)
      ? `推荐方案 ${rows.find((r) => r.candidateId === recommendedId)!.schemeLabel}：${rows.find((r) => r.candidateId === recommendedId)!.title}`
      : undefined;

  return {
    schemaId: 'tripnara.candidate_comparison@v1',
    originalIntent: {
      intentRefs,
      labels: intentLabels,
      narrative: buildOriginalIntentNarrative(
        intentLabels,
        view.rfc001Problem.semanticCapability,
      ),
    },
    recommendedCandidateId: recommendedId,
    rows,
    rejections,
    headline,
  };
}
