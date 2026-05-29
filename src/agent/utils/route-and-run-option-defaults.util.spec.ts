import {
  applyTripPlanningStateMachineOptionDefaults,
  shouldExposeSimplifiedExplanationForClient,
} from './route-and-run-option-defaults.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('applyTripPlanningStateMachineOptionDefaults', () => {
  const base = (): RouteAndRunRequestDto =>
    ({
      request_id: 'r1',
      message: '规划冰岛环岛',
    }) as RouteAndRunRequestDto;

  it('enables guardians debate LLM when option omitted', () => {
    const req = base();
    applyTripPlanningStateMachineOptionDefaults(req);
    expect(req.options?.enable_guardians_debate_llm).toBe(true);
  });

  it('does not override explicit false', () => {
    const req = base();
    req.options = { enable_guardians_debate_llm: false };
    applyTripPlanningStateMachineOptionDefaults(req);
    expect(req.options.enable_guardians_debate_llm).toBe(false);
  });

  it('does not override explicit true', () => {
    const req = base();
    req.options = { enable_guardians_debate_llm: true };
    applyTripPlanningStateMachineOptionDefaults(req);
    expect(req.options.enable_guardians_debate_llm).toBe(true);
  });
});

describe('shouldExposeSimplifiedExplanationForClient', () => {
  it('is false unless show_debug_scores is true', () => {
    expect(shouldExposeSimplifiedExplanationForClient(undefined)).toBe(false);
    expect(shouldExposeSimplifiedExplanationForClient({})).toBe(false);
    expect(shouldExposeSimplifiedExplanationForClient({ show_debug_scores: false })).toBe(false);
    expect(shouldExposeSimplifiedExplanationForClient({ show_debug_scores: true })).toBe(true);
  });
});
