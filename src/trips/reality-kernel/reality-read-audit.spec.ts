import { logRealityBypass } from './reality-read-audit';

describe('logRealityBypass', () => {
  const prevAudit = process.env.REALITY_READ_AUDIT;
  const prevEsc = process.env.REALITY_BYPASS_ESCALATION;

  afterEach(() => {
    process.env.REALITY_READ_AUDIT = prevAudit;
    process.env.REALITY_BYPASS_ESCALATION = prevEsc;
  });

  it('no-ops when audit and boundary are off', () => {
    delete process.env.REALITY_READ_AUDIT;
    delete process.env.REALITY_READ_BOUNDARY;
    delete process.env.REALITY_BYPASS_ESCALATION;
    const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    logRealityBypass(logger as any, 'X', 'detail', 'warn');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs when REALITY_READ_AUDIT=1', () => {
    process.env.REALITY_READ_AUDIT = '1';
    delete process.env.REALITY_BYPASS_ESCALATION;
    const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    logRealityBypass(logger as any, 'Comp', 'detail', 'warn');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[REALITY_BYPASS]'));
  });

});
