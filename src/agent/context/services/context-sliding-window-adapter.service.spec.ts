import { Test, TestingModule } from '@nestjs/testing';
import { ContextSlidingWindowAdapter } from './context-sliding-window-adapter.service';
import { CONTEXT_PROFILES } from '../interfaces/context-window-profile.interface';

describe('ContextSlidingWindowAdapter', () => {
  let adapter: ContextSlidingWindowAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContextSlidingWindowAdapter],
    }).compile();

    adapter = module.get<ContextSlidingWindowAdapter>(ContextSlidingWindowAdapter);
  });

  const generateMockMessages = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => `Message ${i + 1}`);

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('should slice strictly according to profile limit (intent_compiler -> 3)', () => {
    const raw = generateMockMessages(10);
    const result = adapter.slice('intent_compiler', raw);
    expect(result).toHaveLength(3);
    expect(result).toEqual(['Message 8', 'Message 9', 'Message 10']);
  });

  it('should slice strictly according to profile limit (orchestrator_claude -> 16)', () => {
    const raw = generateMockMessages(20);
    const result = adapter.slice('orchestrator_claude', raw);
    expect(result).toHaveLength(16);
    expect(result[0]).toBe('Message 5');
  });

  it('should fallback to default limit (10) when profile key is missing at runtime', () => {
    const raw = generateMockMessages(15);
    const result = adapter.slice('non_existent_profile' as never, raw);
    expect(result).toHaveLength(CONTEXT_PROFILES.default.limit);
    expect(result[0]).toBe('Message 6');
  });

  it('should return empty array gracefully when messages is null/undefined/empty', () => {
    expect(adapter.slice('intent_compiler', null)).toEqual([]);
    expect(adapter.slice('intent_compiler', undefined)).toEqual([]);
    expect(adapter.slice('intent_compiler', [])).toEqual([]);
  });

  it('should return original array if total count is less than profile limit', () => {
    const raw = generateMockMessages(2);
    const result = adapter.slice('repair_executor', raw);
    expect(result).toHaveLength(2);
    expect(result).toEqual(['Message 1', 'Message 2']);
  });
});
