import { ConflictSeverity, ConflictType } from '../../../trips/dto/trip-conflicts.dto';
import { conflictToGatewayAssertion } from './conflict-to-assertion.adapter';

describe('conflict-to-assertion.adapter', () => {
  it('CAS-011: maps daily_drive conflict to gateway assertion with schedule engine', () => {
    const assertion = conflictToGatewayAssertion(
      {
        id: 'daily-drive-day-2',
        type: ConflictType.MAX_DAILY_DRIVE_EXCEEDED,
        severity: ConflictSeverity.HIGH,
        title: '每日驾驶上限',
        description: 'Day 2 连续驾驶时长 9 小时，超过每日上限 8 小时。',
        affectedDays: ['2'],
        affectedItemIds: ['item-1'],
        issueKind: 'daily_drive',
        fromDayNumber: 2,
        toDayNumber: 2,
        travelMinutes: 540,
        shortfallMinutes: 60,
      },
      'trip-1',
    );
    expect(assertion.assertionId).toBe('feas_issue-daily-drive-day-2');
    expect(assertion.status).toBe('BLOCK');
    expect(assertion.evaluator.engine).toBe('trip-schedule-conflicts');
    expect(assertion.evaluator.ruleId).toBe('daily_drive');
    expect(assertion.scope.dayId).toBe('day-2');
  });
});
