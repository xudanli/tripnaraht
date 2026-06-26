/**
 * Decision OS / Physical Validator → PRD VerificationResult 桥接
 */

import type { VerificationReport, VerificationIssue } from '../../../decision/kernel/decision-state.types';
import type { PhysicalEvaluationResult, PhysicalViolationItem } from '../../../domain/ontology/validator/physical-validator.types';
import type {
  VerificationResult,
  VerificationScope,
  VerificationStatus,
  Violation,
  Risk,
  UnknownIssue,
  RepairInstruction,
} from '../types/verification-result.types';

export type VerificationBridgeOptions = {
  verificationRunId?: string;
  scope?: VerificationScope;
  /** 体验兑现估计（来自体验意图编译器） */
  experienceFulfillmentEstimate?: number;
  /** 日程稳健性（来自 execution simulation 等） */
  scheduleRobustness?: number;
};

function issueToViolation(issue: VerificationIssue): Violation {
  return {
    code: issue.code,
    severity: issue.class === 'FATAL' ? 'HARD' : 'SOFT',
    message: issue.message,
    entityRef: issue.entityRef
      ? { type: issue.entityRef.type, id: issue.entityRef.id }
      : undefined,
    evidenceRefs: issue.metadata?.evidenceKind ? [`evidence:${issue.metadata.evidenceKind}`] : undefined,
  };
}

function physicalToViolation(v: PhysicalViolationItem): Violation {
  return {
    code: v.code,
    severity: v.severity === 'BLOCK' ? 'HARD' : 'SOFT',
    message: v.detail,
    evidenceRefs: v.evidence_source ? [v.evidence_source] : undefined,
  };
}

function deriveStatusFromKernelReport(report: VerificationReport): VerificationStatus {
  const hasUnknown = report.issues.some((i) => i.code === 'UNKNOWN');
  if (hasUnknown && report.counts.fatal === 0 && report.counts.conflict === 0) {
    return 'UNKNOWN';
  }
  if (report.hasFatal) return 'BLOCKED';
  if (report.hasConflict) return 'REPAIR_REQUIRED';
  if (report.hasAdvisory) return 'PASS_WITH_WARNING';
  return 'PASS';
}

function deriveStatusFromPhysical(physical: PhysicalEvaluationResult): VerificationStatus {
  const codes = physical.violations.map((v) => v.code);
  if (codes.some((c) => c.includes('UNKNOWN') || c.includes('MISSING_DATA'))) {
    return 'UNKNOWN';
  }
  if (physical.blocking) {
    const fRoad = codes.some(
      (c) =>
        c.includes('F_ROAD') ||
        c.includes('TERRAIN') ||
        c.includes('SEGMENT_ROAD') ||
        c.includes('f_road'),
    );
    return fRoad ? 'REPAIR_REQUIRED' : 'BLOCKED';
  }
  if (physical.violations.some((v) => v.severity === 'WARN')) {
    return 'PASS_WITH_WARNING';
  }
  return 'PASS';
}

function estimateFeasibilityScore(
  hardCount: number,
  softCount: number,
  unknownCount: number,
): number {
  const penalty = hardCount * 0.35 + softCount * 0.12 + unknownCount * 0.2;
  return Math.max(0, Math.min(1, 1 - penalty));
}

function estimateEvidenceConfidence(evidenceRefs: string[]): number {
  if (!evidenceRefs.length) return 0.45;
  const official = evidenceRefs.filter(
    (r) => r.includes('policy:') || r.includes('road.is') || r.includes('OFFICIAL'),
  ).length;
  return Math.min(0.95, 0.5 + official * 0.15 + evidenceRefs.length * 0.05);
}

