import {
  resolveStagingShadowOptionsForRequest,
} from './resolve-staging-shadow-options.util';

describe('resolveStagingShadowOptionsForRequest', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('returns undefined when body is empty', () => {
    expect(resolveStagingShadowOptionsForRequest(undefined)).toBeUndefined();
    expect(resolveStagingShadowOptionsForRequest(null)).toBeUndefined();
  });

  it('passes through when DECISION_LAB_ENABLED=1', () => {
    process.env.DECISION_LAB_ENABLED = '1';
    process.env.DECISION_RUNTIME_MODE = 'LEGACY';
    const opts = { inputMismatch: true };
    expect(resolveStagingShadowOptionsForRequest(opts)).toEqual(opts);
  });

  it('passes through in SHADOW mode without lab flag', () => {
    delete process.env.DECISION_LAB_ENABLED;
    process.env.DECISION_RUNTIME_MODE = 'SHADOW';
    const opts = { inputMismatch: true };
    expect(resolveStagingShadowOptionsForRequest(opts)).toEqual(opts);
  });

  it('blocks in LEGACY mode without lab flag', () => {
    delete process.env.DECISION_LAB_ENABLED;
    process.env.DECISION_RUNTIME_MODE = 'LEGACY';
    expect(
      resolveStagingShadowOptionsForRequest({ inputMismatch: true }),
    ).toBeUndefined();
  });
});
