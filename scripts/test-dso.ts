#!/usr/bin/env npx tsx
/**
 * DSO (Decision State Object) 测试脚本
 *
 * 验证 Decision Kernel 核心能力：
 * - DSO 初始化与合并
 * - OrchestratorState → DSO 投影
 * - Decision Meta 推断
 * - DSO → TripWorldState 转换
 * - Itinerary → TripPlan 转换
 *
 * 使用: npm run test:dso  或  npx tsx scripts/test-dso.ts
 */

import { orchestratorStateToDecisionStatePatch } from '../src/decision/kernel/orchestrator-state-mapper';
import { inferDecisionMeta } from '../src/decision/kernel/decision-meta-inference';
import {
  itineraryToTripPlan,
  decisionStateToTripWorldState,
} from '../src/decision/kernel/dso-to-trips-converter';
import { StateManagerService } from '../src/decision/kernel/state-manager.service';
import { ConstraintEngineAdapterService } from '../src/decision/kernel/constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from '../src/decision/kernel/optimization-engine-adapter.service';
import { RagRealityPolicyGateService } from '../src/rag/services/rag-reality-policy-gate.service';
import { ContextEngineAdapterService } from '../src/decision/kernel/context-engine-adapter.service';
import { FeedbackEngineAdapterService } from '../src/decision/kernel/feedback-engine-adapter.service';
import { DecisionKernelService } from '../src/decision/kernel/decision-kernel.service';
import type { OrchestratorState } from '../src/agent/interfaces/trip-plan.interface';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';

function logSection(title: string) {
  console.log('\n' + '─'.repeat(50));
  console.log(`  ${title}`);
  console.log('─'.repeat(50));
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`❌ ${msg}`);
}

