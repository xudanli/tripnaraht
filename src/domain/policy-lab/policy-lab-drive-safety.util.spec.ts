import {
  resolveDriveSafetyThresholdMpsFromConfig,
  DEFAULT_DRIVE_SAFETY_PARAMS,
} from './policy-lab-drive-safety.util';
import { PolicyLabConflictMatrixService } from './policy-lab-conflict-matrix.service';

describe('policy-lab-drive-safety.util', () => {
  it('reads high_profile 18 m/s for SUV from DRIVE_SAFETY params', () => {
    const thr = resolveDriveSafetyThresholdMpsFromConfig(
      {
        enabled: true,
        threshold: 18,
        params: DEFAULT_DRIVE_SAFETY_PARAMS,
      },
      'SUV',
    );
    expect(thr).toBe(18);
  });

  it('reads default 20 m/s for sedan', () => {
    const thr = resolveDriveSafetyThresholdMpsFromConfig(
      {
        enabled: true,
        params: DEFAULT_DRIVE_SAFETY_PARAMS,
      },
      'SEDAN',
    );
    expect(thr).toBe(20);
  });

  it('converts legacy kph threshold to mps', () => {
    const thr = resolveDriveSafetyThresholdMpsFromConfig(
      {
        enabled: true,
        threshold: 72,
        params: { unit: 'kph' },
      },
      'SEDAN',
    );
    expect(thr).toBeCloseTo(20, 5);
  });

  it('falls back to code constants when disabled', () => {
    const thr = resolveDriveSafetyThresholdMpsFromConfig(
      { enabled: false, params: { high_profile_mps: 10, default_mps: 10 } },
      'SUV',
    );
    expect(thr).toBe(18);
  });
});

describe('PolicyLabConflictMatrixService.resolveDriveSafetyWindThresholdMps', () => {
  it('loads drive_safety_v1 from DB', async () => {
    const prismaMock = {
      physicalDomainConstraintConfig: {
        findUnique: jest.fn().mockResolvedValue({
          ruleId: 'drive_safety_v1',
          enabled: true,
          threshold: 18,
          params: {
            kind: 'DRIVE_SAFETY',
            unit: 'mps',
            high_profile_mps: 16,
            default_mps: 19,
          },
        }),
      },
    };
    const svc = new PolicyLabConflictMatrixService(prismaMock as any);
    expect(await svc.resolveDriveSafetyWindThresholdMps('CAMPERVAN')).toBe(16);
    expect(await svc.resolveDriveSafetyWindThresholdMps('SEDAN')).toBe(19);
  });
});
