/**
 * Pressure → 提案语义（非 physics 直通 repair）。
 */

import type { LegTemporalSafetyAssessment } from '../temporal/leg-temporal-safety.types';
import type { OvernightRestructuringPressure } from './overnight-restructuring.types';
import type { OpportunityMigrationEvaluation } from '../opportunity/opportunity-migration.types';
import type {
  OvernightPressureSeverityInProposal,
  OvernightProposedAction,
  OvernightRestructuringProposal,
} from './overnight-restructuring-proposal.types';
import { restructuringPressureApproved } from './overnight-restructuring-gates';

export interface CollectOvernightProposalsInput {
  overnightRestructuringPressures?: OvernightRestructuringPressure[] | null;
  legTemporalSafetyAssessments?: LegTemporalSafetyAssessment[] | null;
  opportunityMigrationEvaluations?: OpportunityMigrationEvaluation[] | null;
  /**
   * When true, routing uses only {@link OvernightRestructuringPressure} (e.g. `deriveOvernightFromOverlay`).
   * Leg temporal assessments are ignored — single truth with `ExecutionOverlayFrame[]`.
   */
  overlaySurfaceOnly?: boolean;
}

function severityForProposal(
  p: OvernightRestructuringPressure,
): OvernightPressureSeverityInProposal {
  if (restructuringPressureApproved(p)) {
    return 'HIGH';
  }
  if (
    p.restructuringRecommended &&
    (p.daylightCollapseSeverity === 'HIGH' || p.unsafeLegIds.length >= 2)
  ) {
    return 'HIGH';
  }
  if (p.restructuringRecommended) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function migrationEconomicsApprovedForDate(
  date: string,
  evaluations: OpportunityMigrationEvaluation[] | undefined,
): boolean | undefined {
  const ev = evaluations?.find(e => e.date === date && e.recommendation === 'MIGRATE');
  return ev ? true : undefined;
}

function assessmentsForDate(
  date: string,
  all: LegTemporalSafetyAssessment[] | undefined,
): LegTemporalSafetyAssessment[] {
  return (all ?? []).filter(a => a.date === date);
}

function chooseProposedAction(
  p: OvernightRestructuringPressure,
  legsOnDate: LegTemporalSafetyAssessment[],
): OvernightProposedAction {
  if (!p.restructuringRecommended) {
    return 'KEEP_CURRENT';
  }

  const unsafes = legsOnDate.filter(l => l.severity === 'UNSAFE');
  const marginals = legsOnDate.filter(l => l.severity === 'MARGINAL');

  if (p.crossDaySpillMinutes >= 35) {
    return 'RELOCATE_OVERNIGHT';
  }

  if (p.daylightCollapseSeverity === 'HIGH' && p.crossDaySpillMinutes < 35) {
    return 'COMPRESS_DAY';
  }

  if (unsafes.length === 0 && marginals.length > 0 && p.downstreamShiftMinutes < 25) {
    return 'KEEP_CURRENT';
  }

  if (
    unsafes.length === 0 &&
    marginals.length > 0 &&
    p.downstreamShiftMinutes >= 25
  ) {
    return 'SHIFT_TIMELINE';
  }

  const tightLate = unsafes.filter(u => {
    const m = u.daylightMarginMinutes;
    return m !== undefined && m > -35 && m < 0;
  });
  if (tightLate.length > 0 && p.crossDaySpillMinutes < 25) {
    return 'SHIFT_TIMELINE';
  }

  if (p.downstreamShiftMinutes >= 35) {
    return 'SHIFT_TIMELINE';
  }

  if (!restructuringPressureApproved(p)) {
    return 'KEEP_CURRENT';
  }

  return 'RELOCATE_OVERNIGHT';
}

/**
 * Pressure-only routing when overnight pressures already come from `ExecutionOverlayFrame` (no leg-assessment dual truth).
 */
function chooseProposedActionOverlayOnly(
  p: OvernightRestructuringPressure,
): OvernightProposedAction {
  if (!p.restructuringRecommended) {
    return 'KEEP_CURRENT';
  }

  if (p.crossDaySpillMinutes >= 35) {
    return 'RELOCATE_OVERNIGHT';
  }

  if (p.daylightCollapseSeverity === 'HIGH' && p.crossDaySpillMinutes < 35) {
    return 'COMPRESS_DAY';
  }

  if (p.downstreamShiftMinutes >= 35) {
    return 'SHIFT_TIMELINE';
  }

  if (!restructuringPressureApproved(p)) {
    return 'KEEP_CURRENT';
  }

  return 'RELOCATE_OVERNIGHT';
}

function buildRationale(
  p: OvernightRestructuringPressure,
  legsOnDate: LegTemporalSafetyAssessment[],
  action: OvernightProposedAction,
  overlaySurfaceOnly?: boolean,
): string[] {
  const r: string[] = [];
  if (overlaySurfaceOnly) {
    r.push('routing: overlay-derived overnight pressure only (no leg temporal assessment branch)');
  }
  r.push(
    `pressure: SEQUENCE+${p.downstreamShiftMinutes}min crossDay+${p.crossDaySpillMinutes}min opWinViol=${p.operationalWindowViolations} collapse=${p.daylightCollapseSeverity}`,
  );
  if (p.unsafeLegIds.length) {
    r.push(`UNSAFE legs: ${p.unsafeLegIds.join(', ')}`);
  }
  const marg = legsOnDate.filter(l => l.severity === 'MARGINAL');
  if (marg.length) {
    r.push(`MARGINAL legs: ${marg.map(x => x.legId).join(', ')}`);
  }
  r.push(`candidate action: ${action} (proposal only, no auto-apply)`);
  return r;
}

function isTrivialPressure(p: OvernightRestructuringPressure): boolean {
  return (
    !p.restructuringRecommended &&
    p.unsafeLegIds.length === 0 &&
    p.downstreamShiftMinutes + p.crossDaySpillMinutes < 15 &&
    p.operationalWindowViolations === 0 &&
    p.daylightCollapseSeverity === 'LOW'
  );
}

export function collectOvernightRestructuringProposals(
  input: CollectOvernightProposalsInput,
): OvernightRestructuringProposal[] {
  const pressures = input.overnightRestructuringPressures ?? [];
  const out: OvernightRestructuringProposal[] = [];
  const overlaySurfaceOnly = Boolean(input.overlaySurfaceOnly);

  for (const p of pressures) {
    if (isTrivialPressure(p)) {
      continue;
    }
    const legsOnDate = overlaySurfaceOnly
      ? []
      : assessmentsForDate(p.date, input.legTemporalSafetyAssessments ?? undefined);
    const action = overlaySurfaceOnly
      ? chooseProposedActionOverlayOnly(p)
      : chooseProposedAction(p, legsOnDate);
    const approved = restructuringPressureApproved(p);
    const mig = migrationEconomicsApprovedForDate(
      p.date,
      input.opportunityMigrationEvaluations ?? undefined,
    );

    out.push({
      date: p.date,
      pressureSeverity: severityForProposal(p),
      unsafeLegIds: [...p.unsafeLegIds],
      rationale: buildRationale(p, legsOnDate, action, overlaySurfaceOnly),
      proposedAction: action,
      restructuringPressureApproved: approved,
      ...(mig === true ? { migrationEconomicsApproved: true } : {}),
    });
  }

  return out;
}
