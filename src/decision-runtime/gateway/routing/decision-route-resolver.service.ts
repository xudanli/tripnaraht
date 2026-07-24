/**
 * RFC-002 — resolve PRIMARY / FALLBACK / UNSUPPORTED for a decision problem.
 */

import { Injectable } from '@nestjs/common';
import { DecisionEngineRegistryService } from '../registry/decision-engine-registry.service';
import type {
  DecisionRouteRequest,
  DecisionRouteResult,
} from '../contracts/decision-gateway.types';

@Injectable()
export class DecisionRouteResolverService {
  constructor(private readonly registry: DecisionEngineRegistryService) {}

  resolve(input: DecisionRouteRequest): DecisionRouteResult {
    const now = new Date().toISOString();
    const semanticKey = input.semanticKey
      ? this.registry.normalizeSemanticKey(input.semanticKey)
      : undefined;

    const canonical = this.registry.getEngine('CANONICAL_DECISION_RUNTIME');
    const legacy = this.registry.getEngine('LEGACY_V15_ADAPTER');

    if (input.hasExistingDecisionRecord && input.hasCanonicalProblem) {
      if (!canonical?.enabled()) {
        return this.result('CANONICAL_DECISION_RUNTIME', 'ENGINE_UNAVAILABLE', 'Canonical record exists but engine disabled', canonical?.version ?? '0', now);
      }
      return this.result('CANONICAL_DECISION_RUNTIME', 'PRIMARY', 'Existing canonical decision record', canonical.version, now);
    }

    const canonicalEligible =
      Boolean(canonical?.enabled()) &&
      (Boolean(input.hasCanonicalProblem) ||
        (semanticKey != null &&
          canonical != null &&
          this.registry.supportsSemanticKey(canonical, semanticKey)));

    if (canonicalEligible && canonical) {
      return this.result(
        'CANONICAL_DECISION_RUNTIME',
        'PRIMARY',
        input.hasCanonicalProblem
          ? 'RFC-001 problem in trip metadata'
          : 'Semantic key + destination match canonical engine',
        canonical.version,
        now,
      );
    }

    if (legacy?.enabled()) {
      return this.result(
        'LEGACY_V15_ADAPTER',
        'LEGACY_FALLBACK',
        canonicalEligible === false && !canonical?.enabled()
          ? 'Canonical engine disabled'
          : 'No canonical match; using legacy adapter',
        legacy.version,
        now,
      );
    }

    return this.result(
      'LEGACY_V15_ADAPTER',
      'UNSUPPORTED',
      'No enabled decision engine',
      legacy?.version ?? '0',
      now,
    );
  }

  private result(
    engineId: DecisionRouteResult['engineId'],
    resolution: DecisionRouteResult['resolution'],
    reason: string,
    version: string,
    recordedAt: string,
  ): DecisionRouteResult {
    return { engineId, resolution, reason, registrationVersion: version, recordedAt };
  }
}
