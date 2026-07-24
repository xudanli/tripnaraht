import type { TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';
import { TRAVEL_CONTEXT_VIEW_NAMES } from '../../../travel-context/domain/travel-context.constants';
import { projectOverviewView } from '../../../travel-context/projections/overview.projection';
import { projectDecisionsView } from '../../../travel-context/projections/decisions.projection';
import {
  extractEffectivePlanVersionFromPlanView,
  extractOpenDecisionCountFromOverview,
} from '../../../travel-context/projections/decisions.projection';
import type { TravelContextHarnessAssertion } from '../../protocol/harness-case.types';
import { harnessAssert } from '../../protocol/run-travel-context-harness.util';

export interface ProjectionConsistencyReport {
  revision: number;
  snapshotId: string;
  overviewOpenCount: number;
  decisionsOpenCount: number;
  snapshotOpenCount: number;
  planEffectiveVersion?: string;
  bindingsEffectiveVersion?: string;
}

export function buildProjectionConsistencyReport(
  snapshot: TravelContextSnapshot,
): ProjectionConsistencyReport {
  const overview = projectOverviewView(snapshot);
  const decisions = projectDecisionsView(snapshot);
  const planView = {
    effectivePlan: snapshot.plan.effectivePlan,
    selectedRouteId: snapshot.plan.selectedRouteId,
  };

  return {
    revision: snapshot.meta.revision,
    snapshotId: snapshot.meta.snapshotId,
    overviewOpenCount: extractOpenDecisionCountFromOverview(overview) ?? -1,
    decisionsOpenCount: (decisions.counts as { total: number }).total,
    snapshotOpenCount: snapshot.decisions.counts.total,
    planEffectiveVersion: extractEffectivePlanVersionFromPlanView(planView),
    bindingsEffectiveVersion: snapshot.meta.bindings.effectivePlanVersionId,
  };
}

/** PROJECTION-CONSISTENCY-001 — same revision, open decision counts align */
export function assertProjectionConsistency001(
  snapshot: TravelContextSnapshot,
): TravelContextHarnessAssertion[] {
  const report = buildProjectionConsistencyReport(snapshot);

  return [
    harnessAssert({
      name: 'overview_open_count_matches_snapshot',
      pass: report.overviewOpenCount === report.snapshotOpenCount,
      expected: report.snapshotOpenCount,
      actual: report.overviewOpenCount,
    }),
    harnessAssert({
      name: 'decisions_view_count_matches_snapshot',
      pass: report.decisionsOpenCount === report.snapshotOpenCount,
      expected: report.snapshotOpenCount,
      actual: report.decisionsOpenCount,
    }),
    harnessAssert({
      name: 'decisions_open_array_length_matches_count',
      pass: snapshot.decisions.open.length === snapshot.decisions.counts.total,
      expected: snapshot.decisions.counts.total,
      actual: snapshot.decisions.open.length,
    }),
  ];
}

/** PROJECTION-CONSISTENCY-002 — plan view vs bindings effective plan version */
export function assertProjectionConsistency002(
  snapshot: TravelContextSnapshot,
): TravelContextHarnessAssertion[] {
  const report = buildProjectionConsistencyReport(snapshot);
  return [
    harnessAssert({
      name: 'plan_version_matches_bindings',
      pass: report.planEffectiveVersion === report.bindingsEffectiveVersion,
      expected: report.bindingsEffectiveVersion,
      actual: report.planEffectiveVersion,
    }),
  ];
}

export function assertAllProjectionsShareRevision(
  envelopes: Array<{ revision: number; view: string }>,
): TravelContextHarnessAssertion[] {
  if (envelopes.length === 0) return [];
  const expected = envelopes[0]!.revision;
  return envelopes.map((e) =>
    harnessAssert({
      name: `revision_aligned_${e.view}`,
      pass: e.revision === expected,
      expected,
      actual: e.revision,
    }),
  );
}

export const PROJECTION_CONSISTENCY_VIEW_NAMES = TRAVEL_CONTEXT_VIEW_NAMES.filter((v) =>
  ['overview', 'plan', 'decisions', 'monitoring'].includes(v),
);
