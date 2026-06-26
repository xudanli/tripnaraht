import type { EnvironmentSeverity } from '../types/environment-event.types';

export function severityFromStabilityScore(score: number): EnvironmentSeverity {
  if (score >= 0.8) return 'green';
  if (score >= 0.5) return 'yellow';
  return 'red';
}

export function urgencyToSeverity(urgency: number): EnvironmentSeverity {
  if (urgency >= 5) return 'red';
  if (urgency >= 3) return 'yellow';
  return 'green';
}

export function impactSeverityToEnvironment(
  severity: 'LOW' | 'MEDIUM' | 'HIGH',
): EnvironmentSeverity {
  if (severity === 'HIGH') return 'red';
  if (severity === 'MEDIUM') return 'yellow';
  return 'green';
}
