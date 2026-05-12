import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ArtifactIdentityMaterial } from '../contracts/artifact-identity.types';
import type { ReplayArtifactDescriptor } from '../contracts/replay-artifact-descriptor.types';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { RuntimeExecutionAnomaly } from '../contracts/runtime-execution-profile.validation.types';
import { computeArtifactReplayConfidence } from './artifact-replay-confidence.builder';
import { computeArtifactIdentityHash } from './artifact-identity.hash';

/**
 * Current write path: one cached blob is still the full HTTP-shaped response.
 * Descriptor records eligibility + lineage so future artifact types can share the same envelope.
 *
 * Preconditions: `stampReplayCacheProvenanceOnResponse` / `replayLifecycleManager.stampProvenance` has run.
 */
export function attachFullResponseReplayArtifactDescriptor(
  response: RouteAndRunResponseDto,
  _request?: RouteAndRunRequestDto,
): void {
  const obs = response.observability as {
    replay_cache_provenance?: ReplayProvenance;
    replay_invalidation_decision?: { scope: string; domains?: string[] };
    replay_artifact_descriptor?: ReplayArtifactDescriptor;
    runtime_execution_anomalies?: RuntimeExecutionAnomaly[];
  };
  const prov = obs.replay_cache_provenance;
  if (!prov) return;

  const inv = obs.replay_invalidation_decision;
  let replayEligibility: ReplayArtifactDescriptor['replayEligibility'] = 'FULL';
  if (inv?.scope === 'PARTIAL_COGNITIVE_BRANCH') replayEligibility = 'PARTIAL';
  else if (inv?.scope === 'FULL_RESPONSE') replayEligibility = 'NON_REPLAYABLE';

  const freshness = prov.freshness as Record<string, string> | undefined;
  const freshnessDependencies =
    freshness && typeof freshness === 'object' && !Array.isArray(freshness)
      ? Object.keys(freshness).sort()
      : undefined;

  const domainSet = new Set<string>();
  for (const d of inv?.domains ?? []) domainSet.add(d);
  for (const d of prov.cognitionDomains ?? []) domainSet.add(d);
  const affectedCognitiveDomains = domainSet.size
    ? [...domainSet].sort()
    : undefined;

  const routeLabel =
    prov.executionProfile?.observability?.internal_route_label ??
    (typeof response.route?.route === 'string'
      ? response.route.route
      : String((response.route?.route as unknown) ?? ''));

  const cognitionScope =
    affectedCognitiveDomains?.length === 1
      ? affectedCognitiveDomains[0]
      : affectedCognitiveDomains?.length
        ? affectedCognitiveDomains.join('|')
        : 'FULL_RESPONSE_DEFAULT_SCOPE';

  const material: ArtifactIdentityMaterial = {
    artifactType: 'FULL_RESPONSE',
    plannerVersion: prov.plannerVersion,
    freshnessDependencies,
    cognitionScope,
    semanticInputs: {
      internal_route_label: routeLabel.trim() || null,
      aggregate_world_state_version: prov.aggregateWorldStateVersion ?? null,
      policy_snapshot_version: prov.policySnapshotVersion ?? null,
    },
  };

  const replayConfidence = computeArtifactReplayConfidence({
    replayEligibility,
    provenance: prov,
    runtimeExecutionAnomalies: obs.runtime_execution_anomalies,
  });

  const descriptor: ReplayArtifactDescriptor = {
    artifactType: 'FULL_RESPONSE',
    artifactIdentity: {
      artifactId: computeArtifactIdentityHash(material),
      material,
    },
    replayEligibility,
    replayConfidence,
    provenance: prov,
    ...(freshnessDependencies?.length ? { freshnessDependencies } : {}),
    ...(affectedCognitiveDomains?.length ? { affectedCognitiveDomains } : {}),
  };

  obs.replay_artifact_descriptor = descriptor;
}
