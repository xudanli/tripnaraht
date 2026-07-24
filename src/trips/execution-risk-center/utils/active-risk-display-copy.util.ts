/**
 * Applies user-facing title/summary split for ActiveRisk read APIs.
 * Aligns GET /execution-risks/* with execution-alerts copy projection.
 */

import type { ActiveRisk } from '../types/execution-risk.types';
import {
  type ExecutionAlertCopyContext,
  projectExecutionAlertCopy,
} from './execution-alert-copy.util';

export function shouldUseAdvisoryAssessmentCopy(risk: ActiveRisk): boolean {
  if (risk.knowledgeCode === 'ENV-WIND-01' || risk.code === 'WEATHER_STRONG_WIND') {
    return true;
  }
  if (risk.type !== 'ENVIRONMENT') return false;
  const hay = `${risk.title} ${risk.summary}`;
  return /强风|阵风|侧风|暴雨|heavy rain|south_coast/i.test(hay);
}

export function applyActiveRiskUserFacingCopy(
  risk: ActiveRisk,
  ctx: ExecutionAlertCopyContext = {},
): ActiveRisk {
  const scopedCtx = shouldUseAdvisoryAssessmentCopy(risk)
    ? ctx
    : { ...ctx, assessmentText: undefined, hazardWindMps: undefined };
  const copy = projectExecutionAlertCopy(risk, scopedCtx);
  if (copy.title === risk.title && copy.reason.replace(/。$/, '') === risk.summary.replace(/。$/, '')) {
    return risk;
  }
  return {
    ...risk,
    title: copy.title,
    summary: copy.reason,
  };
}
