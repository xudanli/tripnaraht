import {
  buildJourneyEmotionalContext,
  computeStationaryMinutes,
  syncJourneyPresenceSignals,
} from './journey-emotional-context.util';
import { filterRemindersForProactivityGate } from './proactivity-gate.util';
import type { JourneyState } from '../interfaces/journey-assistant.interface';
import type { Reminder } from '../interfaces/journey-assistant.interface';

const sampleReminder = (priority: Reminder['priority']): Reminder => ({
  id: 'r1',
  type: 'ACTIVITY',
  title: 't',
  titleCN: 't',
  message: 'm',
  messageCN: 'm',
  priority,
  scheduledAt: new Date().toISOString(),
});

describe('proactivity-gate.util', () => {
  const mixed = [
    sampleReminder('low'),
    sampleReminder('medium'),
    sampleReminder('high'),
    sampleReminder('urgent'),
  ];

  it('SILENT 仅保留 urgent', () => {
    expect(filterRemindersForProactivityGate(mixed, 'SILENT')).toHaveLength(1);
    expect(filterRemindersForProactivityGate(mixed, 'SILENT')[0]?.priority).toBe('urgent');
  });

  it('GENTLE 保留 urgent + high', () => {
    const out = filterRemindersForProactivityGate(mixed, 'GENTLE');
    expect(out.map((r) => r.priority).sort()).toEqual(['high', 'urgent']);
  });

  it('ACTIVE 保留 urgent + high + medium', () => {
    const out = filterRemindersForProactivityGate(mixed, 'ACTIVE');
    expect(out).toHaveLength(3);
  });
});

describe('journey-emotional-context.util', () => {
  it('长时间静止触发 SILENT proactivityGate', () => {
    const now = Date.now();
    const state: JourneyState = {
      tripId: 't1',
      userId: 'u1',
      phase: 'ON_TRIP',
      currentDay: 2,
      totalDays: 5,
      currentDate: '2026-06-12',
      todaySchedule: [],
      upcomingReminders: [],
      activeEvents: [],
      pendingDecisions: [],
      stats: { completedActivities: 0, totalActivities: 0, spentBudget: 0, totalBudget: 0 },
      lastUpdated: new Date().toISOString(),
      presenceSignals: {
        lastLocationUpdatedAt: new Date(now - 35 * 60 * 1000).toISOString(),
        lastKnownLocation: { lat: 35.0, lng: 139.7 },
      },
      currentLocation: { lat: 35.0001, lng: 139.7001 },
    };

    const ctx = buildJourneyEmotionalContext(state);
    expect(computeStationaryMinutes(state, now)).toBeGreaterThanOrEqual(35);
    expect(ctx.proactivityGate).toBe('SILENT');
  });

  it('syncJourneyPresenceSignals 更新 message 并重算 emotionalContext', () => {
    const state: JourneyState = {
      tripId: 't1',
      userId: 'u1',
      phase: 'ON_TRIP',
      currentDay: 1,
      totalDays: 3,
      currentDate: '2026-06-12',
      todaySchedule: [],
      upcomingReminders: [],
      activeEvents: [],
      pendingDecisions: [],
      stats: { completedActivities: 0, totalActivities: 0, spentBudget: 0, totalBudget: 0 },
      lastUpdated: new Date().toISOString(),
    };

    const out = syncJourneyPresenceSignals(state, { message: '我迷路了' });
    expect(out.presenceSignals?.lastUserMessage).toBe('我迷路了');
    expect(out.emotionalContext?.anxietyLevel).toBeGreaterThan(0);
    expect(out.emotionalContext?.proactivityGate).toBe('GENTLE');
  });

  it('critical 事件触发 ACTIVE proactivityGate', () => {
    const state: JourneyState = {
      tripId: 't1',
      userId: 'u1',
      phase: 'ON_TRIP',
      currentDay: 1,
      totalDays: 3,
      currentDate: '2026-06-12',
      todaySchedule: [],
      upcomingReminders: [],
      activeEvents: [
        {
          id: 'e1',
          type: 'EMERGENCY',
          title: 'Storm',
          titleCN: '风暴',
          description: 'd',
          descriptionCN: 'd',
          severity: 'critical',
          occurredAt: new Date().toISOString(),
          affectedItems: [],
        },
      ],
      pendingDecisions: [],
      stats: { completedActivities: 0, totalActivities: 0, spentBudget: 0, totalBudget: 0 },
      lastUpdated: new Date().toISOString(),
    };

    const ctx = buildJourneyEmotionalContext(state);
    expect(ctx.recommendedVoiceStance.toneModifier).toBe('professional_authoritative');
    expect(ctx.proactivityGate).toBe('ACTIVE');
  });
});
