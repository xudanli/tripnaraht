// src/trips/decision/__tests__/version.service.spec.ts

/**
 * 版本服务单元测试
 */

import { VersionService } from '../versioning/version.service';

describe('VersionService', () => {
  let service: VersionService;

  beforeEach(() => {
    service = new VersionService();
  });

  it('should return current version', () => {
    const version = service.getCurrentVersion();

    expect(version.plannerVersion).toBeDefined();
    expect(version.policyVersion).toBeDefined();
    expect(version.releasedAt).toBeDefined();
  });

  it('should check feature flag status', () => {
    const enabled = service.isFeatureEnabled('useConstraintChecker');
    expect(typeof enabled).toBe('boolean');
  });

  it('should update feature flag', () => {
    service.setFeatureFlag('testFlag', {
      enabled: true,
      rolloutPercentage: 50,
    });

    const flag = service.getAllFeatureFlags()['testFlag'];
    expect(flag).toBeDefined();
    expect(flag.enabled).toBe(true);
    expect(flag.rolloutPercentage).toBe(50);
  });

  it('should support rollback', () => {
    const currentVersion = service.getCurrentVersion();
    const rollbackVersion = {
      plannerVersion: 'planner-0.0',
      policyVersion: 'policy-v0.9',
      releasedAt: new Date().toISOString(),
    };

    service.rollbackToVersion(rollbackVersion);
    const newVersion = service.getCurrentVersion();

    expect(newVersion.plannerVersion).toBe(rollbackVersion.plannerVersion);
  });

  it('should restore version after rollback', () => {
    const originalVersion = service.getCurrentVersion();
    const rollbackVersion = {
      plannerVersion: 'planner-0.0',
      policyVersion: 'policy-v0.9',
      releasedAt: new Date().toISOString(),
    };

    service.rollbackToVersion(rollbackVersion);
    service.restoreVersion();

    const restoredVersion = service.getCurrentVersion();
    expect(restoredVersion.plannerVersion).toBe(originalVersion.plannerVersion);
  });
});

