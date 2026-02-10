#!/usr/bin/env tsx
/**
 * 直接测试冰岛 F 路世界模型（不依赖 NestJS 应用上下文）
 * 
 * 读取数据文件并构建世界模型结构
 */

import * as fs from 'fs';
import * as path from 'path';
import { ICELAND_HIGHLANDS_PHILOSOPHY } from '../src/trips/decision/models/route-philosophy.model';
import { createHumanCapabilityModelFromProfile } from '../src/trips/decision/models/human-capability.model';
import { PhysicalRealityModel } from '../src/trips/decision/models/physical-reality.model';
import { validatePhysicalRealityModel } from '../src/trips/decision/models/physical-reality.model';

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

interface RoadStatusData {
  roadId: string;
  roadName: string;
  roadType: string;
  status: string;
  currentStatus: string;
  season?: {
    openMonths: number[];
  };
  requirements?: {
    vehicleType: string;
    experience: string;
  };
  hazards?: Array<{
    type: string;
    severity: string;
  }>;
}

function loadRoadStatusData(): RoadStatusData[] {
  const filePath = path.join(__dirname, '../data/physical-reality/road-status/iceland-road-status.json');
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  return data.roads || [];
}

function loadWeatherWindowsData(): any {
  const filePath = path.join(__dirname, '../data/physical-reality/weather-windows/iceland-weather-windows.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function loadFerrySchedulesData(): any {
  const filePath = path.join(__dirname, '../data/physical-reality/ferry-schedules/iceland-ferry-schedules.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

async function main() {
  log('========================================', 'blue');
  log('测试冰岛 F 路世界模型', 'blue');
  log('========================================', 'blue');
  console.log('');

  // 测试参数
  const countryCode = 'IS';
  const month = 7; // 7月（F路开放季节）
  const partyProfile = {
    fitness: 'high' as const,
    pace: 'normal' as const, // 'moderate' 映射到 'normal'
    riskTolerance: 'high' as const,
  };

  log('📋 测试参数:', 'yellow');
  console.log(`国家代码: ${countryCode}`);
  console.log(`月份: ${month} (${month === 7 ? 'F路开放季节' : '可能关闭'})`);
  console.log(`团队画像: ${JSON.stringify(partyProfile, null, 2)}`);
  console.log('');

  // 1. 构建 HumanCapabilityModel
  log('步骤 1: 构建 HumanCapabilityModel（人体能力模型）...', 'cyan');
  const human = createHumanCapabilityModelFromProfile('iceland-froad-tester', partyProfile);
  
  log('✅ HumanCapabilityModel 构建完成', 'green');
  console.log(`  用户画像 ID: ${human.profileId}`);
  console.log(`  单日最大爬升: ${human.maxDailyAscentM}m`);
  console.log(`  连续3天滚动爬升阈值: ${human.rollingAscent3DaysM}m`);
  console.log(`  最大可接受坡度: ${human.maxSlopePct}%`);
  console.log(`  节奏偏好: ${human.preferredPace}`);
  console.log(`  风险承受度: ${human.riskTolerance}`);
  console.log(`  高海拔经验: ${human.highAltitudeExperience}`);
  if (human.maxElevationM) {
    console.log(`  最大海拔: ${human.maxElevationM}m`);
  }
  console.log('');

  // 2. 加载物理现实数据
  log('步骤 2: 加载 PhysicalRealityModel（物理现实模型）数据...', 'cyan');
  
  const roadStatusData = loadRoadStatusData();
  const weatherWindowsData = loadWeatherWindowsData();
  const ferrySchedulesData = loadFerrySchedulesData();

  log(`✅ 加载了 ${roadStatusData.length} 条道路状态`, 'green');
  log(`${weatherWindowsData ? '✅' : '⚠️'} 天气窗口数据: ${weatherWindowsData ? '已加载' : '未找到'}`, weatherWindowsData ? 'green' : 'yellow');
  log(`${ferrySchedulesData ? '✅' : '⚠️'} 渡轮时刻表: ${ferrySchedulesData ? '已加载' : '未找到'}`, ferrySchedulesData ? 'green' : 'yellow');
  console.log('');

  // 3. 构建 PhysicalRealityModel
  log('步骤 3: 构建 PhysicalRealityModel...', 'cyan');
  
  // 转换道路状态
  const roadStates = roadStatusData
    .filter(road => road.roadType === 'F-road')
    .map(road => ({
      roadId: road.roadId,
      status: road.currentStatus === 'open' ? 'OPEN' as const :
              road.currentStatus === 'closed' ? 'CLOSED' as const :
              road.status === 'seasonal' ? 'SEASONAL' as const : 'RESTRICTED' as const,
      seasonOpenFrom: road.season?.openMonths?.[0],
      seasonOpenTo: road.season?.openMonths?.[road.season.openMonths.length - 1],
      requires4x4: road.requirements?.vehicleType === '4x4_required',
      requiresPermit: false, // 从数据中提取
      metadata: {
        roadName: road.roadName,
        requirements: road.requirements,
        hazards: road.hazards,
      },
    }));

  // 提取危险区域（从道路的 hazards）
  const hazardZones: any[] = [];
  roadStatusData.forEach(road => {
    if (road.hazards) {
      road.hazards.forEach((hazard, idx) => {
        hazardZones.push({
          zoneId: `${road.roadId}_hazard_${idx}`,
          type: hazard.type === 'river_crossing' ? 'FLOOD' as const :
                hazard.type === 'remote_area' ? 'OTHER' as const :
                hazard.type === 'weather_dependent' ? 'ICE' as const : 'OTHER' as const,
          level: hazard.severity === 'high' ? 'HIGH' as const :
                 hazard.severity === 'medium' ? 'MEDIUM' as const : 'LOW' as const,
          segmentId: road.roadId,
          seasonality: {
            highRiskMonths: road.season?.openMonths || [],
            lowRiskMonths: [],
          },
          metadata: {
            description: hazard.type,
            roadId: road.roadId,
          },
        });
      });
    }
  });

  // 转换渡轮状态
  const ferryStates: any[] = [];
  if (ferrySchedulesData && ferrySchedulesData.ferries) {
    ferrySchedulesData.ferries.forEach((ferry: any) => {
      ferryStates.push({
        ferryId: ferry.ferryId || `ferry_${Date.now()}`,
        routeId: ferry.routeId || ferry.routeName,
        status: ferry.status === 'running' ? 'RUNNING' as const :
                ferry.status === 'cancelled' ? 'CANCELLED' as const : 'SEASONAL' as const,
        seasonOpenFrom: ferry.season?.openMonths?.[0],
        seasonOpenTo: ferry.season?.openMonths?.[ferry.season.openMonths.length - 1],
        metadata: ferry,
      });
    });
  }

  // 提取气候季节性（7月）
  let climateSeasonality: any = undefined;
  if (weatherWindowsData && weatherWindowsData.regions) {
    // 查找7月的天气窗口
    for (const region of weatherWindowsData.regions) {
      if (region.bestWindows) {
        for (const window of region.bestWindows) {
          if (window.months && window.months.includes(month)) {
            climateSeasonality = {
              countryCode,
              month,
              accessibilityScore: 0.8, // 从窗口数据推断
              typicalWeather: window.temperature ? {
                windSpeedMps: window.wind?.avg || 8,
                precipitationMmPerHour: (window.precipitation?.avg || 50) / 720, // 转换为每小时
                visibilityMeters: 10000, // 默认值
                temperatureCelsius: window.temperature.avg || 12,
              } : undefined,
              riskFactors: [],
              metadata: {
                region: region.regionName,
                window: window,
              },
            };
            break;
          }
        }
        if (climateSeasonality) break;
      }
    }
  }

  // 构建 PhysicalRealityModel（使用占位符 DEM 证据）
  const physical: PhysicalRealityModel = {
    demEvidence: [
      {
        segmentId: 'placeholder_froad_segment',
        elevationProfile: [],
        cumulativeAscent: 0,
        maxSlopePct: 0,
        rollingAscent3Days: 0,
        fatigueIndex: 0,
        violation: 'NONE',
        explanation: '占位符：实际 DEM 证据需要从路线段计算',
      },
    ],
    roadStates,
    hazardZones,
    ferryStates,
    countryCode,
    month,
    climateSeasonality,
  };

  log(`✅ PhysicalRealityModel 构建完成`, 'green');
  console.log(`  道路状态数量: ${physical.roadStates.length}`);
  console.log(`  危险区域数量: ${physical.hazardZones.length}`);
  console.log(`  渡轮状态数量: ${physical.ferryStates.length}`);
  console.log(`  气候季节性: ${physical.climateSeasonality ? '已加载' : '未找到'}`);
  console.log('');

  // 4. 验证 PhysicalRealityModel
  log('步骤 4: 验证 PhysicalRealityModel...', 'cyan');
  const validation = validatePhysicalRealityModel(physical);
  if (validation.valid) {
    log('✅ PhysicalRealityModel 验证通过', 'green');
  } else {
    log('⚠️ PhysicalRealityModel 验证失败', 'yellow');
    console.log(`缺失字段: ${validation.missingFields.join(', ')}`);
  }
  console.log('');

  // 5. 显示 F 路详情
  log('步骤 5: F 路详情', 'cyan');
  const fRoads = roadStates.filter(r => r.roadId.startsWith('F'));
  console.log(`找到 ${fRoads.length} 条 F 路:`);
  fRoads.slice(0, 5).forEach((road, idx) => {
    console.log(`\n  [${idx + 1}] ${road.roadId}`);
    console.log(`      状态: ${road.status}`);
    if (road.seasonOpenFrom && road.seasonOpenTo) {
      const isOpenInMonth = month >= road.seasonOpenFrom && month <= road.seasonOpenTo;
      console.log(`      季节性开放: ${road.seasonOpenFrom}-${road.seasonOpenTo}月 ${isOpenInMonth ? '✅ (当前月份开放)' : '❌ (当前月份关闭)'}`);
    }
    console.log(`      需要4x4: ${road.requires4x4 ? '是' : '否'}`);
    console.log(`      需要许可证: ${road.requiresPermit ? '是' : '否'}`);
    if (road.metadata?.hazards) {
      console.log(`      危险: ${road.metadata.hazards.map((h: any) => h.type).join(', ')}`);
    }
  });
  console.log('');

  // 6. 显示路线哲学
  log('步骤 6: 路线哲学（RoutePhilosophy）', 'cyan');
  console.log(`核心陈述: "${ICELAND_HIGHLANDS_PHILOSOPHY.coreStatement}"`);
  console.log(`必须体验类型: ${ICELAND_HIGHLANDS_PHILOSOPHY.mustVisitTags.join(', ')}`);
  console.log(`不可协商规则:`);
  ICELAND_HIGHLANDS_PHILOSOPHY.nonNegotiableRules.forEach((rule, idx) => {
    console.log(`  ${idx + 1}. ${rule}`);
  });
  console.log(`可灵活调整部分:`);
  ICELAND_HIGHLANDS_PHILOSOPHY.flexibleParts.forEach((part, idx) => {
    console.log(`  ${idx + 1}. ${part}`);
  });
  if (ICELAND_HIGHLANDS_PHILOSOPHY.durationFlexibility) {
    console.log(`天数弹性: ${ICELAND_HIGHLANDS_PHILOSOPHY.durationFlexibility.minDays}-${ICELAND_HIGHLANDS_PHILOSOPHY.durationFlexibility.maxDays}天`);
  }
  console.log('');

  // 7. 构建完整的世界模型上下文（模拟）
  log('步骤 7: 构建完整的世界模型上下文', 'cyan');
  const worldModelContext = {
    physical,
    human,
    routeDirection: {
      name: 'ICELAND_HIGHLANDS_F_ROAD_EXPEDITION',
      nameCN: '冰岛高地 F 路穿越',
      countryCode: 'IS',
      tags: ['越野', '高地', '徒步', '自然'],
      philosophy: ICELAND_HIGHLANDS_PHILOSOPHY,
    },
  };

  log('✅ 世界模型上下文构建完成', 'green');
  console.log('');
  console.log('世界模型结构:');
  console.log(`  PhysicalRealityModel:`);
  console.log(`    - DEM 证据: ${worldModelContext.physical.demEvidence.length} 条`);
  console.log(`    - 道路状态: ${worldModelContext.physical.roadStates.length} 条`);
  console.log(`    - 危险区域: ${worldModelContext.physical.hazardZones.length} 个`);
  console.log(`    - 渡轮状态: ${worldModelContext.physical.ferryStates.length} 条`);
  console.log(`  HumanCapabilityModel:`);
  console.log(`    - 单日最大爬升: ${worldModelContext.human.maxDailyAscentM}m`);
  console.log(`    - 风险承受度: ${worldModelContext.human.riskTolerance}`);
  console.log(`  RouteDirection:`);
  console.log(`    - 路线名称: ${worldModelContext.routeDirection.nameCN}`);
  console.log(`    - 核心陈述: "${(worldModelContext.routeDirection.philosophy as any).coreStatement}"`);
  console.log('');

  // 8. 验证完整性
  log('步骤 8: 验证世界模型完整性', 'cyan');
  const isValid = 
    worldModelContext.physical &&
    worldModelContext.human &&
    worldModelContext.routeDirection &&
    validation.valid;

  if (isValid) {
    log('✅ 世界模型完整且有效', 'green');
  } else {
    log('⚠️ 世界模型不完整或无效', 'yellow');
    console.log(`PhysicalRealityModel 验证: ${validation.valid ? '通过' : '失败'}`);
    if (!validation.valid) {
      console.log(`缺失字段: ${validation.missingFields.join(', ')}`);
    }
  }
  console.log('');

  // 9. 输出 JSON 摘要
  log('步骤 9: 生成 JSON 摘要', 'cyan');
  const summary = {
    timestamp: new Date().toISOString(),
    testParams: {
      countryCode,
      month,
      partyProfile,
    },
    worldModel: {
      physical: {
        countryCode: worldModelContext.physical.countryCode,
        month: worldModelContext.physical.month,
        demEvidenceCount: worldModelContext.physical.demEvidence.length,
        roadStatesCount: worldModelContext.physical.roadStates.length,
        fRoadsCount: fRoads.length,
        hazardZonesCount: worldModelContext.physical.hazardZones.length,
        ferryStatesCount: worldModelContext.physical.ferryStates.length,
        hasClimateSeasonality: !!worldModelContext.physical.climateSeasonality,
      },
      human: {
        profileId: worldModelContext.human.profileId,
        maxDailyAscentM: worldModelContext.human.maxDailyAscentM,
        rollingAscent3DaysM: worldModelContext.human.rollingAscent3DaysM,
        maxSlopePct: worldModelContext.human.maxSlopePct,
        preferredPace: worldModelContext.human.preferredPace,
        riskTolerance: worldModelContext.human.riskTolerance,
        highAltitudeExperience: worldModelContext.human.highAltitudeExperience,
      },
      routeDirection: {
        name: worldModelContext.routeDirection.nameCN,
        countryCode: worldModelContext.routeDirection.countryCode,
        hasPhilosophy: true,
        coreStatement: (worldModelContext.routeDirection.philosophy as any).coreStatement,
        mustVisitTags: (worldModelContext.routeDirection.philosophy as any).mustVisitTags,
        nonNegotiableRulesCount: (worldModelContext.routeDirection.philosophy as any).nonNegotiableRules.length,
      },
    },
    validation: {
      physicalRealityValid: validation.valid,
      missingFields: validation.missingFields,
      overallValid: isValid,
    },
    fRoadsSummary: fRoads.slice(0, 5).map(road => ({
      roadId: road.roadId,
      status: road.status,
      openInMonth: road.seasonOpenFrom && road.seasonOpenTo 
        ? (month >= road.seasonOpenFrom && month <= road.seasonOpenTo)
        : null,
      requires4x4: road.requires4x4,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log('');

  log('========================================', 'blue');
  log('测试完成', 'green');
  log('========================================', 'blue');
}

main().catch(console.error);
