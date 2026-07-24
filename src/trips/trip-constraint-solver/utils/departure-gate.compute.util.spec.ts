import {
  computeDepartureGateStatus,
  isPlanBlocked,
  resolvePreparationStatus,
  computeCanStartExecution,
} from './departure-gate.compute.util';

describe('departure-gate.compute.util', () => {
  describe('computeDepartureGateStatus', () => {
    it('prioritizes revalidation', () => {
      expect(
        computeDepartureGateStatus({
          revalidationRequired: true,
          planBlocked: true,
          preparationBlocked: true,
        }),
      ).toBe('REVALIDATION_REQUIRED');
    });

    it('returns BLOCKED_BY_BOTH when both blocked', () => {
      expect(
        computeDepartureGateStatus({
          revalidationRequired: false,
          planBlocked: true,
          preparationBlocked: true,
        }),
      ).toBe('BLOCKED_BY_BOTH');
    });

    it('returns READY when clear', () => {
      expect(
        computeDepartureGateStatus({
          revalidationRequired: false,
          planBlocked: false,
          preparationBlocked: false,
        }),
      ).toBe('READY');
    });
  });

  describe('isPlanBlocked', () => {
    it('blocks when stale or unvalidated', () => {
      expect(
        isPlanBlocked({
          hasValidation: false,
          isStale: false,
          verdictStatus: 'EXECUTABLE',
          mustHandleCount: 0,
          gateExecuteBlocked: false,
        }),
      ).toBe(true);
      expect(
        isPlanBlocked({
          hasValidation: true,
          isStale: true,
          verdictStatus: 'EXECUTABLE',
          mustHandleCount: 0,
          gateExecuteBlocked: false,
        }),
      ).toBe(true);
    });

    it('blocks on must_handle or NOT_EXECUTABLE', () => {
      expect(
        isPlanBlocked({
          hasValidation: true,
          isStale: false,
          verdictStatus: 'EXECUTABLE',
          mustHandleCount: 1,
          gateExecuteBlocked: false,
        }),
      ).toBe(true);
    });
  });

  describe('resolvePreparationStatus', () => {
    it('BLOCKED when open blockers', () => {
      expect(
        resolvePreparationStatus({
          openBlockerCount: 1,
          totalTrackedItemCount: 5,
          completedItemCount: 2,
        }),
      ).toBe('BLOCKED');
    });
  });

  describe('computeCanStartExecution', () => {
    it('only READY allows departure', () => {
      expect(computeCanStartExecution('READY')).toBe(true);
      expect(computeCanStartExecution('BLOCKED_BY_PLAN')).toBe(false);
    });
  });
});