function buildRepairInstructions(
  status: VerificationStatus,
  violations: Violation[],
): RepairInstruction[] {
  if (status !== 'REPAIR_REQUIRED') return [];
  return violations
    .filter((v) => v.severity === 'HARD')
    .map((v) => ({
      action:
        v.code.includes('F_ROAD') || v.code.includes('TERRAIN')
          ? 'REPLACE_ITEM'
          : v.code.includes('TIME') || v.code.includes('FATIGUE')
            ? 'REORDER_ITEMS'
            : 'REPLACE_ITEM',
      detail: v.message,
    }));
}

export function mapVerificationReportToResult(
  report: VerificationReport,
  options: VerificationBridgeOptions = {},
): VerificationResult {
  const hardViolations = report.issues
    .filter((i) => i.class === 'FATAL' || i.class === 'CONFLICT')
    .map(issueToViolation);
  const softRisks: Risk[] = report.issues
    .filter((i) => i.class === 'ADVISORY')
    .map((i) => ({
      code: i.code,
      message: i.message,
      likelihood: i.confidence01,
    }));
  const unknowns: UnknownIssue[] = report.issues
    .filter((i) => i.code === 'UNKNOWN')
    .map((i) => ({
      code: i.code,
      message: i.message,
    }));

  const status = deriveStatusFromKernelReport(report);
  const evidenceRefs = report.issues
    .flatMap((i) => (i.metadata?.evidenceKind ? [`evidence:${i.metadata.evidenceKind}`] : []))
    .filter(Boolean);

  const feasibilityScore = estimateFeasibilityScore(
    hardViolations.filter((v) => v.severity === 'HARD').length,
    softRisks.length,
    unknowns.length,
  );

  return {
    verificationRunId: options.verificationRunId ?? `vr-kernel-${report.verifiedAt}`,
    status,
    scope: options.scope ?? 'TRIP',
    hardViolations,
    softRisks,
    unknowns,
    metrics: {
      feasibilityScore,
      evidenceConfidence: estimateEvidenceConfidence(evidenceRefs),
      experienceFulfillmentEstimate: options.experienceFulfillmentEstimate,
      scheduleRobustness: options.scheduleRobustness,
    },
    repairInstructions: buildRepairInstructions(status, hardViolations),
    userDecisionsRequired: [],
    evidenceRefs,
  };
}

export function mapPhysicalEvaluationToResult(
  physical: PhysicalEvaluationResult,
  options: VerificationBridgeOptions = {},
): VerificationResult {
  const hardViolations = physical.violations
    .filter((v) => v.severity === 'BLOCK')
    .map(physicalToViolation);
  const softRisks: Risk[] = physical.violations
    .filter((v) => v.severity === 'WARN')
    .map((v) => ({
      code: v.code,
      message: v.detail,
      evidenceRefs: v.evidence_source ? [v.evidence_source] : undefined,
    }));

  const unknowns: UnknownIssue[] = physical.violations
    .filter((v) => v.code.includes('UNKNOWN') || v.code.includes('MISSING'))
    .map((v) => ({
      code: v.code,
      message: v.detail,
      missingData: [v.code],
      evidenceRefs: v.evidence_source ? [v.evidence_source] : undefined,
    }));

  const status = deriveStatusFromPhysical(physical);
  const evidenceRefs = physical.violations
    .map((v) => v.evidence_source)
    .filter((r): r is string => typeof r === 'string' && r.length > 0);

  const feasibilityScore = estimateFeasibilityScore(
    hardViolations.length,
    softRisks.length,
    unknowns.length,
  );

  return {
    verificationRunId:
      options.verificationRunId ?? `vr-physical-${physical.evaluated_at}`,
    status,
    scope: options.scope ?? 'CANDIDATE',
    hardViolations,
    softRisks,
    unknowns,
    metrics: {
      feasibilityScore,
      evidenceConfidence: estimateEvidenceConfidence(evidenceRefs),
      experienceFulfillmentEstimate: options.experienceFulfillmentEstimate,
      scheduleRobustness: options.scheduleRobustness,
    },
    repairInstructions: buildRepairInstructions(status, hardViolations),
    userDecisionsRequired: [],
    evidenceRefs,
  };
}
