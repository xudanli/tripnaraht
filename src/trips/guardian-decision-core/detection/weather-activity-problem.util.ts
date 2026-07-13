/**
 * WEATHER_ACTIVITY_PROHIBITED problem helpers — day index + recovery matching.
 */

import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';

const TERMINAL_STATUSES = new Set(['RESOLVED', 'FAILED']);

export function resolveWeatherActivityDayIndex(
  problem: Pick<Rfc001DecisionProblem, 'semanticCapability' | 'affectedEntityRefs' | 'triggerEventId'>,
): number | undefined {
  if (problem.semanticCapability !== 'WEATHER_ACTIVITY_PROHIBITED') {
    return undefined;
  }

  for (const ref of problem.affectedEntityRefs) {
    const m = String(ref.label ?? ref.id ?? '').match(/day(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }

  const fromEvent = problem.triggerEventId.match(/(?:weather_day_|_d(\d+)_|day[_-](\d+))/i);
  if (fromEvent) {
    const n = fromEvent[1] ?? fromEvent[2];
    if (n) return parseInt(n, 10);
  }

  return undefined;
}

export function isOpenWeatherActivityProblem(problem: Rfc001DecisionProblem): boolean {
  if (problem.semanticCapability !== 'WEATHER_ACTIVITY_PROHIBITED') return false;
  return !TERMINAL_STATUSES.has(problem.status);
}
