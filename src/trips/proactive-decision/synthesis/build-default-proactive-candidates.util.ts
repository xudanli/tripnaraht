/**
 * PD-5 — Build default persona candidates for a Case (Neptune-shaped options).
 * Does not invent a second Agent; mirrors Guardian stub-candidate pattern.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { LensActivationDecisionV1 } from '../lenses/lens-activation.types';
import type {
  ProactiveSynthesisCandidateV1,
} from './proactive-synthesis.types';

export function buildDefaultProactiveCandidates(input: {
  caseId: ProactiveDecisionCaseId;
  lens: LensActivationDecisionV1;
  /** Abu already hard-blocked original */
  hardBlocked?: boolean;
}): ProactiveSynthesisCandidateV1[] {
  const abuOn = input.lens.activateAbu;
  const dreOn = input.lens.activateDrDre;
  const nepOn = input.lens.activateNeptune;
  const hard = input.hardBlocked === true;

  const keep: ProactiveSynthesisCandidateV1 = {
    optionId: 'OPT_KEEP_ORIGINAL',
    titleZh: '继续原计划',
    summaryZh: '在可接受风险下维持当前安排',
    benefitsZh: ['无需改行程', '保持既定节奏'],
    producedBy: [
      ...(abuOn ? (['ABU'] as const) : []),
      ...(dreOn ? (['DR_DRE'] as const) : []),
    ],
    scores: {
      feasibility: hard ? 0.1 : 0.75,
      risk: hard ? 0.9 : 0.45,
      abuVerdict: hard ? 'HARD_BLOCK' : 'ALLOW',
      experienceScore: 0.7,
      loadScore: 0.4,
      utility: hard ? 0.2 : 0.55,
    },
    feasible: !hard,
  };

  const postpone: ProactiveSynthesisCandidateV1 = {
    optionId: 'OPT_POSTPONE_NEXT_WINDOW',
    titleZh: '调整到下一可用窗口',
    summaryZh: '将活动移到明早或下一天气窗口',
    benefitsZh: ['风险降低', '保留核心体验', '对后续路线影响较低'],
    producedBy: [
      ...(dreOn ? (['DR_DRE'] as const) : []),
      ...(nepOn ? (['NEPTUNE'] as const) : []),
    ],
    scores: {
      feasibility: 0.9,
      risk: 0.2,
      abuVerdict: 'ALLOW',
      experienceScore: 0.85,
      loadScore: 0.35,
      utility: 0.88,
      repairQuality: nepOn ? 0.85 : undefined,
    },
    feasible: true,
  };

  const indoor: ProactiveSynthesisCandidateV1 = {
    optionId: 'OPT_INDOOR_SUBSTITUTE',
    titleZh: '室内替代活动',
    summaryZh: '用室内体验替换高暴露户外活动',
    benefitsZh: ['安全提升', '当天仍有可执行安排'],
    producedBy: nepOn ? ['NEPTUNE', 'ABU'] : ['ABU'],
    scores: {
      feasibility: 0.95,
      risk: 0.15,
      abuVerdict: 'ALLOW',
      experienceScore: 0.55,
      loadScore: 0.3,
      utility: 0.6,
      repairQuality: 0.7,
    },
    feasible: true,
  };

  const reroute: ProactiveSynthesisCandidateV1 = {
    optionId: 'OPT_REROUTE',
    titleZh: '改走可行路线',
    summaryZh: '避开关闭或困难路段，重排当日路线',
    benefitsZh: ['恢复可达性', '降低道路风险'],
    producedBy: nepOn ? ['NEPTUNE', 'ABU'] : ['ABU'],
    scores: {
      feasibility: 0.88,
      risk: 0.25,
      abuVerdict: 'ALLOW',
      experienceScore: 0.65,
      loadScore: 0.5,
      utility: 0.8,
      repairQuality: 0.9,
    },
    feasible: true,
  };

  const cancel: ProactiveSynthesisCandidateV1 = {
    optionId: 'OPT_CANCEL_ACTIVITY',
    titleZh: '取消该活动',
    summaryZh: '放弃本次活动，保护安全与后续日程',
    benefitsZh: ['风险最低'],
    producedBy: abuOn ? ['ABU'] : [],
    scores: {
      feasibility: 1,
      risk: 0.05,
      abuVerdict: 'ALLOW',
      experienceScore: 0.2,
      loadScore: 0.1,
      utility: 0.35,
    },
    feasible: true,
  };

  switch (input.caseId) {
    case 'CASE_CONTINUE_ACTIVITY':
      return nepOn ? [keep, postpone, indoor] : [keep, postpone];
    case 'CASE_POSTPONE_ACTIVITY':
      return nepOn ? [postpone, keep, cancel] : [postpone, keep];
    case 'CASE_REROUTE':
      return nepOn ? [reroute, keep, cancel] : [keep, cancel];
    default: {
      const _e: never = input.caseId;
      return _e;
    }
  }
}
