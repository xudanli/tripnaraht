import type { ProactivityGate } from '../../../narrator/types/emotional-context.type';
import type { Reminder } from '../interfaces/journey-assistant.interface';

/** 按 proactivityGate 过滤主动触达候选（push / cron）；SILENT 仅保留 urgent。 */
export function filterRemindersForProactivityGate(
  reminders: readonly Reminder[],
  gate: ProactivityGate | undefined,
): Reminder[] {
  const g = gate ?? 'GENTLE';
  switch (g) {
    case 'SILENT':
      return reminders.filter((r) => r.priority === 'urgent');
    case 'ACTIVE':
      return reminders.filter(
        (r) => r.priority === 'urgent' || r.priority === 'high' || r.priority === 'medium',
      );
    case 'GENTLE':
    default:
      return reminders.filter((r) => r.priority === 'urgent' || r.priority === 'high');
  }
}

export function proactivityGateStatusMessageZh(gate: ProactivityGate | undefined): string | undefined {
  switch (gate) {
    case 'SILENT':
      return '当前处于静默默契模式：非紧急提醒已暂缓，需要时可直接对话唤醒我。';
    case 'ACTIVE':
      return '当前处于主动护航模式：重要行程与安全提醒会优先触达。';
    default:
      return undefined;
  }
}
