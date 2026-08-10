/**
 * Structural + semantic verify for Initial Plan solver candidates.
 * One optional repair pass. Never writes PlanVersion.
 */

import type { SolverCandidate } from '../../../decision-runtime/solver/contracts/solver-response';
import type { IcelandInitialPlanSolverProblemBundle } from './iceland-initial-plan-solver.adapter';
import { IcelandInitialPlanDayAssignSolver } from './iceland-initial-plan-day-assign.solver';
import type {
  InitialPlanVerification,
  InitialPlanProposalVerifyStatus,
  VerificationSummary,
} from '../types/iceland-initial-plan-proposal.types';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';

const MAX_REPAIR_ATTEMPTS = 1;

export interface VerifySolveInput {
  bundle: IcelandInitialPlanSolverProblemBundle;
  candidate: SolverCandidate;
  arrange: InitialPlanArrangeInput;
  decisions?: Array<{ kind: string; placeId?: number }>;
}

export interface VerifySolveResult {
  verification: InitialPlanVerification;
  /** Candidate after optional repair */
  candidate: SolverCandidate;
  repaired: boolean;
  writesPlanVersion: false;
}

export class IcelandInitialPlanVerifyService {
  constructor(private readonly dayAssign = new IcelandInitialPlanDayAssignSolver()) {}

  verifyAndMaybeRepair(input: VerifySolveInput): VerifySolveResult {
    let candidate = input.candidate;
    let repaired = false;
    let repairAttempts = 0;

    let summary = this.assess(input.bundle, candidate, input.arrange);

    if (summary.status === 'REPAIR_REQUIRED' && repairAttempts < MAX_REPAIR_ATTEMPTS) {
      repairAttempts += 1;
      // Repair: drop BLOCK / problematic nodes from soft selection via re-solve
      // with forbidden nodes already in semantics — re-run day assign
      const repairedSolve = this.dayAssign.solve(input.bundle);
      candidate = repairedSolve.response.candidates[0] ?? candidate;
      repaired = true;
      summary = this.assess(input.bundle, candidate, input.arrange);
      summary.repaired = true;
      summary.repairAttempts = repairAttempts;
    } else {
      summary.repairAttempts = repairAttempts;
    }

    // Still blocked after repair → INFEASIBLE
    if (summary.status === 'REPAIR_REQUIRED') {
      summary = {
        ...summary,
        status: 'INFEASIBLE',
        pass: false,
        blockingCodes: [...summary.blockingCodes, 'REPAIR_EXHAUSTED'],
      };
    }

    const executionBlocked =
      summary.findings.some((f) => f.severity === 'EXECUTION_BLOCK') ||
      summary.status === 'INFEASIBLE';

    return {
      verification: {
        status: summary.status,
        summary,
        executionBlocked,
        writesPlanVersion: false,
      },
      candidate,
      repaired,
      writesPlanVersion: false,
    };
  }

