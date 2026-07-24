import { ShadowRoutingEvaluatorService } from './shadow-routing-evaluator.service';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';

describe('ShadowRoutingEvaluatorService', () => {
  const prevEnv = process.env.ROUTING_SHADOW_EVAL;

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.ROUTING_SHADOW_EVAL;
    } else {
      process.env.ROUTING_SHADOW_EVAL = prevEnv;
    }
  });

  it('is enabled by default', () => {
    delete process.env.ROUTING_SHADOW_EVAL;
    expect(new ShadowRoutingEvaluatorService().isEnabled()).toBe(true);
  });

  it('evaluateSync never throws and returns schema envelope', () => {
    process.env.ROUTING_SHADOW_EVAL = '1';
    const svc = new ShadowRoutingEvaluatorService();
    const request = {
      request_id: 'trace-shadow-1',
      user_id: 'u1',
      trip_id: 'trip-1',
      message: '调整第三天节奏轻松一点',
    } as any;
    const signals = signalsFromRequest(request);
    const decision = routePolicy(process.env, request.options, signals);
    const out = svc.evaluateSync({ traceId: request.request_id, request, signals, decision });
    expect(out.schemaId).toBe('tripnara.shadow_routing_eval@v1');
    expect(out.productionRouting).toBeDefined();
    expect(out.shadowRouting).toBeDefined();
    expect(typeof out.isMatch).toBe('boolean');
  });

  it('toEvalSample wraps shadow output for offline corpus', () => {
    const svc = new ShadowRoutingEvaluatorService();
    const request = {
      request_id: 'trace-eval-1',
      user_id: 'u1',
      message: '推荐新宿拉面',
    } as any;
    const signals = signalsFromRequest(request);
    const decision = routePolicy(process.env, request.options, signals);
    const input = { traceId: request.request_id, request, signals, decision };
    const shadow = svc.evaluateSync(input);
    const sample = svc.toEvalSample(input, shadow, 'e2e fixture');
    expect(sample.schemaId).toBe('tripnara.routing_classifier_eval@v1');
    expect(sample.ground_truth.targetRouting).toBe(shadow.productionRouting);
    expect(sample.shadow_output?.shadowRouting).toBe(shadow.shadowRouting);
  });
});
