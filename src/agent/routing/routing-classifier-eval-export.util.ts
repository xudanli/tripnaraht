/**
 * P0-4：RoutingClassifierEval 批量导出 + labeled ground_truth 统计。
 */

import { ShadowRoutingEvaluatorService } from '../services/shadow-routing-evaluator.service';
import { routePolicy } from '../utils/orchestration-policy.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { ROUTING_CLASSIFIER_EVAL_FIXTURES } from './routing-classifier-eval-fixtures';
import type { RoutingClassifierEvalSampleV1 } from './routing-classifier-eval.types';
import {
  applyGroundTruthOverlayToSample,
  bumpConfusion,
  loadRoutingGroundTruthOverlay,
  resolveRoutingGroundTruthOverlayPath,
  summarizeLabeledEval,
} from './routing-ground-truth-overlay.util';
import {
  analyzeRoutingTierMismatch,
  projectProductionRoutingTier,
} from './routing-tier-projection.util';

export interface RoutingClassifierEvalExportDoc {
  schemaId: 'tripnara.routing_classifier_eval_export@v1';
  version: 1;
  generated_at: string;
  fixture_count: number;
  ground_truth_overlay_path: string;
  shadow_confusion_v0: Record<string, number>;
  labeled_vs_shadow_v1: Record<string, number>;
  production_vs_labeled_v1: Record<string, number>;
  overlay_applied_count: number;
  ok: boolean;
  samples: RoutingClassifierEvalSampleV1[];
}

export function buildRoutingClassifierEvalExport(): RoutingClassifierEvalExportDoc {
  const overlayPath = resolveRoutingGroundTruthOverlayPath();
  const overlay = loadRoutingGroundTruthOverlay();
  const svc = new ShadowRoutingEvaluatorService();

  const samples: RoutingClassifierEvalSampleV1[] = [];
  const shadowConfusion: Record<string, number> = {
    match: 0,
    OVER_ROUTING: 0,
    UNDER_ROUTING: 0,
  };
  let overlayAppliedCount = 0;

  for (const { id, note, request, source } of ROUTING_CLASSIFIER_EVAL_FIXTURES) {
    const signals = signalsFromRequest(request);
    const decision = routePolicy(process.env, request.options, signals);
    const productionRouting = projectProductionRoutingTier(signals, decision);
    const input = { traceId: request.request_id, request, signals, decision };
    const shadow = svc.evaluateSync(input);
    const sample = svc.toEvalSample(input, shadow, `[${source}:${id}] ${note}`);

    if (applyGroundTruthOverlayToSample(sample, id, overlay)) {
      overlayAppliedCount += 1;
    } else {
      sample.ground_truth.annotatorNotes = `[auto-gold] production tier ${productionRouting}`;
    }

    bumpConfusion(
      shadowConfusion,
      analyzeRoutingTierMismatch(productionRouting, shadow.shadowRouting),
    );
    samples.push(sample);
  }

  const labeled = summarizeLabeledEval(samples);
  const ok =
    labeled.unresolved_labeled_mismatch_ids.length === 0 &&
    labeled.labeled_vs_shadow.match === samples.length;

  return {
    schemaId: 'tripnara.routing_classifier_eval_export@v1',
    version: 1,
    generated_at: new Date().toISOString(),
    fixture_count: samples.length,
    ground_truth_overlay_path: overlayPath,
    shadow_confusion_v0: shadowConfusion,
    labeled_vs_shadow_v1: labeled.labeled_vs_shadow,
    production_vs_labeled_v1: labeled.production_vs_labeled,
    overlay_applied_count: overlayAppliedCount,
    ok,
    samples,
  };
}
