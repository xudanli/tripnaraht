/**
 * Suppress unrelated knowledge-package derivations from execution alert aggregation.
 */

import type { ActiveRisk } from '../types/execution-risk.types';

const BLOCKED_KNOWLEDGE_CODES = new Set([
  'ENV-VOLC-01',
  'ENV-FIRE-02',
  'ROAD-FLIGHT-01',
]);

const BLOCKED_TEXT =
  /volcan|volcanic ash|airspace closure|roads near volcano|火山灰|空域关闭|火山周边/i;

const WEATHER_PRIMARY_CODES = new Set([
  'WEATHER_STRONG_WIND',
  'WEATHER_HEAVY_RAIN',
  'WEATHER_SEVERE',
  'ROAD_SLIPPERY',
]);

export function isKnowledgePackageNoiseRisk(risk: ActiveRisk): boolean {
  const text = `${risk.title} ${risk.summary}`;
  if (BLOCKED_TEXT.test(text)) return true;
  if (risk.knowledgeCode && BLOCKED_KNOWLEDGE_CODES.has(risk.knowledgeCode)) {
    return true;
  }
  return false;
}

export function isWeatherLikeEnvironmentPrimary(risk: ActiveRisk): boolean {
  if (risk.type !== 'ENVIRONMENT') return false;
  if (WEATHER_PRIMARY_CODES.has(risk.code)) return true;
  const text = `${risk.title} ${risk.summary}`;
  return /暴雨|强降雨|强风|横风|路面湿滑|rain|wind|湿滑/i.test(text);
}

export function isVolcanicEnvironmentPrimary(risk: ActiveRisk): boolean {
  const text = `${risk.title} ${risk.summary}`;
  return /volcan|火山|ash/i.test(text);
}

/** Prefer weather ENV primary over SCHEDULE STOP when filtering alert noise. */
export function resolveExecutionAlertAnchorRisk(risks: ActiveRisk[]): ActiveRisk | undefined {
  const weatherRoots = risks.filter(isWeatherLikeEnvironmentPrimary);
  if (weatherRoots.length > 0) {
    return [...weatherRoots].sort((a, b) => gateWeight(b.executionGate) - gateWeight(a.executionGate))[0];
  }

  const environmentRoots = risks.filter(
    (r) =>
      r.type === 'ENVIRONMENT' &&
      (r.executionGate === 'STOP' || r.executionGate === 'REPLAN_REQUIRED' || r.executionGate === 'AT_RISK'),
  );
  if (environmentRoots.length > 0) {
    return [...environmentRoots].sort((a, b) => gateWeight(b.executionGate) - gateWeight(a.executionGate))[0];
  }

  return risks
    .filter(
      (r) =>
        r.executionGate === 'STOP' ||
        r.executionGate === 'REPLAN_REQUIRED' ||
        r.type === 'ENVIRONMENT',
    )
    .sort((a, b) => gateWeight(b.executionGate) - gateWeight(a.executionGate))[0];
}

/** Knowledge/volcano derivations must not fold under unrelated weather primary impacts. */
export function shouldExcludeRiskFromPrimaryImpacts(
  risk: ActiveRisk,
  primary: ActiveRisk | null | undefined,
): boolean {
  if (!primary || !isKnowledgePackageNoiseRisk(risk)) return false;
  if (risk.causalParentId === primary.id) return false;
  if (isVolcanicEnvironmentPrimary(primary)) return false;
  if (isWeatherLikeEnvironmentPrimary(primary)) return true;
  if (
    primary.type === 'ENVIRONMENT' &&
    risk.generationMode === 'CAUSAL_DERIVATION' &&
    risk.rootEventId &&
    primary.rootEventId &&
    risk.rootEventId !== primary.rootEventId
  ) {
    return true;
  }
  return risk.generationMode === 'CAUSAL_DERIVATION';
}

function isCausalDerivativeUnderWeatherPrimary(risk: ActiveRisk, anchor: ActiveRisk): boolean {
  if (!isWeatherLikeEnvironmentPrimary(anchor)) return false;
  if (risk.id === anchor.id) return false;
  if (risk.generationMode !== 'CAUSAL_DERIVATION') return false;
  if (risk.type === 'SCHEDULE' || risk.code === 'SCHEDULE_DELAY') return true;
  if (risk.type === 'BOOKING_FULFILLMENT' || risk.type === 'MEMBER_STATE') return true;
  if (risk.type === 'ROAD_TRANSPORT' && risk.code === 'GENERIC') return true;
  return false;
}

/** Drop from execution-alerts / adjustment-queue risk inputs when unrelated to weather primary. */
export function shouldSuppressRiskInExecutionAlerts(
  risk: ActiveRisk,
  anchor?: ActiveRisk | null,
): boolean {
  if (!anchor) {
    return isKnowledgePackageNoiseRisk(risk) && risk.generationMode === 'CAUSAL_DERIVATION';
  }
  if (shouldExcludeRiskFromPrimaryImpacts(risk, anchor)) return true;
  if (isCausalDerivativeUnderWeatherPrimary(risk, anchor)) return true;
  if (
    isWeatherLikeEnvironmentPrimary(anchor) &&
    risk.type === 'ENVIRONMENT' &&
    risk.id !== anchor.id &&
    (isKnowledgePackageNoiseRisk(risk) || /恶劣天气预警|severe weather/i.test(`${risk.title} ${risk.summary}`))
  ) {
    return true;
  }
  return false;
}

export function filterKnowledgeNoiseForExecutionAlerts(
  risks: ActiveRisk[],
  primary?: ActiveRisk | null,
): ActiveRisk[] {
  const anchor = primary ?? resolveExecutionAlertAnchorRisk(risks);
  if (!anchor) return risks;
  if (!isWeatherLikeEnvironmentPrimary(anchor) && anchor.type !== 'ENVIRONMENT') {
    return risks;
  }
  return risks.filter((risk) => !shouldSuppressRiskInExecutionAlerts(risk, anchor));
}

function gateWeight(gate: ActiveRisk['executionGate']): number {
  switch (gate) {
    case 'STOP':
      return 4;
    case 'REPLAN_REQUIRED':
      return 3;
    case 'AT_RISK':
      return 2;
    default:
      return 1;
  }
}
