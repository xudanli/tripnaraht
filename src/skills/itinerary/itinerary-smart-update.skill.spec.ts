import { Test, TestingModule } from '@nestjs/testing';
import { ItinerarySmartUpdateSkill } from './itinerary-smart-update.skill';
import { ItineraryVerifySkill } from './itinerary-verify.skill';
import { RepairApplySkill } from './repair-apply.skill';

describe('ItinerarySmartUpdateSkill', () => {
  it('runs verify → repair when verify returns ERROR issues', async () => {
    const verifyExecute = jest.fn().mockResolvedValue({
      verified: false,
      issues: [
        {
          type: 'FATIGUE_THRESHOLD_EXCEEDED',
          severity: 'ERROR',
          item_id: 'a',
          message: 'overload',
        },
      ],
      summary: { total_issues: 1, error_count: 1, warning_count: 0 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItinerarySmartUpdateSkill,
        RepairApplySkill,
        {
          provide: ItineraryVerifySkill,
          useValue: {
            metadata: { name: 'itinerary.verify' },
            execute: verifyExecute,
          },
        },
      ],
    }).compile();

    const skill = module.get(ItinerarySmartUpdateSkill);
    const baseItinerary = {
      request_id: 'r-smart',
      days: [
        {
          date: '2026-07-01',
          items: [
            { id: 'x', type: 'POI', title: 'A' },
            { id: 'y', type: 'POI', title: 'B' },
          ],
        },
      ],
    } as any;

    const out = await skill.execute({ itinerary: baseItinerary });

    expect(verifyExecute).toHaveBeenCalled();
    expect(out.verified).toBe(false);
    expect(out.adjustments.some((a) => a.action === 'REDUCE_SCOPE_OR_ADD_EVIDENCE')).toBe(true);
    expect(out.repair?.repaired).toBe(true);
    expect(out.telemetry.verify.ok).toBe(true);
    expect(out.telemetry.apply.ok).toBe(true);
    expect(out.telemetry.neptune?.skipped_reason).toBe('missing_world');
    expect(out.itinerary.days[0].items.length).toBeLessThan(2);
  });

  it('merges extra_adjustments and skips repair when no adjustments', async () => {
    const verifyExecute = jest.fn().mockResolvedValue({
      verified: true,
      issues: [],
      summary: { total_issues: 0, error_count: 0, warning_count: 0 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItinerarySmartUpdateSkill,
        RepairApplySkill,
        {
          provide: ItineraryVerifySkill,
          useValue: { metadata: { name: 'itinerary.verify' }, execute: verifyExecute },
        },
      ],
    }).compile();

    const skill = module.get(ItinerarySmartUpdateSkill);
    const itin = {
      request_id: 'r2',
      days: [{ date: '2026-07-02', items: [{ id: 'p1', type: 'POI' }, { id: 'p2', type: 'POI' }] }],
    } as any;

    const out = await skill.execute({
      itinerary: itin,
      extra_adjustments: [{ action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why: 'user asked' }],
    });

    expect(out.adjustments).toHaveLength(1);
    expect(out.repair?.repaired).toBe(true);
  });
});
