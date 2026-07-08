/**
 * Resolve EvaluationContextVersion from trip row + optional destination pack.
 */

import { loadCountryRoadOntology } from '../../packs/ontology/pack-ontology.loader';
import {
  resolveTripRevision,
  revisionToString,
} from '../../../trips/trip-constraint-solver/utils/trip-revision.util';
import { getConstraintsVersion } from '../../../trips/trip-constraint-solver/utils/constraints-metadata.util';
import type { EvaluationContextVersion } from '../contracts/evaluation-context-version.types';

export function resolveEvaluationContextVersion(input: {
  tripId: string;
  metadata: unknown;
  updatedAt: Date;
  countryCode?: string | null;
}): EvaluationContextVersion {
  const rev = resolveTripRevision({
    metadata: input.metadata,
    updatedAt: input.updatedAt,
  });
  const cc = input.countryCode?.trim().toUpperCase();
  const ontology = cc ? loadCountryRoadOntology(cc) : null;
  const rulePackVersion = ontology
    ? `destination.${cc!.toLowerCase()}@${ontology.version}`
    : 'destination.global@unknown';

  return {
    planVersionId: `plan_${revisionToString(rev)}`,
    policyVersion: getConstraintsVersion(input.metadata),
    worldRevision: `trip_updated_${input.updatedAt.toISOString()}`,
    rulePackVersion,
  };
}
