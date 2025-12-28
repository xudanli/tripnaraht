#!/usr/bin/env ts-node
/**
 * 冰岛高地 E2E Demo 命令
 * 
 * 用法: npm run demo:iceland-highlands
 * 
 * 内部执行步骤：
 * 1. 构造一个 WorldModelContext（典型 8 月用户画像）
 * 2. 跑 decision engine
 * 3. 输出：
 *    - 简要行程
 *    - 决策日志（按 persona + decisionSource 排序）
 *    - 一个可读的 Markdown 报告
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StrategyOrchestratorService } from '../src/trips/decision/services/strategy-orchestrator.service';
import { RouteDirectionSelectorService } from '../src/route-directions/services/route-direction-selector.service';
import {
  WorldModelContext,
  RoutePlanDraft,
  RouteSegment,
} from '../src/trips/decision/shared/world-model.types';
import { UserIntent } from '../src/route-directions/services/route-direction-selector.service';
import { createHumanCapabilityModelFromProfile } from '../src/trips/decision/models/human-capability.model';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

async function demoIcelandHighlands() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const orchestrator = app.get(StrategyOrchestratorService);
  const rdSelector = app.get(RouteDirectionSelectorService);

  console.log('🚀 冰岛高地 E2E Demo');
  console.log('='.repeat(80));

  try {
    // 1. 构造 WorldModelContext（典型 8 月用户画像）
    console.log('\n👤 Step 1: 构造 WorldModelContext');
    console.log('-'.repeat(80));

    const userIntent: UserIntent = {
      preferences: ['摄影', '自然', '冒险'],
      riskTolerance: 'medium',
      travelStyle: 'ADVENTURE',
    };

    const countryCode = 'IS';
    const month = 8; // August

    const human = createHumanCapabilityModelFromProfile('demo-user', {
      pace: 'normal',
      fitness: 'medium',
      riskTolerance: 'medium',
      highAltitudeExperience: 'basic',
    });

    // 选择 RouteDirection
    const routeDirections = await rdSelector.pickRouteDirections(
      userIntent,
      countryCode,
      month
    );

    if (routeDirections.length === 0) {
      console.log('❌ 未找到合适的路线方向');
      return;
    }

    const selectedRD = routeDirections[0].routeDirection;

    // 构造 PhysicalRealityModel（简化版）
    const physical = {
      demEvidence: [
        {
          segmentId: 'DAY1_SEG1',
          elevationProfile: [500, 650, 700],
          cumulativeAscent: 350,
          maxSlopePct: 18,
          rollingAscent3Days: 350,
          fatigueIndex: 0.8,
          violation: 'NONE' as 'HARD' | 'SOFT' | 'NONE',
          explanation: '第一天爬升正常',
        },
        {
          segmentId: 'DAY2_SEG1',
          elevationProfile: [700, 900, 950],
          cumulativeAscent: 400,
          maxSlopePct: 22,
          rollingAscent3Days: 750,
          fatigueIndex: 1.0,
          violation: 'NONE' as 'HARD' | 'SOFT' | 'NONE',
          explanation: '第二天爬升正常',
        },
      ],
      roadStates: [
        {
          roadId: 'F26',
          status: 'OPEN' as 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED',
          requires4x4: true,
          seasonOpenFrom: 6,
          seasonOpenTo: 9,
        },
      ],
      hazardZones: [
        {
          zoneId: 'hazard_1',
          type: 'AVALANCHE' as 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER',
          level: 'LOW' as 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
          seasonality: {
            highRiskMonths: [11, 12, 1, 2, 3],
            lowRiskMonths: [6, 7, 8, 9],
          },
        },
      ],
      ferryStates: [],
      climateSeasonality: {
        countryCode: 'IS',
        month: 8,
        accessibilityScore: 0.9,
        typicalWeather: {
          windSpeedMps: 8,
          precipitationMmPerHour: 2,
          visibilityMeters: 5000,
          temperatureCelsius: 12,
        },
      },
      countryCode: 'IS',
      month: 8,
    };

    const world: WorldModelContext = {
      physical,
      human,
      routeDirection: selectedRD,
      complianceEvidence: [],
    };

    console.log(`✅ WorldModelContext 构造完成`);
    console.log(`   路线方向: ${selectedRD.nameCN}`);
    console.log(`   用户画像: ${human.preferredPace} 节奏, ${human.riskTolerance} 风险承受度`);

    // 2. 构造初始计划
    console.log('\n🛣️ Step 2: 构造初始计划');
    console.log('-'.repeat(80));

    const initialSegments: RouteSegment[] = [
      {
        segmentId: 'DAY1_SEG1',
        dayIndex: 1,
        distanceKm: 16,
        ascentM: 350,
        slopePct: 18,
        metadata: {
          fromPoiId: 'landmannalaugar',
          toPoiId: 'camp_site_A',
          mode: 'HIKING',
        },
      },
      {
        segmentId: 'DAY2_SEG1',
        dayIndex: 2,
        distanceKm: 18,
        ascentM: 400,
        slopePct: 22,
        metadata: {
          fromPoiId: 'camp_site_A',
          toPoiId: 'sprengisandur_viewpoint',
          mode: '4X4',
        },
      },
      {
        segmentId: 'DAY3_SEG1',
        dayIndex: 3,
        distanceKm: 14,
        ascentM: 200,
        slopePct: 15,
        metadata: {
          fromPoiId: 'sprengisandur_viewpoint',
          toPoiId: 'south_coast_town',
          mode: '4X4',
        },
      },
    ];

    const initialPlan: RoutePlanDraft = {
      tripId: randomUUID(),
      routeDirectionId: selectedRD.name,
      segments: initialSegments,
    };

    console.log(`✅ 初始计划构造完成（${initialSegments.length} 个路段）`);

    // 3. 运行决策引擎
    console.log('\n🧠 Step 3: 运行决策引擎（Abu → Dr.Dre → Neptune）');
    console.log('-'.repeat(80));

    const { plan: finalPlan, logs } = await orchestrator.run(world, initialPlan);

    if (!finalPlan) {
      console.log('❌ 计划被拒绝');
      console.log('\n决策日志:');
      logs.forEach(log => {
        console.log(`  [${log.persona}] ${log.action}: ${log.explanation}`);
      });
      return;
    }

    console.log(`✅ 决策引擎执行完成`);

    // 4. 生成报告
    console.log('\n📊 Step 4: 生成报告');
    console.log('-'.repeat(80));

    const report = generateReport(world, initialPlan, finalPlan, logs);
    console.log(report);

    // 5. 保存报告到文件
    const reportPath = path.join(process.cwd(), 'iceland-highlands-demo-report.md');
    await fs.writeFile(reportPath, report);
    console.log(`\n✅ 报告已保存到: ${reportPath}`);

  } catch (error) {
    console.error('❌ Demo 失败:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

function generateReport(
  world: WorldModelContext,
  initialPlan: RoutePlanDraft,
  finalPlan: RoutePlanDraft,
  logs: any[]
): string {
  const bySource = {
    PHYSICAL: logs.filter(l => l.decisionSource === 'PHYSICAL').length,
    HUMAN: logs.filter(l => l.decisionSource === 'HUMAN').length,
    PHILOSOPHY: logs.filter(l => l.decisionSource === 'PHILOSOPHY').length,
    HEURISTIC: logs.filter(l => l.decisionSource === 'HEURISTIC').length,
  };

  const realityDrivenRatio = (bySource.PHYSICAL + bySource.HUMAN) / logs.length;

  return `
# 冰岛高地 E2E Demo 报告

生成时间: ${new Date().toISOString()}

## 输入

### 用户画像
- **节奏偏好**: ${world.human.preferredPace}
- **风险承受度**: ${world.human.riskTolerance}
- **单日最大爬升**: ${world.human.maxDailyAscentM}m
- **连续 3 天滚动爬升阈值**: ${world.human.rollingAscent3DaysM}m

### 路线方向
- **名称**: ${world.routeDirection.nameCN}
- **国家**: ${world.routeDirection.countryCode}
- **最佳月份**: ${(world.routeDirection.seasonality as any)?.bestMonths?.join(', ') || 'N/A'}

## 计划对比

### 初始计划
- **路段数**: ${initialPlan.segments.length}
- **总距离**: ${initialPlan.segments.reduce((sum, s) => sum + s.distanceKm, 0).toFixed(1)}km
- **总爬升**: ${initialPlan.segments.reduce((sum, s) => sum + s.ascentM, 0)}m

### 最终计划
- **路段数**: ${finalPlan.segments.length}
- **总距离**: ${finalPlan.segments.reduce((sum, s) => sum + s.distanceKm, 0).toFixed(1)}km
- **总爬升**: ${finalPlan.segments.reduce((sum, s) => sum + s.ascentM, 0)}m

## 决策日志

${logs.map((log, index) => `
### ${index + 1}. [${log.persona}] ${log.action}

- **决策来源**: ${log.decisionSource}
- **原因代码**: ${log.reasonCodes.join(', ') || 'N/A'}
- **解释**: ${log.explanation}
- **时间**: ${log.timestamp}
`).join('\n')}

## 决策统计

### 决策来源分布

| 来源 | 数量 | 占比 |
|------|------|------|
| PHYSICAL | ${bySource.PHYSICAL} | ${((bySource.PHYSICAL / logs.length) * 100).toFixed(1)}% |
| HUMAN | ${bySource.HUMAN} | ${((bySource.HUMAN / logs.length) * 100).toFixed(1)}% |
| PHILOSOPHY | ${bySource.PHILOSOPHY} | ${((bySource.PHILOSOPHY / logs.length) * 100).toFixed(1)}% |
| HEURISTIC | ${bySource.HEURISTIC} | ${((bySource.HEURISTIC / logs.length) * 100).toFixed(1)}% |

### 关键指标

- **总决策数**: ${logs.length}
- **硬现实驱动比例**: ${(realityDrivenRatio * 100).toFixed(1)}%

## 结论

TripNARA 的冰岛高地 E2E 决策中，${(realityDrivenRatio * 100).toFixed(1)}% 的关键决策来自物理现实建模和人体能力建模，而不是启发式规则。

这证明了 TripNARA 是一个按世界真实规律思考的旅行智能，而不是一个"看上去懂旅行的 LLM Wrapper"。
`;
}

if (require.main === module) {
  demoIcelandHighlands().catch(console.error);
}

