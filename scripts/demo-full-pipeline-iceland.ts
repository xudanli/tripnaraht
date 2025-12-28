// scripts/demo-full-pipeline-iceland.ts
/**
 * Full Pipeline Demo: Iceland
 * 
 * 全链路演示：从用户输入 → RouteDirection → Poi → DEM → Abu → Dr.Dre → Neptune → Final Plan → DecisionLog
 * 
 * 这条链一旦顺畅，你就有一个可以 demo / 可以卖的端到端 Agent。
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TripDecisionEngineService } from '../src/trips/decision/trip-decision-engine.service';
import { StrategyOrchestratorService } from '../src/trips/decision/services/strategy-orchestrator.service';
import { RouteDirectionSelectorService } from '../src/route-directions/services/route-direction-selector.service';
import {
  LegacyWorldModelContext,
  RoutePlanDraft,
  DecisionParams,
} from '../src/trips/decision/shared/world-model.types';

async function demoFullPipeline() {
  console.log('🇮🇸 Iceland Full Pipeline Demo\n');
  console.log('='.repeat(80));

  const app = await NestFactory.createApplicationContext(AppModule);
  const decisionEngine = app.get(TripDecisionEngineService);
  const orchestrator = app.get(StrategyOrchestratorService);
  const routeDirectionSelector = app.get(RouteDirectionSelectorService);

  try {
    // 1. 用户输入
    console.log('\n📝 Step 1: User Input');
    console.log('-'.repeat(80));
    const userIntent = {
      countryCode: 'IS',
      month: 7,
      preferences: ['自然', '摄影', '自驾'],
      riskTolerance: 'MEDIUM',
      pace: 'MODERATE',
    };
    console.log('User Intent:', JSON.stringify(userIntent, null, 2));

    // 2. RouteDirection 选择
    console.log('\n🗺️  Step 2: RouteDirection Selection');
    console.log('-'.repeat(80));
    const routeDirections = await routeDirectionSelector.pickRouteDirections(
      userIntent as any,
      'IS',
      7
    );
    if (routeDirections.length === 0) {
      console.log('❌ No route directions found');
      return;
    }
    const selectedRD = routeDirections[0];
    console.log(`Selected RouteDirection: ${(selectedRD as any).nameCN || selectedRD.routeDirection?.nameCN || 'N/A'} (${(selectedRD as any).name || selectedRD.routeDirection?.name || 'N/A'})`);
    console.log(`Score: ${selectedRD.score}`);
    console.log(`Explanation: ${(selectedRD as any).explanation || 'N/A'}`);

    // 3. 构建 WorldModelContext
    console.log('\n🌍 Step 3: Build WorldModelContext');
    console.log('-'.repeat(80));
    const decisionParams: DecisionParams = {
      maxDailyAscentM: 1000,
      rollingAscent3DaysM: 2500,
      maxSlopePct: 25,
      weatherRiskWeight: 0.7, // 冰岛天气权重高
      bufferDayBias: 'MEDIUM',
      riskTolerance: 'MEDIUM',
    };

    // 模拟 DEM 证据（实际应该从 DEM 服务获取）
    const demEvidence = [
      {
        segmentId: 'seg_1',
        elevationProfile: [100, 200, 300],
        cumulativeAscent: 200,
        maxSlopePct: 8,
        rollingAscent3Days: 200,
        fatigueIndex: 10,
        violation: 'NONE' as const,
        explanation: 'Segment 1: Normal ascent',
      },
      {
        segmentId: 'seg_2',
        elevationProfile: [300, 400, 500],
        cumulativeAscent: 200,
        maxSlopePct: 10,
        rollingAscent3Days: 400,
        fatigueIndex: 12,
        violation: 'NONE' as const,
        explanation: 'Segment 2: Normal ascent',
      },
    ];

    // 模拟天气证据（实际应该从天气服务获取）
    const weatherEvidence = [
      {
        segmentId: 'seg_1',
        windSpeedMs: 8,
        visibilityM: 10000,
        precipitationMm: 0,
        violation: 'NONE' as const,
      },
      {
        segmentId: 'seg_2',
        windSpeedMs: 10,
        visibilityM: 8000,
        precipitationMm: 2,
        violation: 'NONE' as const,
      },
    ];

    // 使用 LegacyWorldModelContext 类型（向后兼容）
    const world: LegacyWorldModelContext = {
      countryCode: 'IS',
      month: 7,
      decisionParams,
      demEvidence,
      weatherEvidence,
    };

    console.log('WorldModelContext created:');
    console.log(`- Country: ${world.countryCode}`);
    console.log(`- Month: ${world.month}`);
    console.log(`- DEM Evidence: ${world.demEvidence.length} segments`);
    console.log(`- Weather Evidence: ${world.weatherEvidence?.length || 0} segments`);

    // 4. 构建 RoutePlanDraft（模拟，实际应该从规划服务获取）
    console.log('\n🛣️  Step 4: Build RoutePlanDraft');
    console.log('-'.repeat(80));
    const plan: RoutePlanDraft = {
      tripId: `iceland_demo_${Date.now()}`,
      routeDirectionId: ((selectedRD as any).id || selectedRD.routeDirection?.id || '1').toString(),
      segments: [
        {
          segmentId: 'seg_1',
          dayIndex: 1,
          distanceKm: 120,
          ascentM: 200,
          slopePct: 5,
          metadata: {
            poiId: 'poi_entry_1',
            location: { lat: 64.1, lng: -21.9 },
          },
        },
        {
          segmentId: 'seg_2',
          dayIndex: 2,
          distanceKm: 150,
          ascentM: 300,
          slopePct: 8,
        },
        {
          segmentId: 'seg_3',
          dayIndex: 3,
          distanceKm: 180,
          ascentM: 500,
          slopePct: 12,
        },
      ],
    };

    console.log('RoutePlanDraft created:');
    console.log(`- Trip ID: ${plan.tripId}`);
    console.log(`- RouteDirection ID: ${plan.routeDirectionId}`);
    console.log(`- Segments: ${plan.segments.length} days`);

    // 5. Strategy Orchestrator 执行
    console.log('\n🧠 Step 5: Strategy Orchestrator Execution');
    console.log('-'.repeat(80));
    console.log('Executing: Abu → Dr.Dre → Neptune → Finalize\n');

    // 注意：orchestrator.run 需要 WorldModelContext，但这里使用的是 LegacyWorldModelContext
    // 需要转换为新的格式或使用兼容层
    const result = await orchestrator.run(world as any, plan);

    // 6. 输出结果
    console.log('\n✅ Step 6: Final Result');
    console.log('='.repeat(80));
    console.log(`Allowed: ${result.allowed}`);
    console.log(`Final Action: ${result.finalAction}`);
    console.log(`Plan: ${result.plan ? 'Updated' : 'Original'}`);

    // 7. Decision Logs
    console.log('\n📋 Step 7: Decision Logs');
    console.log('-'.repeat(80));
    for (const log of result.logs) {
      console.log(`\n[${log.persona}] ${log.action}`);
      console.log(`  Explanation: ${log.explanation}`);
      if (log.reasonCodes.length > 0) {
        console.log(`  Reason Codes: ${log.reasonCodes.join(', ')}`);
      }
      console.log(`  Timestamp: ${log.timestamp}`);
    }

    // 8. 最终计划摘要
    if (result.plan) {
      console.log('\n📊 Step 8: Final Plan Summary');
      console.log('-'.repeat(80));
      const daysMap = new Map<number, typeof plan.segments>();
      for (const seg of result.plan.segments) {
        const list = daysMap.get(seg.dayIndex) || [];
        list.push(seg);
        daysMap.set(seg.dayIndex, list);
      }

      for (const [dayIndex, segments] of Array.from(daysMap.entries()).sort(([a], [b]) => a - b)) {
        const totalKm = segments.reduce((sum, s) => sum + s.distanceKm, 0);
        const totalAscent = segments.reduce((sum, s) => sum + s.ascentM, 0);
        const isRestDay = segments.some(s => s.metadata?.type === 'REST_DAY');

        console.log(`\nDay ${dayIndex}:${isRestDay ? ' [REST DAY]' : ''}`);
        console.log(`  Distance: ${totalKm.toFixed(1)} km`);
        console.log(`  Ascent: ${totalAscent.toFixed(0)} m`);
        console.log(`  Segments: ${segments.length}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Full Pipeline Demo Completed');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Error in full pipeline demo:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// 运行演示
if (require.main === module) {
  demoFullPipeline()
    .then(() => {
      console.log('\n✅ Demo completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Demo failed:', error);
      process.exit(1);
    });
}

export { demoFullPipeline };

