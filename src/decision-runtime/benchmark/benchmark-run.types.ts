/**
 * Task E1 — Formal benchmark batch runner contracts (staged checkpoint/resume).
 */

export type BenchmarkInstanceExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'AUTHORITY_COMPLETED'
  | 'SHADOW_COMPLETED'
  | 'REVIEW_MATERIALIZED'
  | 'EXCLUDED'
  | 'COMPLETED'
  | 'RETRYABLE_FAILED'
  | 'TERMINAL_FAILED';

export type BenchmarkRunStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FAILURES'
  | 'FAILED'
  | 'CANCELLED';

export type BenchmarkDatasetSplit = 'CALIBRATION' | 'HOLDOUT' | 'ALL';

export type BenchmarkFailureClass =
  | 'TRANSIENT_NETWORK'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'SHADOW_TIMEOUT'
  | 'AUTHENTICATION_ERROR'
  | 'INVALID_INSTANCE'
  | 'CONFIGURATION_ERROR'
  | 'INPUT_MISMATCH'
  | 'PERSISTENCE_ERROR'
  | 'UNKNOWN';

export interface BenchmarkRunConfig {
  benchmarkVersion: string;
  datasetVersion: string;
  datasetChecksum: string;
  split: BenchmarkDatasetSplit;
  authorityStrategyId: string;
  shadowStrategyId: string;
  solverEngine: string;
  objectiveRegistryVersion: string;
  constraintPolicyVersion: string;
  runtimeMode: string;
  gitCommit: string;
  environmentHash: string;
  concurrency: number;
  maxAttempts: number;
  shadowWaitTimeoutMs: number;
  baseUrl: string;
  noMaterialize?: boolean;
}

export interface BenchmarkDatasetInstance {
  instanceId: string;
  partition: 'CALIBRATION' | 'HOLDOUT';
  tripId: string;
  scenarioRef: string;
  seed?: number;
  strategyVariant?: string;
  realMulti?: boolean;
}

export interface BenchmarkDataset {
  datasetVersion: string;
  instances: BenchmarkDatasetInstance[];
}

export interface BenchmarkInstanceExecution {
  id: string;
  benchmarkRunId: string;
  instanceId: string;
  strategyVariant: string;
  seed: number;
  partition?: string;
  status: BenchmarkInstanceExecutionStatus;
  attemptCount: number;
  maxAttempts: number;
  requestId: string;
  decisionRunId?: string;
  comparisonId?: string;
  reviewCaseId?: string;
  inputHash: string;
  requestHash?: string;
  authorityResponseHash?: string;
  shadowEventHash?: string;
  authorityWinnerId?: string;
  shadowWinnerId?: string;
  eligibleForStrategyComparison?: boolean;
  divergenceTypes?: string[];
  exclusionReason?: string;
  failureClass?: BenchmarkFailureClass;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorStage?: string;
  lockedBy?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  artifactDirectory?: string;
  startedAt?: string;
  authorityCompletedAt?: string;
  shadowCompletedAt?: string;
  completedAt?: string;
}

export interface BenchmarkRunRecord {
  benchmarkRunId: string;
  benchmarkVersion: string;
  datasetVersion: string;
  datasetChecksum: string;
  split: BenchmarkDatasetSplit;
  runtimeMode: string;
  authorityStrategyId: string;
  shadowStrategyId: string;
  solverEngine: string;
  configHash: string;
  config: BenchmarkRunConfig;
  status: BenchmarkRunStatus;
  totalInstances: number;
  completedInstances: number;
  failedInstances: number;
  excludedInstances: number;
  gitCommit?: string;
  environmentHash?: string;
  forkedFromRunId?: string;
  startedAt: string;
  completedAt?: string;
}

export type BenchmarkResumeStage =
  | 'SUBMIT_AUTHORITY'
  | 'WAIT_SHADOW'
  | 'MATERIALIZE'
  | 'FINALIZE'
  | 'SKIP_TERMINAL';

export interface ConfigDriftResult {
  drifted: boolean;
  code?: 'CONFIG_DRIFT_DETECTED' | 'DATASET_DRIFT_DETECTED';
  details: string[];
}
