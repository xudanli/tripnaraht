#!/usr/bin/env npx ts-node
/**
 * AI-Native 决策系统集成测试脚本
 * 
 * 测试覆盖：
 * 1. Domain Agents（GeoAgent, WeatherAgent, CostAgent, ExperienceAgent）
 * 2. CoreDecision Agent（权衡分析、多方案生成）
 * 3. Narrator Agent（决策可视化）
 * 4. Decision Replay Service（快照、时间线、What-If）
 * 5. RLHF Signal Collector（信号收集、质量评估）
 * 
 * 使用方式：
 *   npx ts-node scripts/test-ai-native-decision-system.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';

// Services
import { GeoAgentService } from '../src/agent/services/domain-agents/geo-agent.service';
import { WeatherAgentService } from '../src/agent/services/domain-agents/weather-agent.service';
import { CostAgentService } from '../src/agent/services/domain-agents/cost-agent.service';
import { ExperienceAgentService } from '../src/agent/services/domain-agents/experience-agent.service';
import { ClaudeCoreDecisionAgentService } from '../src/agent/services/sub-agents/core-decision-agent.service';
import { ClaudeNarratorAgentService } from '../src/agent/services/sub-agents/narrator-agent.service';
import { DecisionReplayService } from '../src/agent/services/decision-replay.service';
import { RLHFSignalCollectorService } from '../src/agent/services/rlhf-signal-collector.service';

const logger = new Logger('AI-Native-Test');

interface TestResult {
  name: string;
  passed: boolean;
  duration_ms: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      duration_ms: Date.now() - start,
    });
    logger.log(`✅ ${name}`);
  } catch (error: any) {
    results.push({
      name,
      passed: false,
      duration_ms: Date.now() - start,
      error: error?.message || String(error),
    });
    logger.error(`❌ ${name}: ${error?.message}`);
  }
}

// ============================================================================
// Domain Agents Tests
// ============================================================================

async function testGeoAgent(app: INestApplication): Promise<void> {
  const geoAgent = app.get(GeoAgentService);
  
  // Test terrain analysis
  const terrainResult = await geoAgent.analyzeTerrain([
    { lat: 64.1466, lng: -21.9426 }, // Reykjavik
    { lat: 64.0685, lng: -16.2023 }, // Jökulsárlón
  ]);
  
  if (!terrainResult.terrain_type || !terrainResult.difficulty) {
    throw new Error('Terrain analysis missing required fields');
  }
  
  // Test route feasibility (origin, destination, transportMode)
  const feasibilityResult = await geoAgent.checkRouteFeasibility(
    { lat: 64.1466, lng: -21.9426 },  // origin
    { lat: 64.0685, lng: -16.2023 },  // destination
    'DRIVE'
  );
  
  if (feasibilityResult.is_reachable === undefined) {
    throw new Error('Feasibility check missing is_reachable field');
  }
  
  // Test nearby POIs
  const pois = await geoAgent.findNearbyPOIs(
    { lat: 64.1466, lng: -21.9426 },
    10,
    ['RESTAURANT', 'HOTEL']
  );
  
  // POIs may be empty if no data, but should not throw
  logger.debug(`Found ${pois.pois.length} nearby POIs`);
}

async function testWeatherAgent(app: INestApplication): Promise<void> {
  const weatherAgent = app.get(WeatherAgentService);
  
  // Test forecast
  const forecast = await weatherAgent.getForecast(
    { lat: 64.1466, lng: -21.9426 },
    { start: '2026-03-01', end: '2026-03-07' }
  );
  
  if (!forecast.forecasts || forecast.forecasts.length === 0) {
    throw new Error('Forecast missing daily data');
  }
  
  // Test road closure probability
  const closureProb = await weatherAgent.assessRoadClosureProbability(
    [
      { lat: 64.1466, lng: -21.9426 },
      { lat: 64.0685, lng: -16.2023 },
    ],
    '2026-03-01'
  );
  
  if (closureProb.overall_closure_probability === undefined || !closureProb.risk_level) {
    throw new Error('Road closure assessment missing required fields');
  }
}

async function testCostAgent(app: INestApplication): Promise<void> {
  const costAgent = app.get(CostAgentService);
  
  // Test cost estimation
  const costEstimate = await costAgent.estimateTripCost(
    'Iceland',
    { start: '2026-03-01', end: '2026-03-07' },
    2
  );
  
  if (!costEstimate.total_estimate || !costEstimate.breakdown) {
    throw new Error('Cost estimate missing required fields');
  }
  
  // Test price curve analysis
  const priceCurve = await costAgent.analyzePriceCurve(
    'HOTEL',
    'Iceland',
    { start: '2026-01-01', end: '2026-12-31' }
  );
  
  if (!priceCurve.price_trend || priceCurve.price_trend.length === 0) {
    throw new Error('Price curve missing data points');
  }
}

async function testExperienceAgent(app: INestApplication): Promise<void> {
  const experienceAgent = app.get(ExperienceAgentService);
  
  // Test experience density with proper Itinerary structure
  const density = await experienceAgent.analyzeExperienceDensity({
    days: [
      {
        date: '2026-03-01',
        items: [
          { type: 'ACTIVITY', location_ref: { name: 'Golden Circle' }, start_window: '09:00', end_window: '17:00', metadata: { duration_minutes: 480 } },
          { type: 'ACTIVITY', location_ref: { name: 'Northern Lights' }, start_window: '21:00', end_window: '00:00', metadata: { duration_minutes: 180 } },
        ],
      },
      {
        date: '2026-03-02',
        items: [
          { type: 'ACTIVITY', location_ref: { name: 'Glacier Hike' }, start_window: '10:00', end_window: '16:00', metadata: { duration_minutes: 360 } },
        ],
      },
    ],
  } as any);
  
  if (!density.density_curve || !density.quality_score) {
    throw new Error('Experience density missing required fields');
  }
  
  // Test fatigue prediction with proper Itinerary structure
  const fatigue = await experienceAgent.predictFatigue(
    {
      days: [
        { 
          date: '2026-03-01', 
          items: [
            { type: 'DRIVE', metadata: { duration_minutes: 240, distance_meters: 200000 } },
            { type: 'ACTIVITY', metadata: { duration_minutes: 180 } },
          ] 
        },
        { 
          date: '2026-03-02', 
          items: [
            { type: 'DRIVE', metadata: { duration_minutes: 360, distance_meters: 300000 } },
            { type: 'ACTIVITY', metadata: { duration_minutes: 120 } },
          ] 
        },
      ],
    } as any,
    { fitness_level: 'MEDIUM' }
  );
  
  if (!fatigue.daily_fatigue || !fatigue.cumulative_fatigue) {
    throw new Error('Fatigue prediction missing required fields');
  }
}

// ============================================================================
// Decision System Tests
// ============================================================================

async function testCoreDecisionAgent(app: INestApplication): Promise<void> {
  const coreDecision = app.get(ClaudeCoreDecisionAgentService);
  
  // Create mock candidates
  const candidates = [
    {
      itinerary: { id: 'plan-a', name: 'Adventure Plan', days: [] } as any,
      score: 85,
      pros: ['Best experiences', 'Scenic routes'],
      cons: ['Higher risk', 'More driving'],
      evidence_refs: ['ev-001', 'ev-002'],
    },
    {
      itinerary: { id: 'plan-b', name: 'Balanced Plan', days: [] } as any,
      score: 78,
      pros: ['Good balance', 'Reasonable pace'],
      cons: ['Fewer highlights'],
      evidence_refs: ['ev-003'],
    },
  ];
  
  const request = {
    destination: { lat: 64.1466, lng: -21.9426, name: 'Iceland' },
    date_range: { start_date: '2026-03-01', end_date: '2026-03-07' },
    party: { count: 2 },
  } as any;
  
  const context = {
    request_id: 'test-001',
    current_step: 'PLAN_GEN',
    decision_log: [],
  } as any;
  
  const output = await coreDecision.analyzeDecision(
    candidates,
    request,
    context,
    { priority: 'EXPERIENCE', risk_tolerance: 'MEDIUM' }
  );
  
  if (!output.decision_node || !output.ranked_plans || output.ranked_plans.length === 0) {
    throw new Error('Decision output missing required fields');
  }
  
  if (!output.comparison || !output.user_judgment_required) {
    throw new Error('Decision output missing comparison or judgment required');
  }
  
  logger.debug(`Generated ${output.ranked_plans.length} ranked plans`);
}

async function testNarratorAgent(app: INestApplication): Promise<void> {
  const narrator = app.get(ClaudeNarratorAgentService);
  
  // Create mock decision output
  const mockDecisionOutput = {
    decision_node: { id: 'node-001' },
    ranked_plans: [
      {
        plan: { id: 'plan-a', name: 'Adventure Plan', score: 85 },
        rank: 1,
        tradeoffs: {
          TIME: { value: 70, label: 'Good', color: 'green' },
          COST: { value: 60, label: 'Moderate', color: 'yellow' },
          EXPERIENCE: { value: 90, label: 'Excellent', color: 'green' },
          RISK: { value: 35, label: 'Elevated', color: 'yellow' },
        },
        what_you_get: 'Best experiences',
        what_you_pay: 'Higher risk',
      },
    ],
    comparison_matrix: { dimensions: ['TIME', 'COST', 'EXPERIENCE', 'RISK'], plans: [] },
    user_judgment_points: [],
    confidence: 0.75,
    metadata: { analysis_duration_ms: 100, domain_data_sources: [], model_version: '1.0' },
  } as any;
  
  // Test story generation
  const story = narrator.generateDecisionStory(mockDecisionOutput);
  if (!story.elimination_narrative || !story.recommendation_narrative) {
    throw new Error('Decision story missing required narratives');
  }
  
  // Test visualization generation
  const viz = narrator.generateDecisionVisualization(mockDecisionOutput);
  if (!viz.comparison_visualization || !viz.risk_visualization || !viz.uncertainty_visualization) {
    throw new Error('Decision visualization missing required charts');
  }
  
  // Test full presentation (needs decisionOutput, itinerary, gateResult)
  const mockItinerary = {
    request_id: 'test-001',
    days: [{ date: '2026-03-01', items: [] }],
  } as any;
  const mockGateResult = {
    overall_status: 'PASS',
    checks: [],
  } as any;
  const presentation = narrator.generateFullDecisionPresentation(mockDecisionOutput, mockItinerary, mockGateResult);
  if (!presentation.story || !presentation.visualization || !presentation.user_actions) {
    throw new Error('Full presentation missing required sections');
  }
}

// ============================================================================
// Decision Replay Tests
// ============================================================================

async function testDecisionReplay(app: INestApplication): Promise<void> {
  const replayService = app.get(DecisionReplayService);
  
  const testTripRunId = `test-trip-${Date.now()}`;
  
  // Create snapshots
  const mockState = {
    request_id: testTripRunId,
    current_step: 'RESEARCH',
    decision_log: [],
  } as any;
  
  const snapshot1 = replayService.createSnapshot(mockState, 'AUTO');
  if (!snapshot1.snapshot_id || !snapshot1.timestamp) {
    throw new Error('Snapshot creation failed');
  }
  
  // Advance state and create another snapshot
  mockState.current_step = 'PLAN_GEN';
  const snapshot2 = replayService.createSnapshot(mockState, 'CHECKPOINT');
  
  // Get timeline
  const timeline = replayService.getTimeline(testTripRunId);
  if (!timeline || timeline.snapshots.length < 2) {
    throw new Error('Timeline should have at least 2 snapshots');
  }
  
  // Get timeline summary
  const summary = replayService.buildTimelineSummary(testTripRunId);
  if (!summary || summary.total_snapshots < 2) {
    throw new Error('Timeline summary incorrect');
  }
  
  // Test replay
  const replayResult = replayService.replayToSnapshot(testTripRunId, snapshot1.snapshot_id);
  if (!replayResult || replayResult.restored_state.current_step !== 'RESEARCH') {
    throw new Error('Replay to snapshot failed');
  }
  
  // Test diff
  const diff = replayService.getDiffBetweenSnapshots(testTripRunId, snapshot1.snapshot_id, snapshot2.snapshot_id);
  if (!diff || diff.state_changes.length === 0) {
    throw new Error('Diff should show state changes');
  }
  
  // Test What-If simulation
  const mockDecisionOutput = {
    ranked_plans: [
      {
        plan: { id: 'plan-a', name: 'Plan A', score: 80 },
        rank: 1,
        tradeoffs: {
          TIME: { value: 70 },
          COST: { value: 60 },
          EXPERIENCE: { value: 85 },
          RISK: { value: 30 },
        },
        what_you_get: 'Good experience',
        what_you_pay: 'Some risk',
      },
    ],
    confidence: 0.7,
  } as any;
  
  const whatIfResult = replayService.simulateWhatIf(
    {
      base_snapshot_id: snapshot1.snapshot_id,
      changes: [
        { type: 'PREFERENCE_CHANGE', field: 'priority', original_value: 'EXPERIENCE', new_value: 'COST' },
      ],
    },
    mockDecisionOutput
  );
  
  if (!whatIfResult.comparison || !whatIfResult.insights) {
    throw new Error('What-If simulation missing required fields');
  }
  
  // Test counterfactual questions
  const questions = replayService.generateCounterfactualQuestions(mockDecisionOutput);
  if (questions.length === 0) {
    throw new Error('Should generate at least one counterfactual question');
  }
  
  // Test decision style learning
  const testUserId = `user-${Date.now()}`;
  replayService.recordLearningSignal(testUserId, 'ACCEPT', 'Accepted adventure plan');
  replayService.recordLearningSignal(testUserId, 'ACCEPT', 'Accepted scenic route');
  replayService.recordLearningSignal(testUserId, 'MODIFY', 'Adjusted pace');
  
  const preferences = replayService.inferPreferencesFromHistory(testUserId);
  if (preferences.confidence === undefined) {
    throw new Error('Preference inference failed');
  }
}

// ============================================================================
// RLHF Signal Tests
// ============================================================================

async function testRLHFSignalCollector(app: INestApplication): Promise<void> {
  const rlhfService = app.get(RLHFSignalCollectorService);
  
  const testTripRunId = `rlhf-test-${Date.now()}`;
  
  // Test behavior signals
  rlhfService.recordPlanViewTime(testTripRunId, 'plan-a', 15000);
  rlhfService.recordPlanViewTime(testTripRunId, 'plan-b', 5000);
  rlhfService.recordDetailInteraction(testTripRunId, 'PLAN', 'plan-a', 'EXPAND');
  
  // Test execution signals
  rlhfService.recordDeviation(
    testTripRunId,
    'activity-001',
    '2026-03-01T09:00:00Z',
    '2026-03-01T09:45:00Z',
    'Traffic delay'
  );
  rlhfService.recordSkippedActivity(testTripRunId, 'activity-002', 'Weather conditions');
  
  // Test feedback signals
  rlhfService.recordAcceptance(testTripRunId, 'decision-001', 'plan-a');
  rlhfService.recordRating(testTripRunId, 'decision-001', 4, 'Good recommendations');
  
  // Get signal summary
  const summary = rlhfService.getSignalSummary(testTripRunId);
  if (summary.behavior_count < 3 || summary.execution_count < 2 || summary.feedback_count < 2) {
    throw new Error('Signal counts incorrect');
  }
  
  // Test quality assessment
  const mockDecisionOutput = {
    ranked_plans: [{ plan: { id: 'plan-a', score: 80 }, rank: 1 }],
    confidence: 0.7,
  } as any;
  
  const assessment = rlhfService.assessDecisionQuality(testTripRunId, 'decision-001', mockDecisionOutput);
  if (!assessment.metrics || assessment.metrics.overall_quality === undefined) {
    throw new Error('Quality assessment failed');
  }
  
  // Test learning signal generation
  const learningSignals = rlhfService.generateLearningSignals(testTripRunId);
  if (learningSignals.length === 0) {
    throw new Error('Should generate at least one learning signal');
  }
  
  logger.debug(`Generated ${learningSignals.length} learning signals`);
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main(): Promise<void> {
  logger.log('🚀 Starting AI-Native Decision System Integration Tests');
  logger.log('=' .repeat(60));
  
  let app: INestApplication;
  
  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
    logger.log('✅ Application initialized');
  } catch (error: any) {
    logger.error(`❌ Failed to initialize application: ${error?.message}`);
    process.exit(1);
  }
  
  // Run Domain Agent Tests
  logger.log('\n📍 Testing Domain Agents...');
  await runTest('GeoAgent', () => testGeoAgent(app));
  await runTest('WeatherAgent', () => testWeatherAgent(app));
  await runTest('CostAgent', () => testCostAgent(app));
  await runTest('ExperienceAgent', () => testExperienceAgent(app));
  
  // Run Decision System Tests
  logger.log('\n🧠 Testing Decision System...');
  await runTest('CoreDecisionAgent', () => testCoreDecisionAgent(app));
  await runTest('NarratorAgent', () => testNarratorAgent(app));
  
  // Run Decision Replay Tests
  logger.log('\n⏪ Testing Decision Replay...');
  await runTest('DecisionReplayService', () => testDecisionReplay(app));
  
  // Run RLHF Signal Tests
  logger.log('\n📊 Testing RLHF Signal Collector...');
  await runTest('RLHFSignalCollector', () => testRLHFSignalCollector(app));
  
  // Print Summary
  logger.log('\n' + '=' .repeat(60));
  logger.log('📋 TEST SUMMARY');
  logger.log('=' .repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration_ms, 0);
  
  logger.log(`Total Tests: ${results.length}`);
  logger.log(`Passed: ${passed} ✅`);
  logger.log(`Failed: ${failed} ❌`);
  logger.log(`Total Time: ${totalTime}ms`);
  
  if (failed > 0) {
    logger.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      logger.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  await app.close();
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  logger.error(`Fatal error: ${error?.message}`);
  process.exit(1);
});
