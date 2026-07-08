/**
 * Resolves which decision API surface handles each problem — registry-driven, not frontend hardcoding.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { isAnyCanonicalSemanticCapabilityEnabled } from '../config/rfc002-canonical.config';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import type {
  DecisionEngineCapability,
  DecisionEngineId,
  ProblemDecisionRoute,
  TripDecisionRoutingView,
} from './decision-engine-routing.types';
import { CANONICAL_DECISION_ENGINE_ID } from './decision-engine-routing.types';
import {
  ROAD_SEGMENT_UNAVAILABLE,
  ROAD_SEGMENT_RESTRICTED,
} from '../../../decision-capabilities/road-unavailable/road-unavailable.semantic';
import {
  WEATHER_ACTIVITY_PROHIBITED,
} from '../../../decision-capabilities/weather-activity-prohibited/weather-activity-prohibited.semantic';
import { EXCESSIVE_DAILY_LOAD } from '../../../decision-capabilities/excessive-daily-load/excessive-daily-load.semantic';
import { resolveRfc001ProblemSemanticKey } from '../../../decision-capabilities/problem-semantic';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import {
  countryHasActiveDestinationPack,
  resolveTripDestinationCountry,
} from '../../../decision-runtime/packs/loader/country-pack-registry.util';

const RFC001_SEMANTIC_PREFIX = 'rfc001:';

const CANONICAL_SEMANTIC_PREFIXES = [
  `${ROAD_SEGMENT_UNAVAILABLE}:`,
  `${ROAD_SEGMENT_RESTRICTED}:`,
  `${WEATHER_ACTIVITY_PROHIBITED}:`,
  `${EXCESSIVE_DAILY_LOAD}:`,
  RFC001_SEMANTIC_PREFIX,
];

function isCanonicalSemanticKey(semanticKey?: string): boolean {
  if (!semanticKey) return false;
  return CANONICAL_SEMANTIC_PREFIXES.some((p) => semanticKey.startsWith(p));
}

function canonicalApis(tripId: string): DecisionEngineCapability['apis'] {
  if (isDecisionGatewayUnifiedEnabled()) {
    const base = `/trips/${tripId}`;
    return {
      decisionCenter: `${base}/decision-center`,
      decisionCenterProblem: `${base}/decision-problems/{problemId}`,
      authorize: `${base}/decisions/{decisionId}/authorize`,
      execute: `${base}/decisions/{decisionId}/execute`,
      rollback: `${base}/decisions/{decisionId}/rollback`,
    };
  }
  const internal = `/internal/rfc001/iceland/trips/${tripId}`;
  return {
    decisionCenter: `${internal}/decision-center`,
    decisionCenterProblem: `${internal}/decision-center/problems/{problemId}`,
    authorize: `${internal}/decisions/{decisionId}/authorize`,
    execute: `${internal}/decisions/{decisionId}/execute`,
    rollback: `${internal}/decisions/{decisionId}/rollback`,
    authorizePublic: `/api/rfc001/decisions/{decisionId}/authorize`,
    executePublic: `/api/rfc001/decisions/{decisionId}/execute`,
    rollbackPublic: `/api/rfc001/decisions/{decisionId}/rollback`,
  };
}

function legacyApis(tripId: string): DecisionEngineCapability['apis'] {
  const base = `/trips/${tripId}`;
  return {
    decisionCenter: `${base}/decision-center/overview`,
    decisionCenterProblem: `${base}/decision-problems/{problemId}`,
    authorize: `${base}/decisions`,
    execute: `${base}/decisions/{decisionId}/execution-status`,
  };
}

@Injectable()
export class Rfc001DecisionEngineRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
  ) {}

  async getTripRouting(tripId: string): Promise<TripDecisionRoutingView> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });

    const destination = trip?.destination ?? undefined;
    const canonicalProblems = await this.problemStore.list(tripId);
    const canonicalEnabled = this.isCanonicalEngineActive(
      destination,
      canonicalProblems.length,
    );

    const canonicalProblemIds = canonicalProblems.map((p) => p.problemId);

    const engines: DecisionEngineCapability[] = [];

    if (canonicalEnabled) {
      const country = resolveTripDestinationCountry(destination);
      engines.push({
        engineId: CANONICAL_DECISION_ENGINE_ID,
        enabled: true,
        label: 'Canonical Decision Runtime (RFC-002)',
        match: {
          semanticKeyPrefix: ROAD_SEGMENT_UNAVAILABLE,
          rfc001ProblemIds: canonicalProblemIds,
          destinationCountries: country ? [country] : undefined,
        },
        apis: canonicalApis(tripId),
      });
    }

    engines.push({
      engineId: 'LEGACY_V15',
      enabled: true,
      label: 'Decision Semantics V1.5 (feasibility / gate / legacy repair)',
      match: {},
      apis: legacyApis(tripId),
    });

    const problemRoutes: ProblemDecisionRoute[] = canonicalProblems.map((p) => ({
      problemId: p.problemId,
      engineId: CANONICAL_DECISION_ENGINE_ID,
      semanticKey: resolveRfc001ProblemSemanticKey(p),
    }));

    return {
      schemaId: 'tripnara.decision_engine_routing@v1',
      tripId,
      destination,
      generatedAt: new Date().toISOString(),
      engines,
      problemRoutes,
      defaultEngine: 'LEGACY_V15',
    };
  }

  resolveEngineForProblem(
    routing: TripDecisionRoutingView,
    problemId: string,
    semanticKey?: string,
  ): DecisionEngineId {
    const explicit = routing.problemRoutes.find((r) => r.problemId === problemId);
    if (explicit) return explicit.engineId;

    if (
      isCanonicalSemanticKey(semanticKey) &&
      routing.engines.some(
        (e) => e.engineId === CANONICAL_DECISION_ENGINE_ID && e.enabled,
      )
    ) {
      return CANONICAL_DECISION_ENGINE_ID;
    }

    return routing.defaultEngine;
  }

  private isCanonicalEngineActive(
    destination: string | null | undefined,
    canonicalProblemCount: number,
  ): boolean {
    if (!isAnyCanonicalSemanticCapabilityEnabled()) {
      return false;
    }
    if (canonicalProblemCount > 0) return true;
    const country = resolveTripDestinationCountry(destination);
    if (!country) return false;
    return countryHasActiveDestinationPack(country);
  }
}
