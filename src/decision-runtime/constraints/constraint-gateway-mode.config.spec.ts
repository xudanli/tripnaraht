import {
  resolveConstraintGatewayMode,
  isConstraintGatewayShadowCompareMode,
  isConstraintGatewayAuthorityMode,
} from './constraint-gateway-mode.config';

describe('constraint-gateway-mode.config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.CONSTRAINT_GATEWAY_MODE;
    delete process.env.CONSTRAINT_EVALUATION_GATEWAY_ENABLED;
  });

  afterAll(() => {
    process.env = env;
  });

  it('defaults to OFF', () => {
    expect(resolveConstraintGatewayMode()).toBe('OFF');
  });

  it('maps legacy CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1 to ON', () => {
    process.env.CONSTRAINT_EVALUATION_GATEWAY_ENABLED = '1';
    expect(resolveConstraintGatewayMode()).toBe('ON');
    expect(isConstraintGatewayAuthorityMode()).toBe(true);
  });

  it('CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE takes precedence over legacy flag', () => {
    process.env.CONSTRAINT_EVALUATION_GATEWAY_ENABLED = '1';
    process.env.CONSTRAINT_GATEWAY_MODE = 'SHADOW_COMPARE';
    expect(resolveConstraintGatewayMode()).toBe('SHADOW_COMPARE');
    expect(isConstraintGatewayShadowCompareMode()).toBe(true);
    expect(isConstraintGatewayAuthorityMode()).toBe(false);
  });

  it('CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED enables dual-run eligibility', () => {
    process.env.CONSTRAINT_GATEWAY_MODE = 'ON_FOR_SELECTED';
    expect(resolveConstraintGatewayMode()).toBe('ON_FOR_SELECTED');
    expect(isConstraintGatewayShadowCompareMode()).toBe(false);
    const { isConstraintGatewayDualRunEligible, isConstraintGatewayOnForSelectedMode } =
      require('./constraint-gateway-mode.config');
    expect(isConstraintGatewayOnForSelectedMode()).toBe(true);
    expect(isConstraintGatewayDualRunEligible()).toBe(true);
    expect(isConstraintGatewayAuthorityMode()).toBe(false);
  });
});
