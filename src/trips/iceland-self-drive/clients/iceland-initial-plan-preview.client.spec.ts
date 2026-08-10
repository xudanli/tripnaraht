import {
  buildConfirmAckPayload,
  formatDayClock,
  previewUiFlags,
} from './iceland-initial-plan-preview.client';
import type { InitialPlanPreviewResponse } from '../types/iceland-trip-shell-preview.types';

describe('IcelandInitialPlanPreviewClient helpers', () => {
  it('formatDayClock pads hours', () => {
    expect(formatDayClock(600)).toBe('10:00');
    expect(formatDayClock(75)).toBe('01:15');
  });

  it('previewUiFlags: Confirm/Apply follow capabilities', () => {
    const base = {
      status: 'VERIFIED',
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          items: [],
          drivingMinutes: 0,
          activityMinutes: 0,
          warnings: [],
        },
      ],
      confirmations: [],
      blockingIssues: [],
      productCopy: { title: '初始行程草案', body: '尚未写入正式行程' },
    };

    const closed = {
      ...base,
      capabilities: { canPreview: true, canConfirm: false, canApply: false },
    } as unknown as InitialPlanPreviewResponse;
    expect(previewUiFlags(closed).showConfirmCta).toBe(false);
    expect(previewUiFlags(closed).showApplyCta).toBe(false);

    const canConfirm = {
      ...base,
      capabilities: { canPreview: true, canConfirm: true, canApply: false },
    } as unknown as InitialPlanPreviewResponse;
    expect(previewUiFlags(canConfirm).showConfirmCta).toBe(true);
    expect(previewUiFlags(canConfirm).showApplyCta).toBe(false);

    const canApply = {
      ...base,
      status: 'CONFIRMED',
      capabilities: { canPreview: true, canConfirm: false, canApply: true },
    } as unknown as InitialPlanPreviewResponse;
    expect(previewUiFlags(canApply).showConfirmCta).toBe(false);
    expect(previewUiFlags(canApply).showApplyCta).toBe(true);
    expect(previewUiFlags(canApply).showConfirmedBadge).toBe(true);
  });

  it('buildConfirmAckPayload only includes blockingApply ids', () => {
    const preview = {
      confirmations: [
        { confirmationId: 'a', blockingApply: true, kind: 'NEED_CONFIRM', message: 'a' },
        { confirmationId: 'b', blockingApply: false, kind: 'GATE_WARN', message: 'b' },
      ],
    } as unknown as InitialPlanPreviewResponse;
    expect(buildConfirmAckPayload(preview).acknowledgedConfirmationIds).toEqual([
      'a',
    ]);
  });
});
