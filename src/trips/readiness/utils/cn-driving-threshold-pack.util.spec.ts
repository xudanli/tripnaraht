import { resolveCnDrivingThresholdPackCode } from './cn-driving-threshold-pack.util';

describe('cn-driving-threshold-pack.util', () => {
  it('uses CN_XIZANG when classic route includes xizang', () => {
    expect(
      resolveCnDrivingThresholdPackCode({
        destination: 'CN',
        classicRouteId: 'cn.route.g318',
      }),
    ).toBe('CN_XIZANG');
    expect(
      resolveCnDrivingThresholdPackCode({
        destination: 'CN',
        classicRouteId: 'cn.route.g219',
      }),
    ).toBe('CN_XIZANG');
  });

  it('falls back to national CN for non-plateau corridors', () => {
    expect(
      resolveCnDrivingThresholdPackCode({
        destination: 'CN',
        classicRouteId: 'cn.route.qinggan_loop',
      }),
    ).toBe('CN');
    expect(
      resolveCnDrivingThresholdPackCode({
        destination: 'CN',
        classicRouteId: 'cn.route.g211',
      }),
    ).toBe('CN');
  });

  it('passthrough non-CN destinations', () => {
    expect(
      resolveCnDrivingThresholdPackCode({ destination: 'IS', classicRouteId: null }),
    ).toBe('IS');
  });
});
