import type { Itinerary } from '../interfaces/trip-plan.interface';
import { buildSafetySurfacePayload, SAFETY_SURFACE_VERSION } from './safety-surface-payload.util';

describe('safety-surface-payload.util', () => {
  it('sanitizes safetravel alerts and truncates summary', () => {
    const long = 'x'.repeat(900);
    const payload = buildSafetySurfacePayload({
      research_data: {
        safetravel_alerts: [
          { id: 'a1', summary: long, affected_route_segment_refs: ['seg-1', 'seg-2'], severity: 'HIGH' },
        ],
      },
    });
    expect(payload.version).toBe(SAFETY_SURFACE_VERSION);
    expect(payload.safetravel_route_alerts).toHaveLength(1);
    expect(payload.safetravel_route_alerts[0].summary.length).toBeLessThanOrEqual(801);
    expect(payload.safetravel_route_alerts[0].affected_route_segment_refs).toEqual(['seg-1', 'seg-2']);
  });

  it('collects tagged DRIVE/TRANSIT legs with route_segment_ref', () => {
    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-05-01',
          items: [
            {
              id: 'poi-1',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: { name: 'X' },
              evidence_refs: [],
              verified: true,
            },
            {
              id: 'drive-1',
              type: 'DRIVE',
              start_window: '10:00',
              end_window: '11:00',
              location_ref: { name: 'Road' },
              evidence_refs: [],
              verified: true,
              metadata: { route_segment_ref: 'seg-a' },
            },
          ],
        },
      ],
    };
    const payload = buildSafetySurfacePayload({ itinerary });
    expect(payload.tagged_drive_legs).toEqual([
      expect.objectContaining({
        day: '2026-05-01',
        item_id: 'drive-1',
        route_segment_ref: 'seg-a',
        type: 'DRIVE',
      }),
    ]);
  });

  it('extracts verify_issues from last successful itinerary.verify with segment_ref', () => {
    const steps = [
      { skillName: 'itinerary.verify', success: false, result: { issues: [] } },
      {
        skillName: 'itinerary.verify',
        success: true,
        result: {
          issues: [
            {
              type: 'REACHABILITY_ISSUE',
              severity: 'ERROR',
              message: 'blocked',
              violation: { entityRef: { id: 'seg-z' } },
            },
          ],
        },
      },
    ];
    const payload = buildSafetySurfacePayload({ stepsExecuted: steps });
    expect(payload.verify_issues).toEqual([
      expect.objectContaining({ type: 'REACHABILITY_ISSUE', segment_ref: 'seg-z', message: 'blocked' }),
    ]);
  });

  it('falls back to smart_update.verify_issues when standalone verify has no issues', () => {
    const steps = [
      {
        skillName: 'itinerary.verify',
        success: true,
        result: { issues: [] },
      },
      {
        skillName: 'itinerary.smart_update',
        success: true,
        result: {
          verified: false,
          verify_issues: [
            {
              type: 'REACHABILITY_ISSUE',
              severity: 'WARNING',
              message: 'from smart',
              violation: { entityRef: { id: 'seg-smart' } },
            },
          ],
          telemetry: {
            narrative: 'Verify: 0 errors, 1 warnings; reachability: msg one | msg two',
            verify: { ok: true, duration_ms: 1 },
            apply: { ok: true, duration_ms: 1 },
          },
          adjustments: [{ action: 'ADD_BUFFER', why: 'buffer' }],
          repair: { applied_fixes: [{ adjustment_type: 'ADD_BUFFER', description: 'done' }] },
        },
      },
    ];
    const payload = buildSafetySurfacePayload({ stepsExecuted: steps });
    expect(payload.verify_issues).toEqual([
      expect.objectContaining({ segment_ref: 'seg-smart', message: 'from smart' }),
    ]);
    expect(payload.smart_update?.reachability_messages).toEqual(['msg one', 'msg two']);
    expect(payload.smart_update?.adjustments[0]).toMatchObject({ action: 'ADD_BUFFER', why: 'buffer' });
    expect(payload.smart_update?.applied_fixes[0]).toMatchObject({ adjustment_type: 'ADD_BUFFER' });
  });
});
