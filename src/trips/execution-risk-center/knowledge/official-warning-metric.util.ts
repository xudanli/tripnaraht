import type { EnvironmentEventSummary } from '../../in-trip-execution/types/environment-event.types';
import type { RiskMetricBag } from './risk-metric-extraction.util';

const WARNING_LEVEL_BY_SEVERITY: Record<string, string> = {
  red: 'RED',
  yellow: 'YELLOW',
  orange: 'ORANGE',
  green: 'ALL_CLEAR',
};

/**
 * Derive OFFICIAL_WARNING_LEVEL for SeverityRule priority-0 override rules.
 * Environment radar events are treated as authoritative in-trip signals.
 */
export function buildOfficialWarningMetrics(
  event: Pick<EnvironmentEventSummary, 'severity' | 'description' | 'type'>,
): RiskMetricBag {
  const metrics: RiskMetricBag = {};
  const fromSeverity = WARNING_LEVEL_BY_SEVERITY[event.severity];
  if (fromSeverity && fromSeverity !== 'ALL_CLEAR') {
    metrics.OFFICIAL_WARNING_LEVEL = fromSeverity;
    return metrics;
  }

  const text = `${event.type} ${event.description}`.toLowerCase();
  if (/emergency|evacuation|mandatory|红色|red alert/.test(text)) {
    metrics.OFFICIAL_WARNING_LEVEL = 'RED';
  } else if (/warning|警告|橙色|orange/.test(text)) {
    metrics.OFFICIAL_WARNING_LEVEL = 'ORANGE';
  } else if (/advisory|黄色|yellow|caution/.test(text)) {
    metrics.OFFICIAL_WARNING_LEVEL = 'YELLOW';
  }

  return metrics;
}
