import { PaConversationContextService } from './pa-conversation-context.service';
import type { PlanningConversationState } from '../interfaces/planning-assistant.interface';

describe('PaConversationContextService', () => {
  const baseState = (): PlanningConversationState => ({
    sessionId: 'sess-1',
    userId: 'user-a',
    phase: 'INITIAL',
    preferences: {},
    messageHistory: [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });

  it('reads and writes via Redis when available', async () => {
    const store = new Map<string, PlanningConversationState>();
    const redis = {
      get: jest.fn(async (key: string) => store.get(key)),
      set: jest.fn(async (key: string, value: PlanningConversationState) => {
        store.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    } as any;

    const svc = new PaConversationContextService(redis);
    const state = baseState();
    await svc.set(state);

    const loaded = await svc.get('sess-1', 'user-a');
    expect(loaded?.messageHistory).toHaveLength(1);
    expect(redis.set).toHaveBeenCalledWith('pa_conversation:sess-1', expect.any(Object), 86400);
  });

  it('denies cross-user access when userId mismatches', async () => {
    const svc = new PaConversationContextService();
    const state = baseState();
    await svc.set(state);

    const loaded = await svc.get('sess-1', 'other-user');
    expect(loaded).toBeNull();
  });
});
