#!/usr/bin/env tsx
/**
 * 测试冰岛 F 路的世界模型
 * 
 * 测试 WorldModelContext 的构建和验证
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WorldBuildContextSkill } from '../src/skills/world/world-build-context.skill';
import { validatePhysicalRealityModel } from '../src/trips/decision/models/physical-reality.model';
import { ICELAND_HIGHLANDS_PHILOSOPHY } from '../src/trips/decision/models/route-philosophy.model';
import * as fs from 'fs';
import * as path from 'path';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('========================================', 'blue');
  log('测试冰岛 F 路世界模型', 'blue');
  log('========================================', 'blue');
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule);
  const worldBuildContextSkill = app.get(WorldBuildContextSkill);

  try {
    // 测试参数：冰岛 F 路
    const testInput = {
      countryCode: 'IS',
      season: 7, // 7月（F路开放季节）
      duration: 8,
      partyProfile: {
        fitness: 'high' as const, // F路需要高体能
        pace: 'moderate' as const, // 'moderate' 会在内部映射到 'normal'
        riskTolerance: 'high' as const, // F路需要高风险承受度
      },
    };

    log('📋 测试参数:', 'yellow');
    console.log(JSON.stringify(testInput, null, 2));
    console.log('');

    // 1. 构建世界模型上下文
    log('步骤 1: 构建世界模型上下文...', 'cyan');
    const result = await worldBuildContextSkill.execute(testInput);
    const { world, missingPieces } = result;

    log('✅ 世界模型构建完成', 'green');
    console.log('');

    // 2. 验证 PhysicalRealityModel
    log('步骤 2: 验证 PhysicalRealityModel...', 'cyan');
    const physicalValidation = validatePhysicalRealityModel(world.physical);
    
    if (physicalValidation.valid) {
      log('✅ PhysicalRealityModel 验证通过', 'green');
    } else {
      log('⚠️ PhysicalRealityModel 验证失败', 'yellow');
      log(`缺失字段: ${physicalValidation.missingFields.join(', ')}`, 'yellow');
    }
    console.log('');

    // 3. 显示世界模型详情
    log('步骤 3: 世界模型详情', 'cyan');
    console.log('');

    // 3.1 PhysicalRealityModel
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    log('PhysicalRealityModel（物理现实模型）', 'blue');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    console.log(`国家代码: ${world.physical.countryCode}`);
    console.log(`月份: ${world.physical.month}`);
    console.log(`DEM 证据数量: ${world.physical.demEvidence.length}`);
    console.log(`道路状态数量: ${world.physical.roadStates.length}`);
    console.log(`危险区域数量: ${world.physical.hazardZones.length}`);
    console.log(`渡轮状态数量: ${world.physical.ferryStates.length}`);
    
    if (world.physical.climateSeasonality) {
      console.log(`气候季节性: 可达性评分 ${world.physical.climateSeasonality.accessibilityScore}`);
    }

    // 显示 DEM 证据详情
    if (world.physical.demEvidence.length > 0) {
      console.log('\nDEM 证据:');
      world.physical.demEvidence.slice(0, 3).forEach((evidence, idx) => {
        console.log(`  [${idx + 1}] Segment: ${evidence.segmentId}`);
        console.log(`      累计爬升: ${evidence.cumulativeAscent}m`);
        console.log(`      最大坡度: ${evidence.maxSlopePct}%`);
        console.log(`      滚动爬升(3天): ${evidence.rollingAscent3Days}m`);
        console.log(`      疲劳指数: ${evidence.fatigueIndex}`);
        console.log(`      违规级别: ${evidence.violation}`);
        console.log(`      说明: ${evidence.explanation}`);
      });
    }

    // 显示道路状态详情
    if (world.physical.roadStates.length > 0) {
      console.log('\n道路状态:');
      world.physical.roadStates.slice(0, 5).forEach((road, idx) => {
        console.log(`  [${idx + 1}] ${road.roadId}: ${road.status}`);
        if (road.seasonOpenFrom && road.seasonOpenTo) {
          console.log(`      季节性开放: ${road.seasonOpenFrom}-${road.seasonOpenTo}月`);
        }
        if (road.requires4x4) {
          console.log(`      需要4x4: 是`);
        }
        if (road.requiresPermit) {
          console.log(`      需要许可证: 是`);
        }
      });
    }

    // 显示危险区域详情
    if (world.physical.hazardZones.length > 0) {
      console.log('\n危险区域:');
      world.physical.hazardZones.slice(0, 5).forEach((zone, idx) => {
        console.log(`  [${idx + 1}] ${zone.zoneId}: ${zone.type} - ${zone.level}`);
        if (zone.seasonality) {
          console.log(`      高风险月份: ${zone.seasonality.highRiskMonths.join(', ')}`);
        }
      });
    }

    console.log('');

    // 3.2 HumanCapabilityModel
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    log('HumanCapabilityModel（人体能力模型）', 'blue');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    console.log(`用户画像 ID: ${world.human.profileId}`);
    console.log(`单日最大爬升: ${world.human.maxDailyAscentM}m`);
    console.log(`连续3天滚动爬升阈值: ${world.human.rollingAscent3DaysM}m`);
    console.log(`最大可接受坡度: ${world.human.maxSlopePct}%`);
    console.log(`节奏偏好: ${world.human.preferredPace}`);
    console.log(`风险承受度: ${world.human.riskTolerance}`);
    console.log(`高海拔经验: ${world.human.highAltitudeExperience}`);
    if (world.human.maxElevationM) {
      console.log(`最大海拔: ${world.human.maxElevationM}m`);
    }
    if (world.human.requiresGradualAscent !== undefined) {
      console.log(`需要渐进适应: ${world.human.requiresGradualAscent ? '是' : '否'}`);
    }
    if (world.human.bufferDayBias) {
      console.log(`缓冲日偏好: ${world.human.bufferDayBias}`);
    }
    if (world.human.weatherRiskWeight !== undefined) {
      console.log(`天气风险权重: ${world.human.weatherRiskWeight}`);
    }
    console.log('');

    // 3.3 RouteDirection
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    log('RouteDirection（路线方向）', 'blue');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    if (world.routeDirection) {
      console.log(`路线名称: ${world.routeDirection.nameCN || world.routeDirection.name}`);
      console.log(`国家代码: ${world.routeDirection.countryCode}`);
      console.log(`标签: ${world.routeDirection.tags?.join(', ') || '无'}`);
      console.log(`区域: ${world.routeDirection.regions?.join(', ') || '无'}`);
      
      if (world.routeDirection.seasonality) {
        console.log(`最佳月份: ${world.routeDirection.seasonality.bestMonths?.join(', ') || '无'}`);
        console.log(`避免月份: ${world.routeDirection.seasonality.avoidMonths?.join(', ') || '无'}`);
      }

      if (world.routeDirection.narrative) {
        console.log(`路线哲学: ${world.routeDirection.narrative.philosophy || world.routeDirection.narrative.internal || '无'}`);
      }

      // 检查是否有路线哲学
      const philosophy = (world.routeDirection as any).philosophy;
      if (philosophy) {
        console.log('\n路线哲学详情:');
        if (typeof philosophy === 'string') {
          console.log(`  核心陈述: ${philosophy}`);
        } else {
          console.log(`  核心陈述: ${philosophy.coreStatement || '无'}`);
          console.log(`  必须体验类型: ${philosophy.mustVisitTags?.join(', ') || '无'}`);
          console.log(`  不可协商规则: ${philosophy.nonNegotiableRules?.join('; ') || '无'}`);
          console.log(`  可灵活调整部分: ${philosophy.flexibleParts?.join('; ') || '无'}`);
        }
      }
    } else {
      log('⚠️ RouteDirection 未找到', 'yellow');
    }
    console.log('');

    // 3.4 ComplianceEvidence
    if (world.complianceEvidence && world.complianceEvidence.length > 0) {
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
      log('ComplianceEvidence（合规证据）', 'blue');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
      world.complianceEvidence.forEach((evidence, idx) => {
        console.log(`  [${idx + 1}] 需要许可证: ${evidence.requiresPermit ? '是' : '否'}`);
        console.log(`      需要向导: ${evidence.requiresGuide ? '是' : '否'}`);
        console.log(`      有效: ${evidence.valid ? '是' : '否'}`);
        console.log(`      违规级别: ${evidence.violation}`);
      });
      console.log('');
    }

    // 4. 缺失数据片段
    log('步骤 4: 缺失数据片段检查', 'cyan');
    if (Object.keys(missingPieces).length === 0) {
      log('✅ 所有数据完整', 'green');
    } else {
      log('⚠️ 存在缺失数据:', 'yellow');
      if (missingPieces.demGaps) {
        console.log(`  - DEM 缺口: ${missingPieces.demGaps.join(', ')}`);
      }
      if (missingPieces.humanProfileIncomplete) {
        console.log(`  - 人体能力模型不完整`);
      }
      if (missingPieces.routeDirectionMissing) {
        console.log(`  - 路线方向缺失`);
      }
      if (missingPieces.physicalRealityIncomplete) {
        console.log(`  - 物理现实模型不完整`);
      }
    }
    console.log('');

    // 5. 验证世界模型完整性
    log('步骤 5: 验证世界模型完整性', 'cyan');
    const isValid = 
      world.physical &&
      world.human &&
      world.routeDirection &&
      physicalValidation.valid;

    if (isValid) {
      log('✅ 世界模型完整且有效', 'green');
    } else {
      log('⚠️ 世界模型不完整或无效', 'yellow');
    }
    console.log('');

    // 6. 测试路线哲学验证
    log('步骤 6: 测试路线哲学验证', 'cyan');
    if (world.routeDirection && (world.routeDirection as any).philosophy) {
      const philosophy = typeof (world.routeDirection as any).philosophy === 'string'
        ? ICELAND_HIGHLANDS_PHILOSOPHY
        : (world.routeDirection as any).philosophy;

      if (philosophy && typeof philosophy === 'object') {
        console.log(`核心陈述: "${philosophy.coreStatement}"`);
        console.log(`必须体验类型: ${philosophy.mustVisitTags?.join(', ') || '无'}`);
        console.log(`不可协商规则数量: ${philosophy.nonNegotiableRules?.length || 0}`);
        console.log(`可灵活调整部分数量: ${philosophy.flexibleParts?.length || 0}`);
        log('✅ 路线哲学已加载', 'green');
      }
    } else {
      log('⚠️ 路线哲学未找到，使用默认冰岛高地哲学', 'yellow');
      console.log(`核心陈述: "${ICELAND_HIGHLANDS_PHILOSOPHY.coreStatement}"`);
      console.log(`必须体验类型: ${ICELAND_HIGHLANDS_PHILOSOPHY.mustVisitTags.join(', ')}`);
      console.log(`不可协商规则: ${ICELAND_HIGHLANDS_PHILOSOPHY.nonNegotiableRules.join('; ')}`);
    }
    console.log('');

    // 7. 输出 JSON 摘要
    log('步骤 7: 生成 JSON 摘要', 'cyan');
    const summary = {
      timestamp: new Date().toISOString(),
      testParams: testInput,
      worldModel: {
        physical: {
          countryCode: world.physical.countryCode,
          month: world.physical.month,
          demEvidenceCount: world.physical.demEvidence.length,
          roadStatesCount: world.physical.roadStates.length,
          hazardZonesCount: world.physical.hazardZones.length,
          ferryStatesCount: world.physical.ferryStates.length,
          hasClimateSeasonality: !!world.physical.climateSeasonality,
        },
        human: {
          profileId: world.human.profileId,
          maxDailyAscentM: world.human.maxDailyAscentM,
          rollingAscent3DaysM: world.human.rollingAscent3DaysM,
          maxSlopePct: world.human.maxSlopePct,
          preferredPace: world.human.preferredPace,
          riskTolerance: world.human.riskTolerance,
          highAltitudeExperience: world.human.highAltitudeExperience,
        },
        routeDirection: {
          name: world.routeDirection?.name || world.routeDirection?.nameCN,
          countryCode: world.routeDirection?.countryCode,
          hasPhilosophy: !!(world.routeDirection as any)?.philosophy,
        },
        complianceEvidenceCount: world.complianceEvidence?.length || 0,
      },
      validation: {
        physicalRealityValid: physicalValidation.valid,
        missingFields: physicalValidation.missingFields,
        missingPieces,
        overallValid: isValid,
      },
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log('');

    log('========================================', 'blue');
    log('测试完成', 'green');
    log('========================================', 'blue');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
