/**
 * RFC-002 — registered decision engines (PRIMARY / FALLBACK).
 */

import { Injectable } from '@nestjs/common';
import { isRfc001CanonicalSliceEnabled } from '../../../trips/guardian-decision-core/config/rfc001-iceland.config';
import {
  baseRoadSemanticCapability,
  normalizeRoadSemanticKey,
} from '../../../decision-capabilities/road-unavailable/road-unavailable.semantic';
import { baseWeatherSemanticCapability, normalizeWeatherSemanticKey } from '../../../decision-capabilities/weather-activity-prohibited/weather-activity-prohibited.semantic';
import {
  baseExcessiveDailyLoadCapability,
  normalizeExcessiveDailyLoadSemanticKey,
} from '../../../decision-capabilities/excessive-daily-load/excessive-daily-load.semantic';
import type {
  DecisionEngineRegistration,
  DecisionSemanticKey,
} from '../contracts/decision-gateway.types';

const CANONICAL_CAPABILITIES = [
  'DECISION_WORKSPACE',
  'DECISION_CORE',
  'PLAN_VERSION',
  'L2_AUTHORIZATION',
] as const;

const CANONICAL_SEMANTIC_KEYS: DecisionSemanticKey[] = [
  'ROAD_SEGMENT_UNAVAILABLE',
  'ROAD_SEGMENT_RESTRICTED',
  'WEATHER_ACTIVITY_PROHIBITED',
  'EXCESSIVE_DAILY_LOAD',
];

@Injectable()
export class DecisionEngineRegistryService {
  private readonly registrations: DecisionEngineRegistration[] = [
    {
      engineId: 'CANONICAL_DECISION_RUNTIME',
      version: '1.0.0',
      supportedSemanticKeys: CANONICAL_SEMANTIC_KEYS,
      requiredCapabilities: [...CANONICAL_CAPABILITIES],
      mode: 'PRIMARY',
      priority: 100,
      enabled: isRfc001CanonicalSliceEnabled,
    },
    {
      engineId: 'LEGACY_V15_ADAPTER',
      version: '1.5.0',
      supportedSemanticKeys: ['*'],
      requiredCapabilities: [],
      mode: 'FALLBACK',
      priority: 10,
      enabled: () => true,
    },
  ];

  listRegistrations(): DecisionEngineRegistration[] {
    return [...this.registrations];
  }

  getEngine(engineId: DecisionEngineRegistration['engineId']): DecisionEngineRegistration | undefined {
    return this.registrations.find((r) => r.engineId === engineId);
  }

  listEnabled(): DecisionEngineRegistration[] {
    return this.registrations.filter((r) => r.enabled()).sort((a, b) => b.priority - a.priority);
  }

  supportsSemanticKey(
    registration: DecisionEngineRegistration,
    semanticKey?: string,
  ): boolean {
    const keys = registration.supportedSemanticKeys as readonly string[];
    if (keys.includes('*')) return true;
    if (!semanticKey) return false;
    const normalized = this.normalizeSemanticKey(semanticKey);
    return keys.includes(normalized);
  }

  normalizeSemanticKey(semanticKey: string): DecisionSemanticKey {
    const normalized =
      normalizeRoadSemanticKey(semanticKey) ??
      normalizeWeatherSemanticKey(semanticKey) ??
      normalizeExcessiveDailyLoadSemanticKey(semanticKey) ??
      semanticKey;
    const base =
      baseRoadSemanticCapability(normalized) !== normalized
        ? baseRoadSemanticCapability(normalized)
        : baseWeatherSemanticCapability(normalized) !== normalized
          ? baseWeatherSemanticCapability(normalized)
          : baseExcessiveDailyLoadCapability(normalized);
    if (
      base === 'ROAD_SEGMENT_UNAVAILABLE' ||
      base === 'ROAD_SEGMENT_RESTRICTED' ||
      base === 'WEATHER_ACTIVITY_PROHIBITED' ||
      base === 'EXCESSIVE_DAILY_LOAD'
    ) {
      return base;
    }
    return semanticKey as DecisionSemanticKey;
  }
}
