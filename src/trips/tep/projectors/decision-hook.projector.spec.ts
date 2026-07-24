import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import { matchDecisionHook } from '../registry/decision-hook.registry';
import { projectDecisionHooks } from './decision-hook.projector';

const glacierDay: DailyDrivePlan = {
  date: '2026-08-09',
  dayIndex: 3,
  origin: { ref: 'anchor_a', label: 'Base' },
  destination: { ref: 'anchor_b', label: 'Glacier' },
  legs: [
    {
      legId: 'drive_leg_3_1',
      fromRef: 'item_a',
      toRef: 'item_b',
      baseNavigationMinutes: 90,
      roadRefs: ['segment:trip:F208'],
      importance: 'RECOMMENDED',
      flexibility: 'REMOVABLE',
    },
  ],
  activities: [
    {
      ref: 'activity_glacier_hike',
      importance: 'MANDATORY',
      flexibility: 'FIXED',
      weatherSensitive: true,
      reservationRequired: true,
      durationMinutes: 180,
      bufferMinutes: 30,
      fixedStartAt: '2026-08-09T10:00:00.000Z',
    },
  ],
  accommodation: {
    ref: 'accommodation_day3_hotel',
    latestArrival: '22:00',
  },
  buffers: [],
};

describe('decision-hook.projector', () => {
  it('projects road hooks for legs with roadRefs', () => {
    const hooks = projectDecisionHooks({
      tripId: 'trip_1',
      dailyDrivePlans: [glacierDay],
    });

    const road = hooks.find((h) => h.hookId.startsWith('HOOK-ROAD'));
    expect(road).toMatchObject({
      targetRef: 'drive_leg_3_1',
      triggerType: 'ROAD_STATUS_CHANGE',
      sourceMetric: 'road.status',
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
      evidencePolicy: 'REFRESH_ON_STALE',
    });
    expect(road?.impactScope).toContain('drive_leg_3_1');
    expect(road?.impactScope).toContain('segment:trip:F208');
  });

  it('projects weather hook for weatherSensitive activities', () => {
    const hooks = projectDecisionHooks({
      tripId: 'trip_1',
      dailyDrivePlans: [glacierDay],
    });

    const weather = hooks.find((h) => h.hookId.startsWith('HOOK-WEATHER'));
    expect(weather).toMatchObject({
      targetRef: 'activity_glacier_hike',
      triggerType: 'WEATHER_THRESHOLD',
      sourceMetric: 'weather.windSpeedKmh',
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED',
    });
    expect(weather?.triggerCondition.value).toBe(90);
  });

  it('projects accommodation hook when latestArrival is set', () => {
    const hooks = projectDecisionHooks({
      tripId: 'trip_1',
      dailyDrivePlans: [glacierDay],
    });

    const lodge = hooks.find((h) => h.hookId.startsWith('HOOK-LODGE'));
    expect(lodge?.targetRef).toBe('accommodation_day3_hotel');
    expect(lodge?.triggerType).toBe('EXECUTION_SLIP');
    expect(lodge?.semanticKey).toBe('TIME_WINDOW_INFEASIBLE');
  });

  it('projects reservation hook for fixedStartAt activities', () => {
    const hooks = projectDecisionHooks({
      tripId: 'trip_1',
      dailyDrivePlans: [glacierDay],
    });

    const reserve = hooks.find((h) => h.hookId.startsWith('HOOK-RESERVE'));
    expect(reserve?.targetRef).toBe('activity_glacier_hike');
    expect(reserve?.triggerType).toBe('RESERVATION_DEADLINE');
    expect(reserve?.leadTime).toBe('PT3H');
  });

  it('matches road hook when observation reports CLOSED (IS-CERT-301 prep)', () => {
    const hooks = projectDecisionHooks({
      tripId: 'trip_cert_301',
      dailyDrivePlans: [glacierDay],
    });

    const matched = matchDecisionHook(hooks, { 'road.status': 'CLOSED' });
    expect(matched?.hookId).toMatch(/^HOOK-ROAD/);
    expect(matched?.impactScope).toContain('activity_glacier_hike');
    expect(matched?.impactScope).toContain('accommodation_day3_hotel');
  });

  it('projects daylight hooks for legs and weather-sensitive activities (SDR-202)', () => {
    const hooks = projectDecisionHooks({
      tripId: 'trip_daylight',
      dailyDrivePlans: [glacierDay],
      profile: {
        vehicle: { vehicleType: '4WD', vehicleSource: 'EXPLORATION' },
        drivers: [{ driverId: 'd1', experienceLevel: 'INTERMEDIATE' }],
        drivingPolicy: { nightDrivingAllowed: false, nightDrivingPreference: 'AVOID' },
      },
    });

    const driveHook = hooks.find((h) => h.hookId === 'HOOK-DAYLIGHT-D3-1');
    expect(driveHook).toMatchObject({
      triggerType: 'WEATHER_THRESHOLD',
      semanticKey: 'WEATHER_ROUTE_RISK',
      sourceMetric: 'daylight.driveMinutesAfterCivilDusk',
      defaultPolicy: 'AUTO_SUGGEST_REPAIR',
    });

    const actHook = hooks.find((h) => h.hookId === 'HOOK-DAYLIGHT-ACT-D3-1');
    expect(actHook?.targetRef).toBe('activity_glacier_hike');
    expect(actHook?.sourceMetric).toBe('daylight.activityMinutesAfterSunset');
  });

  it('matches daylight hook when drive exceeds civil dusk (runtime)', () => {
    const hooks = projectDecisionHooks({
      tripId: 'trip_daylight_rt',
      dailyDrivePlans: [glacierDay],
    });

    const matched = matchDecisionHook(hooks, {
      'daylight.driveMinutesAfterCivilDusk': 25,
    });
    expect(matched?.hookId).toBe('HOOK-DAYLIGHT-D3-1');
    expect(matched?.semanticKey).toBe('WEATHER_ROUTE_RISK');
  });
});
