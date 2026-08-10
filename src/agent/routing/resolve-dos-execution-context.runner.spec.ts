import { resolveDosExecutionContext } from './resolve-dos-execution-context.runner';

describe('resolve-dos-execution-context.runner', () => {
  it('prefers store over request carrier', () => {
    const fromStore = { tripId: 't-store' } as any;
    const fromReq = { tripId: 't-req' } as any;
    expect(
      resolveDosExecutionContext({ __dosExecutionContext: fromReq } as any, () => fromStore),
    ).toBe(fromStore);
  });

  it('falls back to request carrier', () => {
    const fromReq = { tripId: 't-req' } as any;
    expect(resolveDosExecutionContext({ __dosExecutionContext: fromReq } as any)).toBe(fromReq);
  });
});
