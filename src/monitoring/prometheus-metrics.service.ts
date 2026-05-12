// src/monitoring/prometheus-metrics.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

/**
 * Prometheus Metrics Service
 *
 * 为冰岛世界模型提供完整的监控指标
 */
@Injectable()
export class PrometheusMetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // Gate 评估指标
  private gateEvaluationsTotal!: Counter;
  private gateEvaluationDuration!: Histogram;
  private gateBlocksTotal!: Counter;
  private gateAdjustmentsTotal!: Counter;

  // 天气 API 指标
  private weatherApiCallsTotal!: Counter;
  private weatherApiDuration!: Histogram;
  private weatherApiErrorsTotal!: Counter;
  private weatherDataFreshnessGauge!: Gauge;

  // Road API 指标
  private roadApiCallsTotal!: Counter;
  private roadApiDuration!: Histogram;
  private roadApiErrorsTotal!: Counter;
  private roadCacheHitsTotal!: Counter;

  // 世界模型构建指标
  private worldModelBuildsTotal!: Counter;
  private worldModelBuildDuration!: Histogram;
  private worldModelBuildErrorsTotal!: Counter;

  // 证据链指标
  private evidenceChainLengthGauge!: Gauge;
  private evidenceConfidenceGauge!: Gauge;

  // Decision OS consistency / drift (audit-derived)
  // NOTE: We expose per-sample scores via Gauge for runtime proof.
  private sessionConsistencyScore!: Gauge;
  private sessionConsistencyScoreP95!: Gauge;
  private readonly sessionConsistencyScoreSamples: number[] = [];

  // Audit persistence degrade (runtime hardening)
  private auditPersistFailedTotal!: Counter;

  // Axiom alignment mismatch counters (runtime proof)
  private axiomSimRealMismatchTotal!: Counter;
  private axiomDominantCidMismatchTotal!: Counter;
  private auditContractViolationTotal!: Counter;

  // Saga reconciliation metrics
  private sagaReconciliationActiveTasks!: Gauge;
  private sagaManualInterventionTotal!: Counter;
  private sagaCleanupLatencySeconds!: Histogram;

  /** P-OPS-1 runtime governance */
  private opsWorldFactAgeSeconds!: Histogram;
  private opsRouteConstraintPropagationSeconds!: Histogram;
  private opsWeatherEvidenceHardTotal!: Counter;
  private opsWeatherEvidencePipelineExceptionsTotal!: Counter;
  private opsNeptuneEcoSecondPassTotal!: Counter;
  /** P-OPS-3 governance resolutions (branch × action). */
  private opsOperationalGovernanceResolutionsTotal!: Counter;

  /** Memory Runtime OS（Phase 2：可观测 / 治理） */
  private memoryContextLoadSuccessTotal!: Counter;
  private memoryContextLoadFailureTotal!: Counter;
  private memoryContextSnapshotAgeMs!: Histogram;
  private memoryPipelineWriteSuccessTotal!: Counter;
  private memoryPipelineWriteFailureTotal!: Counter;
  private memoryContractMissingTotal!: Counter;

  constructor() {
    this.registry = new Registry();
    this.initializeMetrics();
  }

  async onModuleInit() {
    // 设置默认标签
    this.registry.setDefaultLabels({
      app: 'tripnara-iceland-world-model',
      environment: process.env.NODE_ENV || 'development',
    });
  }

  private initializeMetrics() {
    // Gate 评估指标
    this.gateEvaluationsTotal = new Counter({
      name: 'tripnara_gate_evaluations_total',
      help: 'Total number of gate evaluations',
      labelNames: ['result', 'country_code'],
      registers: [this.registry],
    });

    this.gateEvaluationDuration = new Histogram({
      name: 'tripnara_gate_evaluation_duration_seconds',
      help: 'Duration of gate evaluations in seconds',
      labelNames: ['country_code'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.gateBlocksTotal = new Counter({
      name: 'tripnara_gate_blocks_total',
      help: 'Total number of gate blocks',
      labelNames: ['violation_type', 'country_code'],
      registers: [this.registry],
    });

    this.gateAdjustmentsTotal = new Counter({
      name: 'tripnara_gate_adjustments_total',
      help: 'Total number of gate adjustments required',
      labelNames: ['adjustment_type', 'country_code'],
      registers: [this.registry],
    });

    // 天气 API 指标
    this.weatherApiCallsTotal = new Counter({
      name: 'tripnara_weather_api_calls_total',
      help: 'Total number of weather API calls',
      labelNames: ['status', 'region'],
      registers: [this.registry],
    });

    this.weatherApiDuration = new Histogram({
      name: 'tripnara_weather_api_duration_seconds',
      help: 'Duration of weather API calls in seconds',
      labelNames: ['region'],
      buckets: [0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.weatherApiErrorsTotal = new Counter({
      name: 'tripnara_weather_api_errors_total',
      help: 'Total number of weather API errors',
      labelNames: ['error_type', 'region'],
      registers: [this.registry],
    });

    this.weatherDataFreshnessGauge = new Gauge({
      name: 'tripnara_weather_data_freshness_seconds',
      help: 'Age of weather data in seconds',
      labelNames: ['region'],
      registers: [this.registry],
    });

    // Road API 指标
    this.roadApiCallsTotal = new Counter({
      name: 'tripnara_road_api_calls_total',
      help: 'Total number of road API calls',
      labelNames: ['status', 'road_id'],
      registers: [this.registry],
    });

    this.roadApiDuration = new Histogram({
      name: 'tripnara_road_api_duration_seconds',
      help: 'Duration of road API calls in seconds',
      labelNames: ['road_id'],
      buckets: [0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.roadApiErrorsTotal = new Counter({
      name: 'tripnara_road_api_errors_total',
      help: 'Total number of road API errors',
      labelNames: ['error_type', 'road_id'],
      registers: [this.registry],
    });

    this.roadCacheHitsTotal = new Counter({
      name: 'tripnara_road_cache_hits_total',
      help: 'Total number of road cache hits',
      labelNames: ['road_id'],
      registers: [this.registry],
    });

    // 世界模型构建指标
    this.worldModelBuildsTotal = new Counter({
      name: 'tripnara_world_model_builds_total',
      help: 'Total number of world model builds',
      labelNames: ['status', 'country_code'],
      registers: [this.registry],
    });

    this.worldModelBuildDuration = new Histogram({
      name: 'tripnara_world_model_build_duration_seconds',
      help: 'Duration of world model builds in seconds',
      labelNames: ['country_code'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.worldModelBuildErrorsTotal = new Counter({
      name: 'tripnara_world_model_build_errors_total',
      help: 'Total number of world model build errors',
      labelNames: ['error_type', 'country_code'],
      registers: [this.registry],
    });

    // 证据链指标
    this.evidenceChainLengthGauge = new Gauge({
      name: 'tripnara_evidence_chain_length',
      help: 'Length of evidence chain',
      labelNames: ['request_id'],
      registers: [this.registry],
    });

    this.evidenceConfidenceGauge = new Gauge({
      name: 'tripnara_evidence_confidence',
      help: 'Confidence score of evidence',
      labelNames: ['evidence_type'],
      registers: [this.registry],
    });

    // Consistency score: 0..100 (higher is better)
    // Use Gauge so Scale Proof can read samples deterministically without relying on histogram export.
    this.sessionConsistencyScore = new Gauge({
      name: 'tripnara_session_consistency_score',
      help: 'Audit-derived session consistency score (0-100; higher is better)',
      labelNames: ['axiom_id', 'cid', 'terminal'],
      registers: [this.registry],
    });
    this.sessionConsistencyScoreP95 = new Gauge({
      name: 'tripnara_session_consistency_score_p95',
      help: 'P95 of recent session consistency score samples (process-local)',
      registers: [this.registry],
    });
    try {
      this.sessionConsistencyScore.set({ axiom_id: 'BOOT', cid: 'BOOT', terminal: 'false' }, 0);
      this.sessionConsistencyScoreP95.set(0);
    } catch {
      // best-effort
    }

    this.auditPersistFailedTotal = new Counter({
      name: 'tripnara_audit_persist_failed_total',
      help: 'Total number of audit/decision log persistence failures (must not fail requests)',
      labelNames: ['axiom_id', 'cid', 'stage', 'error_type'],
      registers: [this.registry],
    });

    this.axiomSimRealMismatchTotal = new Counter({
      name: 'tripnara_axiom_sim_real_mismatch_total',
      help: 'Total number of axiom sim/real mismatches (delta_reason_kind=mismatch)',
      labelNames: ['axiom_id', 'expected_cid', 'actual_cid', 'stage'],
      registers: [this.registry],
    });

    this.axiomDominantCidMismatchTotal = new Counter({
      name: 'tripnara_axiom_dominant_cid_mismatch_total',
      help: 'Total number of dominant_cid mismatches against expected axiom cid',
      labelNames: ['axiom_id', 'expected_cid', 'actual_cid', 'stage'],
      registers: [this.registry],
    });
    this.auditContractViolationTotal = new Counter({
      name: 'tripnara_decision_os_audit_contract_violation_total',
      help: 'Total number of decision_os_audit_report contract violations (non-blocking)',
      labelNames: ['stage', 'field', 'reason'],
      registers: [this.registry],
    });

    // Saga reconciliation metrics
    this.sagaReconciliationActiveTasks = new Gauge({
      name: 'tripnara_saga_reconciliation_active_tasks',
      help: 'Number of saga tasks currently in CLEANING_IN_PROGRESS',
      registers: [this.registry],
    });
    this.sagaManualInterventionTotal = new Counter({
      name: 'tripnara_saga_manual_intervention_total',
      help: 'Total number of saga logs requiring manual intervention',
      labelNames: ['resource_type', 'provider'],
      registers: [this.registry],
    });
    this.sagaCleanupLatencySeconds = new Histogram({
      name: 'tripnara_saga_cleanup_latency_seconds',
      help: 'Cleanup latency from FAILED to CLEANED in seconds',
      labelNames: ['resource_type', 'provider'],
      buckets: [1, 5, 15, 30, 60, 120, 300, 900, 1800, 3600, 21600, 86400],
      registers: [this.registry],
    });

    // —— P-OPS-1：Runtime observability（freshness / propagation / hazard pressure）
    this.opsWorldFactAgeSeconds = new Histogram({
      name: 'tripnara_ops_world_fact_age_seconds',
      help: 'Age of WorldFact rows at resolve time (seconds); observedAt/createdAt relative to now',
      labelNames: ['source'],
      buckets: [1, 60, 300, 900, 3600, 86400, 604800, 2592000],
      registers: [this.registry],
    });
    this.opsRouteConstraintPropagationSeconds = new Histogram({
      name: 'tripnara_ops_route_constraint_propagation_seconds',
      help: 'Wall time for road dependency graph propagation (seconds)',
      buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 2],
      registers: [this.registry],
    });
    this.opsWeatherEvidenceHardTotal = new Counter({
      name: 'tripnara_ops_weather_evidence_hard_total',
      help: 'Weather evidence pipeline produced HARD violation (segment-level aggregate)',
      labelNames: ['reason_kind'],
      registers: [this.registry],
    });
    this.opsWeatherEvidencePipelineExceptionsTotal = new Counter({
      name: 'tripnara_ops_weather_evidence_pipeline_exceptions_total',
      help: 'Exceptions thrown while running weather evidence pipeline',
      registers: [this.registry],
    });
    this.opsNeptuneEcoSecondPassTotal = new Counter({
      name: 'tripnara_ops_neptune_eco_second_pass_total',
      help: 'ECO closure requested an extra Neptune pass (retry pressure)',
      registers: [this.registry],
    });
    this.opsOperationalGovernanceResolutionsTotal = new Counter({
      name: 'tripnara_ops_operational_governance_resolutions_total',
      help: 'P-OPS-3 operational policy evaluations (weather / world_fact branches)',
      labelNames: ['branch', 'action'],
      registers: [this.registry],
    });

    this.memoryContextLoadSuccessTotal = new Counter({
      name: 'tripnara_memory_context_load_success_total',
      help: 'Successful AgentMemoryContext loads (route_and_run preflight)',
      registers: [this.registry],
    });
    this.memoryContextLoadFailureTotal = new Counter({
      name: 'tripnara_memory_context_load_failure_total',
      help: 'Failed AgentMemoryContext loads (assembler threw)',
      registers: [this.registry],
    });
    this.memoryContextSnapshotAgeMs = new Histogram({
      name: 'tripnara_memory_context_snapshot_age_ms',
      help: 'Wall-clock ms from snapshot loaded_at to attachObservability (staleness at response)',
      buckets: [0, 5, 10, 50, 100, 500, 2000, 10_000, 60_000, 300_000],
      registers: [this.registry],
    });
    this.memoryPipelineWriteSuccessTotal = new Counter({
      name: 'tripnara_memory_pipeline_write_success_total',
      help: 'Memory write pipeline persisted successfully',
      registers: [this.registry],
    });
    this.memoryPipelineWriteFailureTotal = new Counter({
      name: 'tripnara_memory_pipeline_write_failure_total',
      help: 'Memory write pipeline persist failures',
      registers: [this.registry],
    });
    this.memoryContractMissingTotal = new Counter({
      name: 'tripnara_memory_contract_missing_total',
      help: 'route_and_run response assembled without memory_contract on request',
      registers: [this.registry],
    });
  }

  // Gate Metrics Methods
  recordGateEvaluation(result: string, countryCode: string, durationMs: number) {
    this.gateEvaluationsTotal.inc({ result, country_code: countryCode });
    this.gateEvaluationDuration.observe({ country_code: countryCode }, durationMs / 1000);
  }

  recordGateBlock(violationType: string, countryCode: string) {
    this.gateBlocksTotal.inc({ violation_type: violationType, country_code: countryCode });
  }

  recordGateAdjustment(adjustmentType: string, countryCode: string) {
    this.gateAdjustmentsTotal.inc({ adjustment_type: adjustmentType, country_code: countryCode });
  }

  // Weather API Metrics Methods
  recordWeatherApiCall(status: 'success' | 'error', region: string, durationMs: number) {
    this.weatherApiCallsTotal.inc({ status, region });
    this.weatherApiDuration.observe({ region }, durationMs / 1000);
  }

  recordWeatherApiError(errorType: string, region: string) {
    this.weatherApiErrorsTotal.inc({ error_type: errorType, region });
  }

  updateWeatherDataFreshness(region: string, ageSeconds: number) {
    this.weatherDataFreshnessGauge.set({ region }, ageSeconds);
  }

  // Road API Metrics Methods
  recordRoadApiCall(status: 'success' | 'error', roadId: string, durationMs: number) {
    this.roadApiCallsTotal.inc({ status, road_id: roadId });
    this.roadApiDuration.observe({ road_id: roadId }, durationMs / 1000);
  }

  recordRoadApiError(errorType: string, roadId: string) {
    this.roadApiErrorsTotal.inc({ error_type: errorType, road_id: roadId });
  }

  /**
   * Record audit-derived consistency score.
   *
   * Notes:
   * - dominant_cid: best-effort "most binding" constraint id for the session
   * - phase: INTAKE or REPAIR (defaults to REPAIR since score is computed on predictive→real repair alignment)
   */
  recordSessionConsistencyScore(params: {
    score: number;
    axiom_id?: string;
    cid?: string;
    terminal?: boolean;
  }): void {
    const score = Number(params.score);
    if (!Number.isFinite(score)) return;
    const s = Math.max(0, Math.min(100, score));
    try {
      this.sessionConsistencyScore.set(
        {
          axiom_id: params.axiom_id ? String(params.axiom_id) : 'UNKNOWN',
          cid: params.cid ? String(params.cid) : 'UNKNOWN',
          terminal: params.terminal === true ? 'true' : 'false',
        },
        s,
      );
    } catch {
      // best-effort only
    }

    // Maintain a small rolling window for p95 computation (observability-only).
    try {
      this.sessionConsistencyScoreSamples.push(s);
      if (this.sessionConsistencyScoreSamples.length > 5000) {
        this.sessionConsistencyScoreSamples.splice(0, this.sessionConsistencyScoreSamples.length - 5000);
      }
      const sorted = [...this.sessionConsistencyScoreSamples].sort((a, b) => a - b);
      const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
      const p95 = sorted.length ? sorted[idx] : 0;
      this.sessionConsistencyScoreP95.set(p95);
    } catch {
      // best-effort only
    }
  }

  recordAxiomSimRealMismatch(params: {
    axiom_id?: string;
    expected_cid?: string;
    actual_cid?: string;
    stage?: string;
  }): void {
    try {
      this.axiomSimRealMismatchTotal.inc({
        axiom_id: params.axiom_id ? String(params.axiom_id) : 'UNKNOWN',
        expected_cid: params.expected_cid ? String(params.expected_cid) : 'UNKNOWN',
        actual_cid: params.actual_cid ? String(params.actual_cid) : 'UNKNOWN',
        stage: params.stage ? String(params.stage) : 'UNKNOWN',
      });
    } catch {
      // best-effort only
    }
  }

  recordAxiomDominantCidMismatch(params: {
    axiom_id?: string;
    expected_cid?: string;
    actual_cid?: string;
    stage?: string;
  }): void {
    try {
      this.axiomDominantCidMismatchTotal.inc({
        axiom_id: params.axiom_id ? String(params.axiom_id) : 'UNKNOWN',
        expected_cid: params.expected_cid ? String(params.expected_cid) : 'UNKNOWN',
        actual_cid: params.actual_cid ? String(params.actual_cid) : 'UNKNOWN',
        stage: params.stage ? String(params.stage) : 'UNKNOWN',
      });
    } catch {
      // best-effort only
    }
  }

  recordAuditPersistFailed(params: {
    axiom_id?: string;
    cid?: string;
    stage?: string;
    error_type?: string;
  }): void {
    try {
      this.auditPersistFailedTotal.inc({
        axiom_id: params.axiom_id ? String(params.axiom_id) : 'UNKNOWN',
        cid: params.cid ? String(params.cid) : 'UNKNOWN',
        stage: params.stage ? String(params.stage) : 'UNKNOWN',
        error_type: params.error_type ? String(params.error_type) : 'UNKNOWN',
      });
    } catch {
      // best-effort only
    }
  }

  recordDecisionOsAuditContractViolation(params: {
    stage?: string;
    field?: string;
    reason?: string;
  }): void {
    try {
      this.auditContractViolationTotal.inc({
        stage: params.stage ? String(params.stage) : 'UNKNOWN',
        field: params.field ? String(params.field) : 'UNKNOWN',
        reason: params.reason ? String(params.reason) : 'UNKNOWN',
      });
    } catch {
      // best-effort only
    }
  }

  recordRoadCacheHit(roadId: string) {
    this.roadCacheHitsTotal.inc({ road_id: roadId });
  }

  // World Model Metrics Methods
  recordWorldModelBuild(status: 'success' | 'error', countryCode: string, durationMs: number) {
    this.worldModelBuildsTotal.inc({ status, country_code: countryCode });
    this.worldModelBuildDuration.observe({ country_code: countryCode }, durationMs / 1000);
  }

  recordWorldModelBuildError(errorType: string, countryCode: string) {
    this.worldModelBuildErrorsTotal.inc({ error_type: errorType, country_code: countryCode });
  }

  // Evidence Chain Metrics Methods
  recordEvidenceChainLength(requestId: string, length: number) {
    this.evidenceChainLengthGauge.set({ request_id: requestId }, length);
  }

  recordEvidenceConfidence(evidenceType: string, confidence: number) {
    this.evidenceConfidenceGauge.set({ evidence_type: evidenceType }, confidence);
  }

  // Saga reconciliation metrics methods
  setSagaReconciliationActiveTasks(count: number): void {
    const n = Number(count);
    if (!Number.isFinite(n)) return;
    this.sagaReconciliationActiveTasks.set(Math.max(0, n));
  }

  incSagaManualIntervention(resourceType?: string | null, provider?: string | null): void {
    this.sagaManualInterventionTotal.inc({
      resource_type: resourceType ? String(resourceType) : 'UNKNOWN',
      provider: provider ? String(provider) : 'UNKNOWN',
    });
  }

  observeSagaCleanupLatencySeconds(seconds: number, resourceType?: string | null, provider?: string | null): void {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s < 0) return;
    this.sagaCleanupLatencySeconds.observe(
      {
        resource_type: resourceType ? String(resourceType) : 'UNKNOWN',
        provider: provider ? String(provider) : 'UNKNOWN',
      },
      s,
    );
  }

  /** P-OPS-1: world fact age at read time (seconds). */
  observeOpsWorldFactAgeSeconds(ageSeconds: number, source: 'resolver_latest' | 'resolver_history' = 'resolver_latest'): void {
    const s = Number(ageSeconds);
    if (!Number.isFinite(s) || s < 0) return;
    try {
      this.opsWorldFactAgeSeconds.observe({ source }, s);
    } catch {
      // best-effort
    }
  }

  /** P-OPS-1: road dependency propagation wall time. */
  observeOpsRouteConstraintPropagationSeconds(seconds: number): void {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s < 0) return;
    try {
      this.opsRouteConstraintPropagationSeconds.observe(s);
    } catch {
      // best-effort
    }
  }

  /** HARD branch from weather evidence aggregate pipeline. */
  recordOpsWeatherEvidenceHard(reasonKind?: string): void {
    let k = 'unknown';
    if (reasonKind?.trim()) {
      const t = reasonKind.trim().slice(0, 80);
      k = /^[\w\s.,;/:+()\-]+$/.test(t)
        ? t.replace(/\s+/g, '_').slice(0, 48)
        : 'non_ascii_or_special';
    }
    try {
      this.opsWeatherEvidenceHardTotal.inc({ reason_kind: k });
    } catch {
      // best-effort
    }
  }

  recordOpsWeatherEvidencePipelineException(): void {
    try {
      this.opsWeatherEvidencePipelineExceptionsTotal.inc();
    } catch {
      // best-effort
    }
  }

  /** P-OPS-3 — discrete governance branch / action from policy evaluation. */
  recordOpsOperationalGovernanceResolution(branch: string, action: string): void {
    const safeBranch = /^[\w]+$/.test(branch) ? branch.slice(0, 32) : 'unknown';
    const safeAction = /^[\w_]+$/.test(action) ? action.slice(0, 48) : 'unknown';
    try {
      this.opsOperationalGovernanceResolutionsTotal.inc({
        branch: safeBranch,
        action: safeAction,
      });
    } catch {
      // best-effort
    }
  }

  /** Second Neptune pass under ECO closure (retry pressure signal). */
  recordOpsNeptuneEcoSecondPass(): void {
    try {
      this.opsNeptuneEcoSecondPassTotal.inc();
    } catch {
      // best-effort
    }
  }

  recordMemoryContextLoadSuccess(): void {
    try {
      this.memoryContextLoadSuccessTotal.inc();
    } catch {
      // best-effort
    }
  }

  recordMemoryContextLoadFailure(): void {
    try {
      this.memoryContextLoadFailureTotal.inc();
    } catch {
      // best-effort
    }
  }

  observeMemoryContextSnapshotAgeMs(ageMs: number): void {
    const n = Number(ageMs);
    if (!Number.isFinite(n) || n < 0) return;
    try {
      this.memoryContextSnapshotAgeMs.observe(n);
    } catch {
      // best-effort
    }
  }

  recordMemoryPipelineWrite(result: 'success' | 'failure'): void {
    try {
      if (result === 'success') {
        this.memoryPipelineWriteSuccessTotal.inc();
      } else {
        this.memoryPipelineWriteFailureTotal.inc();
      }
    } catch {
      // best-effort
    }
  }

  recordMemoryContractMissing(): void {
    try {
      this.memoryContractMissingTotal.inc();
    } catch {
      // best-effort
    }
  }

  // Get metrics for Prometheus scraping
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  // Get metrics in JSON format
  async getMetricsJSON(): Promise<any[]> {
    return this.registry.getMetricsAsJSON();
  }

  // Reset all metrics (useful for testing)
  resetMetrics() {
    this.registry.resetMetrics();
  }
}
