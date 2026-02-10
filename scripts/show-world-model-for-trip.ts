#!/usr/bin/env tsx
/**
 * 展示指定 Trip 的世界模型
 * 
 * 使用 world.buildContext skill 构建世界模型并展示
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WorldBuildContextSkill } from '../src/skills/world/world-build-context.skill';
import { validatePhysicalRealityModel } from '../src/trips/decision/models/physical-reality.model';

const tripId = process.argv[2] || '';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  if (!tripId) {
    log('❌ 请提供 Trip ID', 'red');
    console.log('用法: npx tsx scripts/show-world-model-for-trip.ts <trip-id>');
    process.exit(1);
  }

  log('========================================', 'blue');
  log(`展示 Trip ${tripId} 的世界模型`, 'blue');
  log('========================================', 'blue');
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule);
  const worldBuildContextSkill = app.get(WorldBuildContextSkill);

  try {
    // 构建世界模型
    log('步骤 1: 构建世界模型...', 'cyan');
    const worldModelResult = await worldBuildContextSkill.execute({
      tripId: tripId,
    });
    const { world, missingPieces } = worldModelResult;

    log('✅ 世界模型构建完成', 'green');
    console.log('');

    // 展示世界模型
    log('========================================', 'blue');
    log('世界模型详情', 'blue');
    log('========================================', 'blue');
    console.log('');

    // 1. PhysicalRealityModel
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
    log('PhysicalRealityModel（物理现实模型）', 'magenta');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
    console.log(`国家代码: ${world.physical.countryCode}`);
    console.log(`月份: ${world.physical.month} (${world.physical.month === 7 ? 'F路开放季节' : world.physical.month >= 6 && world.physical.month <= 9 ? '可能开放' : '可能关闭'})`);
    console.log(`DEM 证据数量: ${world.physical.demEvidence.length}`);
    console.log(`道路状态数量: ${world.physical.roadStates.length}`);
    console.log(`危险区域数量: ${world.physical.hazardZones.length}`);
    console.log(`渡轮状态数量: ${world.physical.ferryStates.length}`);
    
    if (world.physical.climateSeasonality) {
      console.log(`气候季节性: 可达性评分 ${world.physical.climateSeasonality.accessibilityScore}`);
    }

    // DEM 证据详情
    if (world.physical.demEvidence.length > 0) {
      console.log('\nDEM 证据:');
      world.physical.demEvidence.slice(0, 5).forEach((evidence, idx) => {
        console.log(`  [${idx + 1}] Segment: ${evidence.segmentId}`);
        if (evidence.segmentId.includes('placeholder')) {
          console.log(`      ⚠️ 占位符数据（需要从路线段计算）`);
        } else {
          console.log(`      累计爬升: ${evidence.cumulativeAscent}m`);
          console.log(`      最大坡度: ${evidence.maxSlopePct}%`);
          console.log(`      滚动爬升(3天): ${evidence.rollingAscent3Days}m`);
          console.log(`      疲劳指数: ${evidence.fatigueIndex}`);
        }
        console.log(`      违规级别: ${evidence.violation}`);
        console.log(`      说明: ${evidence.explanation}`);
      });
      if (world.physical.demEvidence.length > 5) {
        console.log(`  ... 还有 ${world.physical.demEvidence.length - 5} 个 DEM 证据`);
      }
    } else {
      log('  ⚠️ 没有 DEM 证据（需要生成）', 'yellow');
    }

    // 道路状态详情（F 路）
    const fRoads = world.physical.roadStates.filter(r => r.roadId.startsWith('F'));
    if (fRoads.length > 0) {
      console.log(`\nF 路状态 (${fRoads.length} 条):`);
      fRoads.slice(0, 10).forEach((road, idx) => {
        const roadName = road.metadata?.roadName || road.metadata?.name || '';
        console.log(`  [${idx + 1}] ${road.roadId}${roadName ? ` - ${roadName}` : ''}`);
        console.log(`      状态: ${road.status}`);
        if (road.seasonOpenFrom && road.seasonOpenTo) {
          const isOpenInMonth = world.physical.month >= road.seasonOpenFrom && 
                               world.physical.month <= road.seasonOpenTo;
          console.log(`      季节性开放: ${road.seasonOpenFrom}-${road.seasonOpenTo}月 ${isOpenInMonth ? '✅' : '❌'}`);
        }
        console.log(`      需要4x4: ${road.requires4x4 ? '是' : '否'}`);
        const hazards = road.metadata?.hazards || road.metadata?.hazardTypes || [];
        if (hazards && hazards.length > 0) {
          console.log(`      危险: ${Array.isArray(hazards) ? hazards.join(', ') : hazards}`);
        }
      });
      if (fRoads.length > 10) {
        console.log(`  ... 还有 ${fRoads.length - 10} 条 F 路`);
      }
    }

    // 危险区域详情
    if (world.physical.hazardZones.length > 0) {
      console.log(`\n危险区域 (${world.physical.hazardZones.length} 个):`);
      world.physical.hazardZones.slice(0, 10).forEach((zone, idx) => {
        console.log(`  [${idx + 1}] ${zone.zoneId}: ${zone.type} - ${zone.level}`);
        const description = zone.metadata?.description || zone.metadata?.note || '';
        if (description) {
          console.log(`      描述: ${description}`);
        }
      });
      if (world.physical.hazardZones.length > 10) {
        console.log(`  ... 还有 ${world.physical.hazardZones.length - 10} 个危险区域`);
      }
    }
    console.log('');

    // 2. HumanCapabilityModel
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
    log('HumanCapabilityModel（人体能力模型）', 'magenta');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
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
    console.log('');

    // 3. RouteDirection
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
    log('RouteDirection（路线方向）', 'magenta');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
    if (world.routeDirection) {
      console.log(`路线名称: ${world.routeDirection.nameCN || world.routeDirection.name}`);
      console.log(`国家代码: ${world.routeDirection.countryCode}`);
      console.log(`标签: ${world.routeDirection.tags?.join(', ') || '无'}`);
      
      if (world.routeDirection.seasonality) {
        console.log(`最佳月份: ${world.routeDirection.seasonality.bestMonths?.join(', ') || '无'}`);
        console.log(`避免月份: ${world.routeDirection.seasonality.avoidMonths?.join(', ') || '无'}`);
      }

      if (world.routeDirection.narrative) {
        const philosophy = (world.routeDirection.narrative as any).philosophy || 
                          world.routeDirection.narrative.internal || 
                          '无';
        console.log(`路线哲学: ${philosophy}`);
      }
    } else {
      log('⚠️ RouteDirection 未找到', 'yellow');
    }
    console.log('');

    // 4. 验证世界模型
    log('步骤 2: 验证世界模型...', 'cyan');
    const physicalValidation = validatePhysicalRealityModel(world.physical);
    
    if (physicalValidation.valid) {
      log('✅ PhysicalRealityModel 验证通过', 'green');
    } else {
      log('⚠️ PhysicalRealityModel 验证失败', 'yellow');
      console.log(`缺失字段: ${physicalValidation.missingFields.join(', ')}`);
    }

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

    // 5. 生成 JSON 摘要
    log('步骤 3: 生成 JSON 摘要...', 'cyan');
    const summary = {
      timestamp: new Date().toISOString(),
      tripId: tripId,
      worldModel: {
        physical: {
          countryCode: world.physical.countryCode,
          month: world.physical.month,
          demEvidenceCount: world.physical.demEvidence.length,
          roadStatesCount: world.physical.roadStates.length,
          fRoadsCount: fRoads.length,
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
          name: world.routeDirection?.nameCN || world.routeDirection?.name,
          countryCode: world.routeDirection?.countryCode,
          hasPhilosophy: !!(world.routeDirection as any)?.philosophy,
        },
      },
      validation: {
        physicalRealityValid: physicalValidation.valid,
        missingFields: physicalValidation.missingFields,
        missingPieces,
      },
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log('');

    // 6. 总结
    log('========================================', 'blue');
    log('✅ 世界模型展示完成', 'green');
    log('========================================', 'blue');
    console.log('');
    console.log(`📋 Trip ID: ${tripId}`);
    console.log('');
    console.log('🌍 世界模型状态:');
    console.log(`  - PhysicalRealityModel: ${physicalValidation.valid ? '✅' : '⚠️'}`);
    console.log(`  - HumanCapabilityModel: ✅`);
    console.log(`  - RouteDirection: ${world.routeDirection ? '✅' : '⚠️'}`);
    console.log('');
    console.log('💡 下一步:');
    console.log(`  1. 生成 DEM 证据: POST /api/itinerary-items/trip/${tripId}/days/:dayId/calculate-travel`);
    console.log(`  2. 查询行程详情: GET /api/trips/${tripId}`);
    console.log(`  3. 查看行程项: GET /api/itinerary-items?tripId=${tripId}`);

  } catch (error: any) {
    log(`❌ 操作失败: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
