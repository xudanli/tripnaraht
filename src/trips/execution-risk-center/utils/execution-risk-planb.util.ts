import type {
  PackageHarnessScenario,
  PlanBRuntimeState,
} from '../harness/package-harness.types';

const WIND_TRIGGER_MPS = 25;
const MONITORING_PROXIMITY_THRESHOLD = 0.85;

export function evaluatePlanBFromScenario(scenario: PackageHarnessScenario): PlanBRuntimeState | null {
  const planB = scenario.expected.planB;
  if (!planB) return null;

  const metrics = (scenario.observedMetrics ?? {}) as Record<string, number | string | boolean>;
  const windSpeed = readMetric(metrics, ['windSpeedMs', 'WIND_SUSTAINED_MPS', 'sustainedSpeedMs']);
  const eruptionLevel = String(metrics.volcanicAlertLevel ?? metrics.eruptionPhase ?? '');

  if (windSpeed !== undefined && planB.trigger.toLowerCase().includes('wind')) {
    const proximity = windSpeed / WIND_TRIGGER_MPS;
    if (windSpeed >= WIND_TRIGGER_MPS) {
      return {
        status: 'TRIGGERED',
        proximityPercent: Math.round(proximity * 100),
        autoSwitch: planB.autoSwitch,
        trigger: planB.trigger,
        action: planB.action,
      };
    }
    if (proximity >= MONITORING_PROXIMITY_THRESHOLD) {
      return {
        status: 'MONITORING',
        proximityPercent: Math.round(proximity * 100),
        autoSwitch: planB.autoSwitch,
        trigger: planB.trigger,
        action: planB.action,
      };
    }
    return {
      status: 'IDLE',
      proximityPercent: Math.round(proximity * 100),
      autoSwitch: planB.autoSwitch,
      trigger: planB.trigger,
      action: planB.action,
    };
  }

  const envEvents = scenario.environmentEvents ?? [];
  const volcanicRed = envEvents.some(
    (e) => String(e.eventType) === 'VOLCANIC_ERUPTION' && String(e.colorCode ?? '') === 'RED',
  );
  const officialRed = Object.values(scenario.context?.officialWarnings ?? {}).some(
    (w) => String((w as { level?: string }).level ?? '').includes('EMERGENCY'),
  );

  if (planB.autoSwitch && (volcanicRed || officialRed || planB.trigger.toLowerCase().includes('eruption'))) {
    return {
      status: 'TRIGGERED',
      autoSwitch: true,
      trigger: planB.trigger,
      action: planB.action,
    };
  }

  return {
    status: 'IDLE',
    autoSwitch: planB.autoSwitch,
    trigger: planB.trigger,
    action: planB.action,
  };
}

function readMetric(
  metrics: Record<string, number | string | boolean>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = metrics[key];
    if (value === undefined || value === null || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}