  private assess(
    bundle: IcelandInitialPlanSolverProblemBundle,
    candidate: SolverCandidate,
    arrange: InitialPlanArrangeInput,
  ): VerificationSummary {
    const findings: VerificationSummary['findings'] = [];
    const blockingCodes: string[] = [];
    const warnings: string[] = [];
    const meta = bundle.semantics.nodeMetaById;

    const scheduled = new Set(candidate.dayPlans.flatMap((d) => d.nodeIds));

    // Gate REJECT must not appear
    for (const nodeId of scheduled) {
      const m = meta[nodeId];
      if (!m) continue;
      if (m.isForbidden || m.gateOutcome.status === 'BLOCK') {
        findings.push({
          code: 'GATE_REJECT_IN_PLAN',
          severity: 'BLOCK',
          message: `Gate-blocked node ${nodeId} appeared in solver plan`,
          placeId: m.placeId,
        });
        blockingCodes.push('GATE_REJECT_IN_PLAN');
      }
    }

    // Alias IDs must never appear (heuristic: aliases are excluded at seed; double-check soft evidence)
    for (const nodeId of scheduled) {
      const m = meta[nodeId];
      if (m?.evidence.selectedBecause.includes('alias')) {
        findings.push({
          code: 'ALIAS_IN_PLAN',
          severity: 'BLOCK',
          message: `Alias node ${nodeId} in plan`,
          placeId: m.placeId,
        });
        blockingCodes.push('ALIAS_IN_PLAN');
      }
    }

    // PARENT_CHILD: child alone without parent same day
    for (const pc of bundle.semantics.parentChildHard) {
      for (const day of candidate.dayPlans) {
        const hasChild = day.nodeIds.includes(pc.childNodeId);
        const hasParent = day.nodeIds.includes(pc.parentNodeId);
        if (hasChild && !hasParent) {
          findings.push({
            code: 'PARENT_CHILD_ORPHAN',
            severity: 'BLOCK',
            message: `Child ${pc.childNodeId} without parent on ${day.dayId}`,
            dayIndex: Number(day.dayId.replace('day-', '')),
            itemId: pc.childNodeId,
            placeId: meta[pc.childNodeId]?.placeId,
          });
          blockingCodes.push('PARENT_CHILD_ORPHAN');
        }
      }
    }

    // Day scope: at most one subregion per scoped pack per day
    for (const day of candidate.dayPlans) {
      const byPack = new Map<string, Set<string>>();
      for (const nodeId of day.nodeIds) {
        const m = meta[nodeId];
        if (!m?.packId || !m.subregionId) continue;
        if (!bundle.semantics.dayScopePackIds.includes(m.packId)) continue;
        if (!byPack.has(m.packId)) byPack.set(m.packId, new Set());
        byPack.get(m.packId)!.add(m.subregionId);
      }
      for (const [packId, subs] of byPack) {
        if (subs.size > 1) {
          findings.push({
            code: 'DAY_SCOPE_VIOLATION',
            severity: 'BLOCK',
            message: `Pack ${packId} spans subregions ${[...subs].join(',')} on ${day.dayId}`,
            dayIndex: Number(day.dayId.replace('day-', '')),
          });
          blockingCodes.push('DAY_SCOPE_VIOLATION');
        }
      }

      // Highlands mixed with non-highlands
      const packs = new Set(
        day.nodeIds.map((id) => meta[id]?.packId).filter(Boolean) as string[],
      );
      if (packs.has('highlands') && [...packs].some((p) => p !== 'highlands')) {
        findings.push({
          code: 'HIGHLANDS_MIXED',
          severity: 'BLOCK',
          message: `Highlands mixed with other packs on ${day.dayId}`,
          dayIndex: Number(day.dayId.replace('day-', '')),
        });
        blockingCodes.push('HIGHLANDS_MIXED');
      }
    }

    // Co-visit soft: warn if split (not block)
    for (const cluster of bundle.semantics.coVisitSoft) {
      const daysWith: string[] = [];
      for (const day of candidate.dayPlans) {
        if (cluster.nodeIds.some((id) => day.nodeIds.includes(id))) {
          daysWith.push(day.dayId);
        }
      }
      const uniq = [...new Set(daysWith)];
      if (uniq.length > 1) {
        findings.push({
          code: 'CO_VISIT_SPLIT',
          severity: 'WARN',
          message: `Co-visit ${cluster.groupId} split across ${uniq.join(',')}`,
        });
        warnings.push('CO_VISIT_SPLIT');
      }
    }

    // Experiences → NEED_CONFIRM
    for (const exp of arrange.experienceCandidates) {
      if (exp.status === 'NEEDS_BOOKING_VERIFICATION') {
        findings.push({
          code: 'NEED_CONFIRM_EXPERIENCE',
          severity: 'WARN',
          message: `Experience ${exp.experienceProductId} needs booking verification`,
        });
        warnings.push('NEED_CONFIRM_EXPERIENCE');
      }
    }

    // Catalog unresolved → WARN partial
    if (arrange.unresolvedEntities.length) {
      findings.push({
        code: 'UNRESOLVED_ENTITIES',
        severity: 'WARN',
        message: `${arrange.unresolvedEntities.length} catalog unresolved (partial)`,
      });
      warnings.push('UNRESOLVED_ENTITIES');
    }

    if (arrange.catalogGaps.length) {
      findings.push({
        code: 'REGIONAL_CATALOG_GAP',
        severity: 'WARN',
        message: arrange.catalogGaps.map((g) => g.regionId).join(','),
      });
      warnings.push('REGIONAL_CATALOG_GAP');
    }

    if (scheduled.size === 0) {
      findings.push({
        code: 'EMPTY_PLAN',
        severity: 'BLOCK',
        message: 'No activities scheduled',
      });
      blockingCodes.push('EMPTY_PLAN');
    }

    let status: InitialPlanProposalVerifyStatus;
    if (blockingCodes.length) {
      status = blockingCodes.includes('EMPTY_PLAN') ? 'INFEASIBLE' : 'REPAIR_REQUIRED';
    } else if (warnings.some((w) => w.startsWith('NEED_CONFIRM'))) {
      status = 'VERIFIED_WITH_CONFIRMATIONS';
    } else if (warnings.length) {
      status = 'VERIFIED_WITH_CONFIRMATIONS';
    } else {
      status = 'VERIFIED';
    }

    return {
      status,
      pass: status === 'VERIFIED' || status === 'VERIFIED_WITH_CONFIRMATIONS',
      repaired: false,
      repairAttempts: 0,
      blockingCodes,
      warnings,
      findings,
    };
  }
}
