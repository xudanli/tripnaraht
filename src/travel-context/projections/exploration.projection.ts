import type { TravelContextSnapshot } from '../domain/travel-context.types';
import { projectOntologyIssuesFromWorldFacts } from '../../travel-ontology/projections/ontology-issues.projection';

export function projectExplorationView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  const archive = snapshot.history.explorationArchive;
  const ontologyIssues =
    snapshot.identity.tripId != null
      ? projectOntologyIssuesFromWorldFacts({
          tripId: snapshot.identity.tripId,
          worldFacts: snapshot.world.facts,
          evidenceVersion: snapshot.meta.bindings.worldStateVersion,
        })
      : [];

  return {
    stage: snapshot.identity.stage,
    scenarioId: snapshot.identity.scenarioId,
    tripId: snapshot.identity.tripId ?? null,
    intent: snapshot.intent,
    candidatesStatus: {
      selectedRouteId: snapshot.plan.selectedRouteId,
      hasDraft: snapshot.plan.draftChanges?.hasDraft ?? false,
      activeCandidateDays: snapshot.plan.draftChanges?.changedDayCount ?? 0,
    },
    planExecutability: snapshot.plan.effectivePlan.executabilityStatus,
    ontologyConstraints: snapshot.world.ontologyConstraints,
    ontologyIssueCount: ontologyIssues.length,
    ontologyBlockerCount: ontologyIssues.filter((i) => i.severity === 'BLOCK').length,
    explorationArchive: archive
      ? {
          rejectedRouteIds: archive.rejectedRouteIds ?? [],
          selectedRouteId: archive.selectedRouteId,
          researchProtocolId: archive.researchProtocolId,
          materializedAt: archive.materializedAt,
          principles: archive.principles,
        }
      : undefined,
    revision: snapshot.meta.revision,
  };
}
