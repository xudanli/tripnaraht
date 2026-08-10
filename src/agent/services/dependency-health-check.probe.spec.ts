import { LlmService } from '../../llm/services/llm.service';

describe('dependency health probes', () => {
  it('LlmService.healthProbe fails when circuit is open', async () => {
    const llm = Object.create(LlmService.prototype) as LlmService & {
      circuitBreaker: { isOpen: () => boolean };
      getDefaultProvider: () => string;
    };
    llm.circuitBreaker = { isOpen: () => true };
    llm.getDefaultProvider = () => 'openai';
    const out = await llm.healthProbe();
    expect(out.healthy).toBe(false);
    expect(out.error).toBe('circuit_open');
  });

  it('LlmService.healthProbe succeeds when provider present and circuit closed', async () => {
    const llm = Object.create(LlmService.prototype) as LlmService & {
      circuitBreaker: { isOpen: () => boolean };
      getDefaultProvider: () => string;
    };
    llm.circuitBreaker = { isOpen: () => false };
    llm.getDefaultProvider = () => 'openai';
    const out = await llm.healthProbe();
    expect(out.healthy).toBe(true);
  });
});
