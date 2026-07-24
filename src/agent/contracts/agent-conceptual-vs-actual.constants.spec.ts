import {
  AGENT_CONCEPTUAL_VS_ACTUAL,
  AGENT_NO_GLOBAL_CONTEXT_HASH,
} from './agent-conceptual-vs-actual.constants';

describe('agent-conceptual-vs-actual', () => {
  it('freezes AgentRequest → RouteAndRunRequestDto', () => {
    const row = AGENT_CONCEPTUAL_VS_ACTUAL.find((r) => r.conceptual === 'AgentRequest');
    expect(row?.actual).toBe('RouteAndRunRequestDto');
  });

  it('documents absence of global contextHash', () => {
    const row = AGENT_CONCEPTUAL_VS_ACTUAL.find((r) => r.conceptual === 'contextHash');
    expect(row?.actual).toBe(AGENT_NO_GLOBAL_CONTEXT_HASH);
  });
});
