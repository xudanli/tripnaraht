/**
 * Phase 5 — map Decision Dataset metrics → Canary advance verdict.
 * Shadow 阶段可用 wouldNotify 作 shown 代理（用户不可见）。
 */

import {
  evaluateProactiveCanaryAdvance,
  resolveProactiveCanaryConfig,
  type ProactiveCanaryAdvanceVerdict,
  type ProactiveCanaryConfigV1,
} from '../config/proactive-canary-config.util';
import type { ProactiveValidationMetricsV1 } from './compute-proactive-validation-metrics.util';

export type ProactiveValidationCanaryReportV1 = {
  schemaId: 'nara.proactive_validation_canary_report@v1';
  version: 1;
  canaryStage: ProactiveCanaryConfigV1['stage'];
  shownForGate: number;
  shownSource: 'visibleShown' | 'wouldNotifyProxy';
  acceptRate: number | null;
  deferRate: number | null;
  usefulRate: number | null;
  falsePositiveRate: number | null;
  impactPrecisionProxy: number | null;
  advance: ProactiveCanaryAdvanceVerdict;
  notesZh: string[];
};

export function evaluateProactiveValidationCanary(input: {
  metrics: ProactiveValidationMetricsV1;
  config?: ProactiveCanaryConfigV1;
  env?: NodeJS.ProcessEnv;
}): ProactiveValidationCanaryReportV1 {
  const config =
    input.config ?? resolveProactiveCanaryConfig(input.env ?? process.env);
  const m = input.metrics;
  const notesZh: string[] = [...m.notesZh];

  const deferRate =
    m.visibleShown > 0 ? m.deferred / m.visibleShown : null;

  let shownForGate = m.visibleShown;
  let shownSource: 'visibleShown' | 'wouldNotifyProxy' = 'visibleShown';

  if (
    config.stage === 'SHADOW' &&
    m.visibleShown === 0 &&
    m.wouldNotify > 0
  ) {
    shownForGate = m.wouldNotify;
    shownSource = 'wouldNotifyProxy';
    notesZh.push(
      'SHADOW：用 wouldNotify 代理 shown（用户不可见）；晋级 L1 前仍需真实 impression',
    );
  }

  const baseAdvance = evaluateProactiveCanaryAdvance({
    config,
    shown: shownForGate,
    acceptRate: m.acceptRate,
    deferRate,
    usefulRate: m.usefulInterventionRate,
  });

  const reasonsZh = [...baseAdvance.reasonsZh];
  let mayAdvance = baseAdvance.mayAdvance;

  if (config.stage === 'SHADOW' && shownSource === 'wouldNotifyProxy') {
    // Shadow proxy alone must not greenlight L1 without real shown/feedback.
    if (m.visibleShown === 0 || m.usefulInterventionRate == null) {
      mayAdvance = false;
      reasonsZh.push(
        'SHADOW 代理样本不足：需 L1 曝光（impression）+ Useful 反馈后再晋级',
      );
    }
  }

  return {
    schemaId: 'nara.proactive_validation_canary_report@v1',
    version: 1,
    canaryStage: config.stage,
    shownForGate,
    shownSource,
    acceptRate: m.acceptRate,
    deferRate,
    usefulRate: m.usefulInterventionRate,
    falsePositiveRate: m.falsePositiveRate,
    impactPrecisionProxy: m.impactPrecisionProxy,
    advance: { mayAdvance, reasonsZh },
    notesZh,
  };
}
