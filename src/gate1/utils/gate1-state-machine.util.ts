import {
  GATE1_PROJECT_TRANSITIONS,
  Gate1ProjectStatus,
} from '../constants/gate1.constants';

export function canTransitionGate1Project(
  from: Gate1ProjectStatus,
  to: Gate1ProjectStatus,
): boolean {
  return GATE1_PROJECT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertGate1Transition(
  from: Gate1ProjectStatus,
  to: Gate1ProjectStatus,
): void {
  if (!canTransitionGate1Project(from, to)) {
    throw new Error(`Invalid Gate1 project transition: ${from} → ${to}`);
  }
}
