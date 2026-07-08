/**
 * O7 — Lex / Optimization Canary admission gates (SSOT).
 * @see DECISION_RUNTIME_ROADMAP.md §5.2 O7
 */

export const CANARY_ADMISSION_GATE_VERSION = 'canary-gates@v1';

export type CanaryGateCategory =
  | 'CALIBRATION_EVIDENCE'
  | 'SHADOW_QUALITY'
  | 'CONSTRAINT_SHADOW'
  | 'OPERATIONAL';

export type CanaryGateStatus = 'PASS' | 'FAIL' | 'PENDING' | 'NOT_EVALUATED';

export interface CanaryAdmissionGateDefinition {
  gateId: string;
  label: string;
  category: CanaryGateCategory;
  /** Human-readable threshold */
  threshold: string;
  /** Artifact or probe hint for evaluators */
  evidenceHint: string;
  /** P2 blockers must pass before CANARY mode */
  requiredForCanary: boolean;
}

export const CANARY_ADMISSION_GATES: CanaryAdmissionGateDefinition[] = [
  {
    gateId: 'P0_FORMAL_FREEZE',
    label: 'P0 formal calibration freeze complete',
    category: 'CALIBRATION_EVIDENCE',
    threshold: 'p0-freeze-status.overall=COMPLETE + formal freeze manifest',
    evidenceHint: 'artifacts/task-e1-freeze/p0-freeze-status.json',
    requiredForCanary: true,
  },
  {
    gateId: 'FAULT_INJECTION_GATE',
    label: 'Benchmark fault injection gate',
    category: 'CALIBRATION_EVIDENCE',
    threshold: '29/29 PASS on current commit',
    evidenceHint: 'artifacts/task-e1-benchmark/.fault-injection-gate.json',
    requiredForCanary: true,
  },
  {
    gateId: 'CALIBRATION_BLIND_REVIEW',
    label: 'Calibration-v1 blind review',
    category: 'CALIBRATION_EVIDENCE',
    threshold: '3/3 MATERIALIZED cases submitted',
    evidenceHint: 'bench_eab3892f-.../reports/blind-review-submissions.json',
    requiredForCanary: true,
  },
  {
    gateId: 'INPUT_CONSISTENCY_RATE',
    label: 'Eligible strategy comparison rate',
    category: 'SHADOW_QUALITY',
    threshold: '≥ 80% of non-EXCLUDED calibration instances eligible',
    evidenceHint: 'calibration benchmark-progress.json',
    requiredForCanary: true,
  },
  {
    gateId: 'NO_L1_REGRESSION',
    label: 'No L1 hard-block regression',
    category: 'SHADOW_QUALITY',
    threshold: 'TD-007-l1-block COMPLETED without shadow winner override',
    evidenceHint: 'calibration instance TD-007-l1-block execution-summary.json',
    requiredForCanary: true,
  },
  {
    gateId: 'NO_BLOCKED_WINNER',
    label: 'No blocked winner selected',
    category: 'SHADOW_QUALITY',
    threshold: '0 instances with blocked-winner failure class',
    evidenceHint: 'calibration benchmark-progress.json',
    requiredForCanary: true,
  },
  {
    gateId: 'SHADOW_ERROR_RATE',
    label: 'Shadow error / timeout rate',
    category: 'SHADOW_QUALITY',
    threshold: '≤ 10% of comparable instances (TD-010/011 excluded from rate)',
    evidenceHint: 'calibration benchmark-progress.json',
    requiredForCanary: true,
  },
  {
    gateId: 'BLIND_REVIEW_NOT_INFERIOR',
    label: 'Manual blind review non-inferior',
    category: 'CALIBRATION_EVIDENCE',
    threshold: 'No BOTH_INVALID / INSUFFICIENT_INFORMATION on materialized cases',
    evidenceHint: 'blind-review-submissions.json',
    requiredForCanary: true,
  },
  {
    gateId: 'CONSTRAINT_SHADOW_OBSERVED',
    label: 'Constraint shadow dual-run observed',
    category: 'CONSTRAINT_SHADOW',
    threshold: '≥ 1 divergence probe in staging with SHADOW_COMPARE',
    evidenceHint: 'artifacts/constraint-shadow-staging/report.json',
    requiredForCanary: false,
  },
  {
    gateId: 'CONSTRAINT_DIVERGENCE_DOCUMENTED',
    label: 'Constraint divergence rate documented',
    category: 'CONSTRAINT_SHADOW',
    threshold: 'Staging report with compared≥3 and divergence kinds catalogued',
    evidenceHint: 'artifacts/constraint-shadow-staging/report.json',
    requiredForCanary: false,
  },
  {
    gateId: 'HOLDOUT_PREFLIGHT',
    label: 'Holdout dataset preflight',
    category: 'CALIBRATION_EVIDENCE',
    threshold: '30 holdout instances scaffolded, config hash matches freeze',
    evidenceHint: 'npm run task-e1:holdout-preflight',
    requiredForCanary: true,
  },
  {
    gateId: 'HOLDOUT_BLIND_REVIEW',
    label: 'Holdout materialized blind review',
    category: 'CALIBRATION_EVIDENCE',
    threshold: 'All materialized holdout cases submitted',
    evidenceHint: 'artifacts/.../reports/holdout-summary.json',
    requiredForCanary: true,
  },
  {
    gateId: 'HOLDOUT_RUN_COMPLETE',
    label: 'Holdout batch run complete',
    category: 'CALIBRATION_EVIDENCE',
    threshold: 'Holdout split COMPLETED without config drift vs calibration-v1 freeze',
    evidenceHint: 'artifacts/task-e1-benchmark/bench_holdout_*/reports/',
    requiredForCanary: true,
  },
  {
    gateId: 'AUTHORIZATION_GATEWAY_STAGING',
    label: 'Authorization Policy Gateway staging validated',
    category: 'OPERATIONAL',
    threshold: 'DECISION/TOOL/COMMIT scopes evaluate without legacy bypass when enabled',
    evidenceHint: 'npm run p2-staging:validate',
    requiredForCanary: false,
  },
  {
    gateId: 'P1_TRIGGER_WIRING',
    label: 'P1 trigger wiring complete',
    category: 'OPERATIONAL',
    threshold: 'not_wired=0, dispatchCoveragePct=100',
    evidenceHint: 'artifacts/p1-phase-status/status.json',
    requiredForCanary: false,
  },
];

export function snapshotCanaryAdmissionGateCatalog() {
  return {
    schemaId: 'tripnara.canary_admission_gate_catalog@v1',
    version: CANARY_ADMISSION_GATE_VERSION,
    gateCount: CANARY_ADMISSION_GATES.length,
    requiredForCanaryCount: CANARY_ADMISSION_GATES.filter((g) => g.requiredForCanary).length,
    gates: CANARY_ADMISSION_GATES,
  };
}
