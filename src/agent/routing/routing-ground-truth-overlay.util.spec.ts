import { ROUTING_CLASSIFIER_EVAL_FIXTURES } from './routing-classifier-eval-fixtures';
import {
  applyGroundTruthOverlayToSample,
  loadRoutingGroundTruthOverlay,
  summarizeLabeledEval,
} from './routing-ground-truth-overlay.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';
import { ShadowRoutingEvaluatorService } from '../services/shadow-routing-evaluator.service';
import { buildRoutingClassifierEvalExport } from './routing-classifier-eval-export.util';

describe('routing-ground-truth-overlay (P0-4)', () => {
  it('overlay file loads 4 OVER_ROUTING corrections', () => {
    const overlay = loadRoutingGroundTruthOverlay();
    expect(Object.keys(overlay)).toEqual([
      'iceland-trip-planning',
      'itinerary-adjust',
      'e2e-iceland-reykjavik-plan',
      'e2e-itinerary-adjust-pace',
    ]);
  });

  it('labeled export is 8/8 after overlay (shadow challenger aligned)', () => {
    const doc = buildRoutingClassifierEvalExport();
    expect(doc.fixture_count).toBe(8);
    expect(doc.overlay_applied_count).toBe(4);
    expect(doc.shadow_confusion_v0.OVER_ROUTING).toBe(4);
    expect(doc.labeled_vs_shadow_v1.match).toBe(8);
    expect(doc.production_vs_labeled_v1.OVER_ROUTING).toBe(4);
    expect(doc.ok).toBe(true);
  });

  it('applyGroundTruthOverlayToSample overrides auto-gold for itinerary-adjust', () => {
    const fx = ROUTING_CLASSIFIER_EVAL_FIXTURES.find((f) => f.id === 'itinerary-adjust')!;
    const overlay = loadRoutingGroundTruthOverlay();
    const svc = new ShadowRoutingEvaluatorService();
    const signals = signalsFromRequest(fx.request);
    const decision = routePolicy(process.env, fx.request.options, signals);
    const input = { traceId: fx.request.request_id, request: fx.request, signals, decision };
    const shadow = svc.evaluateSync(input);
    const sample = svc.toEvalSample(input, shadow);
    expect(sample.ground_truth.targetRouting).toBe('SYSTEM2_CONSENT');
    applyGroundTruthOverlayToSample(sample, fx.id, overlay);
    expect(sample.ground_truth.targetRouting).toBe('SYSTEM2_REASONING');
    expect(sample.ground_truth.annotatorNotes).toContain('P0-4');
    const summary = summarizeLabeledEval([sample]);
    expect(summary.labeled_vs_shadow.match).toBe(1);
  });
});
