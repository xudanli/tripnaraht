import { AuditRecordService } from './audit-record.service';

describe('AuditRecordService (Narrative / delta)', () => {
  const svc = new AuditRecordService();

  it('POSTPONE_SCHEDULE: uses negotiation_payload time_delta_minutes as authoritative delta_time (e.g. 120)', () => {
    const parent = {
      days: [
        {
          items: [
            { id: 'a', start_time: '2026-06-01T10:00:00.000Z', end_time: '2026-06-01T11:00:00.000Z' },
            { id: 'b', start_time: '2026-06-01T12:00:00.000Z' },
          ],
        },
      ],
    };
    const child = {
      days: [
        {
          items: [
            { id: 'a', start_time: '2026-06-01T12:00:00.000Z', end_time: '2026-06-01T13:00:00.000Z' },
            { id: 'b', start_time: '2026-06-01T14:00:00.000Z' },
          ],
        },
      ],
    };
    const audit = svc.computeRevisionAuditDelta({
      parentSnapshot: parent,
      childSnapshot: child,
      alternativeId: 'POSTPONE_SCHEDULE',
      negotiationPayload: {
        alternatives: [{ id: 'POSTPONE_SCHEDULE', time_delta_minutes: 120, cost_delta_usd: 0 }],
      },
    });
    expect(audit.delta_time_minutes).toBe(120);
    expect(audit.resolution_type).toBe('POSTPONE_SCHEDULE');
    expect(audit.delta_cost_usd).toBe(0);
    expect(audit.interrupted_items.length).toBeGreaterThan(0);
  });

  it('UPGRADE_TO_DRIVE: picks cost from negotiation alternative', () => {
    const audit = svc.computeRevisionAuditDelta({
      parentSnapshot: { days: [{ items: [{ id: 'x', start_time: '2026-06-01T10:00:00.000Z' }] }] },
      childSnapshot: { days: [{ items: [{ id: 'x', start_time: '2026-06-01T10:00:00.000Z' }] }] },
      alternativeId: 'UPGRADE_TO_DRIVE',
      negotiationPayload: {
        alternatives: [{ id: 'UPGRADE_TO_DRIVE', cost_delta_usd: 77, time_delta_minutes: 0 }],
      },
    });
    expect(audit.delta_cost_usd).toBe(77);
    expect(audit.delta_time_minutes).toBeNull();
  });

  it('ROLLBACK: delta_time_minutes is negative when head is later than target', () => {
    const target = { days: [{ items: [{ id: 'a', start_time: '2026-06-01T10:00:00.000Z' }] }] };
    const head = { days: [{ items: [{ id: 'a', start_time: '2026-06-01T12:00:00.000Z' }] }] };
    const audit = svc.computeRollbackAuditDelta(head, target);
    expect(audit.resolution_type).toBe('ROLLBACK');
    expect(audit.delta_time_minutes).toBe(-120);
  });
});
