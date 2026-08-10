/**
 * Useful Intervention Window + Timing Evaluation。
 * 证明「什么时间打断最有价值」。
 */

import type { InterventionCandidateV1 } from './intervention-candidate.util';

export const USEFUL_INTERVENTION_WINDOW_SCHEMA =
  'nara.useful_intervention_window@v1' as const;

export type UsefulInterventionWindowV1 = {
  schemaId: typeof USEFUL_INTERVENTION_WINDOW_SCHEMA;
  version: 1;
  windowId: string;
  candidateId: string;
  /** 窗口开始（相对事件，小时；负=事件前） */
  windowStartHoursBeforeEvent: number;
  windowEndHoursBeforeEvent: number;
  /** 候选提出时刻相对事件（小时） */
  proposedHoursBeforeEvent: number;
  insideUsefulWindow: boolean;
};

export type TimingEvalKind = 'ON_TIME' | 'TOO_EARLY' | 'TOO_LATE' | 'OUTSIDE';

export type TimingEvaluationV1 = {
  schemaId: 'nara.intervention_timing_evaluation@v1';
  version: 1;
  candidateId: string;
  kind: TimingEvalKind;
  hoursFromWindowCenter: number;
  reasonZh: string;
};

export function defineUsefulInterventionWindow(input: {
  candidate: InterventionCandidateV1;
  /** 事件预计发生相对 now 的小时（正=未来） */
  eventInHours: number;
  /** 有用窗口：事件前 [end, start] 小时 */
  windowStartHoursBeforeEvent?: number;
  windowEndHoursBeforeEvent?: number;
}): UsefulInterventionWindowV1 {
  const start = input.windowStartHoursBeforeEvent ?? 36;
  const end = input.windowEndHoursBeforeEvent ?? 2;
  if (start <= end) {
    throw new Error('[UsefulWindow] start_must_be_gt_end');
  }
  const proposed = input.eventInHours;
  const inside = proposed <= start && proposed >= end;
  return {
    schemaId: USEFUL_INTERVENTION_WINDOW_SCHEMA,
    version: 1,
    windowId: `uiw_${input.candidate.candidateId}`,
    candidateId: input.candidate.candidateId,
    windowStartHoursBeforeEvent: start,
    windowEndHoursBeforeEvent: end,
    proposedHoursBeforeEvent: proposed,
    insideUsefulWindow: inside,
  };
}

export function evaluateInterventionTiming(
  window: UsefulInterventionWindowV1,
): TimingEvaluationV1 {
  const { proposedHoursBeforeEvent: p, windowStartHoursBeforeEvent: start, windowEndHoursBeforeEvent: end } =
    window;
  const center = (start + end) / 2;
  const hoursFromWindowCenter = p - center;

  let kind: TimingEvalKind;
  let reasonZh: string;
  if (window.insideUsefulWindow) {
    kind = 'ON_TIME';
    reasonZh = '落在 Useful Intervention Window 内';
  } else if (p > start) {
    kind = 'TOO_EARLY';
    reasonZh = `过早：距事件 ${p.toFixed(1)}h > 窗口起点 ${start}h`;
  } else if (p < end) {
    kind = 'TOO_LATE';
    reasonZh = `过晚：距事件 ${p.toFixed(1)}h < 窗口终点 ${end}h`;
  } else {
    kind = 'OUTSIDE';
    reasonZh = '落在有用窗口外';
  }

  return {
    schemaId: 'nara.intervention_timing_evaluation@v1',
    version: 1,
    candidateId: window.candidateId,
    kind,
    hoursFromWindowCenter,
    reasonZh,
  };
}
