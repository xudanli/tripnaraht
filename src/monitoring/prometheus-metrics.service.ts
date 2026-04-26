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
  private gateEvaluationsTotal: Counter;
  private gateEvaluationDuration: Histogram;
  private gateBlocksTotal: Counter;
  private gateAdjustmentsTotal: Counter;

  // 天气 API 指标
  private weatherApiCallsTotal: Counter;
  private weatherApiDuration: Histogram;
  private weatherApiErrorsTotal: Counter;
  private weatherDataFreshnessGauge: Gauge;

  // Road API 指标
  private roadApiCallsTotal: Counter;
  private roadApiDuration: Histogram;
  private roadApiErrorsTotal: Counter;
  private roadCacheHitsTotal: Counter;

  // 世界模型构建指标
  private worldModelBuildsTotal: Counter;
  private worldModelBuildDuration: Histogram;
  private worldModelBuildErrorsTotal: Counter;

  // 证据链指标
  private evidenceChainLengthGauge: Gauge;
  private evidenceConfidenceGauge: Gauge;

  // Decision OS consistency / drift (audit-derived)
  private sessionConsistencyScore: Histogram;

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
    this.sessionConsistencyScore = new Histogram({
      name: 'tripnara_session_consistency_score',
      help: 'Audit-derived session consistency score (0-100; higher is better)',
      labelNames: ['dominant_cid', 'phase'],
      buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
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
    dominant_cid?: string;
    phase?: 'INTAKE' | 'REPAIR';
  }): void {
    const score = Number(params.score);
    if (!Number.isFinite(score)) return;
    const s = Math.max(0, Math.min(100, score));
    this.sessionConsistencyScore.observe(
      {
        dominant_cid: params.dominant_cid ? String(params.dominant_cid) : 'UNKNOWN',
        phase: params.phase ?? 'REPAIR',
      },
      s,
    );
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