async function main() {
  console.log('\n🧪 DSO (Decision State Object) 测试');
  console.log('====================================\n');

  const stateManager = new StateManagerService();
  const constraintAdapter = new ConstraintEngineAdapterService(undefined);
  const optimizationAdapter = new OptimizationEngineAdapterService(new RagRealityPolicyGateService());
  const contextAdapter = new ContextEngineAdapterService(undefined);
  const feedbackAdapter = new FeedbackEngineAdapterService();
  const kernel = new DecisionKernelService(
    stateManager,
    constraintAdapter,
    optimizationAdapter,
    contextAdapter,
    feedbackAdapter,
  );

  let passed = 0;
  let failed = 0;

  try {
    // ─── 1. DSO 初始化 ─────────────────────────────────────────
    logSection('1. DecisionKernelService.createInitialState()');
    const dso = kernel.createInitialState('req-test-001');
    console.log('  requestId:', dso.requestId);
    console.log('  systemState:', JSON.stringify(dso.systemState, null, 2).split('\n').slice(0, 6).join('\n'));
    assert(!!dso.userIntent, 'userIntent 存在');
    assert(!!dso.tripState, 'tripState 存在');
    assert(!!dso.environmentState, 'environmentState 存在');
    assert(dso.systemState?.requestId === 'req-test-001', 'requestId 正确');
    console.log('  ✅ 通过');
    passed++;

    // ─── 2. State Manager 合并 ─────────────────────────────────
    logSection('2. StateManagerService.merge()');
    const patch = {
      userIntent: { destination: 'Iceland', days: 5, mode: 'drive' as const },
      tripState: { fatigue: 0.3, planVersion: 1 },
      environmentState: { countryCode: 'IS', weatherRisk: 0.4 },
    };
    const merged = stateManager.merge(dso, patch);
    assert(merged.userIntent?.destination === 'Iceland', 'userIntent 合并正确');
    assert(merged.tripState?.fatigue === 0.3, 'tripState 合并正确');
    assert(merged.environmentState?.countryCode === 'IS', 'environmentState 合并正确');
    console.log('  userIntent.destination:', merged.userIntent?.destination);
    console.log('  tripState.fatigue:', merged.tripState?.fatigue);
    console.log('  environmentState.countryCode:', merged.environmentState?.countryCode);
    console.log('  ✅ 通过');
    passed++;

    // ─── 3. History Delta 追加 ──────────────────────────────────
    logSection('3. StateManagerService.appendHistoryDelta()');
    const withHistory = stateManager.appendHistoryDelta(merged, {
      type: 'userIntent',
      summary: '用户修改目的地',
      at: new Date().toISOString(),
    });
    assert((withHistory.history?.length ?? 0) >= 1, 'history 已追加');
    console.log('  history 条数:', withHistory.history?.length);
    console.log('  ✅ 通过');
    passed++;

    // ─── 4. OrchestratorState → DSO Patch ──────────────────────
    logSection('4. orchestratorStateToDecisionStatePatch()');
    const mockOrchestratorState: OrchestratorState = {
      request_id: 'req-002',
      plan_id: 'plan-002',
      plan_version: 2,
      current_step: 'GATE_EVAL',
      evidence_registry: new Map(),
      decision_log: [],
      decision_steps: [],
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
      trip_plan_request: {
        request_id: 'req-002',
        origin: 'Reykjavik',
        destination: 'Iceland',
        start_date: '2026-06-01',
        days: 7,
        mode: 'drive',
        party: { count: 2, fitness_level: 'medium' },
        party_profile: { risk_tolerance: 'MEDIUM' },
      },
      gate_result: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 0.9,
      },
      itinerary: {
        request_id: 'req-002',
        metadata: { version: 1, total_days: 1 },
        days: [
          {
            date: '2026-06-01',
            items: [
              {
                id: 'item-1',
                type: 'POI',
                start_window: '2026-06-01T09:00',
                end_window: '2026-06-01T12:00',
                location_ref: { name: 'Blue Lagoon', place_id: 'p1' },
                evidence_refs: [],
                verified: false,
              },
            ],
          },
        ],
      },
      research_data: {
        countryCode: 'IS',
        month: 6,
        weather_risk: 0.2,
      },
    } as OrchestratorState;

    const dsoPatch = orchestratorStateToDecisionStatePatch(mockOrchestratorState);
    assert(!!dsoPatch.userIntent?.destination, 'userIntent 投影正确');
    assert(dsoPatch.constraints?.feasible === true, 'constraints 投影正确');
    assert(dsoPatch.decisionMeta?.strategy === 'BALANCED', 'decisionMeta 推断正确');
    console.log('  userIntent.destination:', dsoPatch.userIntent?.destination);
    console.log('  constraints.feasible:', dsoPatch.constraints?.feasible);
    console.log('  decisionMeta:', dsoPatch.decisionMeta);
    console.log('  ✅ 通过');
    passed++;

    // ─── 5. Decision Meta 推断 ──────────────────────────────────
    logSection('5. inferDecisionMeta()');
    const meta1 = inferDecisionMeta({
      currentStep: 'PLAN_GEN',
      planVersion: 1,
      riskTolerance: 'HIGH',
    });
    assert(meta1.phase === 'PLAN', 'phase 推断正确');
    assert(meta1.strategy === 'AGGRESSIVE', 'strategy 推断正确');

    const meta2 = inferDecisionMeta({
      currentStep: 'INTAKE',
      failureRiskPredictions: [{ riskLevel: 'HIGH' }],
    });
    assert(meta2.mode === 'EMERGENCY', 'EMERGENCY mode 推断正确');
    console.log('  PLAN_GEN + HIGH risk →', meta1);
    console.log('  HIGH failure risk →', meta2);
    console.log('  ✅ 通过');
    passed++;

    // ─── 6. Itinerary → TripPlan ────────────────────────────────
    logSection('6. itineraryToTripPlan()');
    const itinerary = {
      days: [
        {
          date: '2026-06-01',
          items: [
            {
              id: 'i1',
              type: 'POI',
              start_window: '2026-06-01T09:00',
              end_window: '2026-06-01T11:00',
              location_ref: { name: 'Geysir' },
            },
          ],
        },
      ],
    };
    const tripPlan = itineraryToTripPlan(itinerary as any);
    assert(tripPlan.days?.length === 1, 'days 转换正确');
    assert(tripPlan.days?.[0]?.timeSlots?.length === 1, 'timeSlots 转换正确');
    assert(tripPlan.days?.[0]?.timeSlots?.[0]?.title === 'Geysir', 'POI 名称正确');
    console.log('  days:', tripPlan.days?.length);
    console.log('  timeSlots[0].title:', tripPlan.days?.[0]?.timeSlots?.[0]?.title);
    console.log('  ✅ 通过');
    passed++;

    // ─── 7. DecisionState → TripWorldState ───────────────────────
    logSection('7. decisionStateToTripWorldState()');
    const dsoForTrips: DecisionState = {
      userIntent: {
        destination: 'Iceland',
        dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' },
        days: 7,
        mode: 'drive',
      },
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'req-003' },
    };
    const tripWorldState = decisionStateToTripWorldState(dsoForTrips);
    assert(tripWorldState.context?.destination === 'Iceland', 'context.destination 正确');
    assert(tripWorldState.context?.durationDays === 7, 'context.durationDays 正确');
    console.log('  context.destination:', tripWorldState.context?.destination);
    console.log('  context.durationDays:', tripWorldState.context?.durationDays);
    console.log('  ✅ 通过');
    passed++;

    // ─── 8. Optimization Hints ──────────────────────────────────
    logSection('8. OptimizationEngineAdapterService.getHints()');
    const stateWithHints: DecisionState = {
      ...dso,
      environmentState: { weatherRisk: 0.8, failureRiskLevel: 'HIGH' },
      tripState: { fatigue: 0.5 },
    };
    const hints = optimizationAdapter.getHints(stateWithHints);
    assert(hints?.safetyTrend === 'HIGH', 'safetyTrend 推断正确');
    assert(hints?.fatigueTrend === 'MEDIUM', 'fatigueTrend 推断正确');
    console.log('  optimizationHints:', hints);
    console.log('  ✅ 通过');
    passed++;

    // ─── 9. Kernel inferAndUpdateDecisionMeta ───────────────────
    logSection('9. DecisionKernelService.inferAndUpdateDecisionMeta()');
    const stateBeforeMeta = stateManager.merge(dso, {
      systemState: { requestId: 'req-test-001', currentPhase: 'REPAIR' },
      tripState: { planVersion: 2 },
    });
    const stateAfterMeta = kernel.inferAndUpdateDecisionMeta(stateBeforeMeta);
    assert(stateAfterMeta.decisionMeta?.mode === 'ADJUST', 'mode 推断正确');
    console.log('  decisionMeta:', stateAfterMeta.decisionMeta);
    console.log('  ✅ 通过');
    passed++;

    // ─── 10. Constraint Report (已有 constraints) ─────────────────
    logSection('10. ConstraintEngineAdapterService.getReport()');
    const stateWithConstraints = stateManager.merge(dso, {
      constraints: {
        feasible: false,
        violations: [{ type: 'FATIGUE', severity: 'SOFT', detail: '疲劳度偏高' }],
      },
    });
    const report = constraintAdapter.getReport(stateWithConstraints);
    assert(report?.feasible === false, 'constraints 返回正确');
    assert(report?.violations?.length === 1, 'violations 正确');
    console.log('  constraints:', report);
    console.log('  ✅ 通过');
    passed++;

  } catch (err) {
    failed++;
    console.error('\n❌ 测试失败:', err instanceof Error ? err.message : err);
    throw err;
  }

  // ─── 汇总 ─────────────────────────────────────────────────────
  logSection('测试汇总');
  console.log(`  ✅ 通过: ${passed}`);
  if (failed > 0) console.log(`  ❌ 失败: ${failed}`);
  console.log('\n' + '═'.repeat(50));
  console.log('  🎉 DSO 测试全部通过');
  console.log('═'.repeat(50) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
