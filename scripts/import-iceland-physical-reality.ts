#!/usr/bin/env ts-node
/**
 * 导入冰岛 PhysicalReality 数据脚本
 * 
 * 功能：
 * 1. 读取冰岛 PhysicalReality JSON 数据文件
 * 2. 从路线坐标自动计算 DEM 证据（基于 DEM 数据）
 * 3. 验证数据完整性
 * 4. 导入到数据库或存储为 JSON 文件
 * 
 * PhysicalReality 数据包括：
 * - DEM 决策证据（demEvidence）- 可从路线坐标自动计算
 * - 道路状态（roadStates）- F-road 开/关、季节性
 * - 危险区域状态（hazardZones）- 雪崩带等
 * - 渡轮状态（ferryStates）
 * - 气候季节性（climateSeasonality）
 * 
 * 使用方法：
 *   ts-node scripts/import-iceland-physical-reality.ts import data/physical-reality/iceland.json
 *   ts-node scripts/import-iceland-physical-reality.ts validate data/physical-reality/iceland.json
 *   ts-node scripts/import-iceland-physical-reality.ts generate-template
 *   ts-node scripts/import-iceland-physical-reality.ts calculate-dem <route-file.json>
 * 
 * DEM 自动计算：
 *   如果提供路线坐标（LineString 或坐标数组），脚本可以自动从 DEM 数据计算：
 *   - 海拔剖面（elevationProfile）
 *   - 累计爬升（cumulativeAscent）
 *   - 最大坡度（maxSlopePct）
 *   - 疲劳指数（fatigueIndex）
 *   - 违规类型（violation）
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  PhysicalRealityModel,
  RoadState,
  HazardZoneState,
  FerryState,
  ClimateSeasonality,
} from '../src/trips/decision/models/physical-reality.model';
import { DemDecisionEvidence } from '../src/trips/decision/interfaces/dem-decision-evidence.interface';
import { validatePhysicalRealityModel } from '../src/trips/decision/models/physical-reality.model';
import { DEMElevationService } from '../src/trips/dem/services/dem-elevation.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const demElevationService = new DEMElevationService(prismaService);

/**
 * 验证 PhysicalReality 数据
 */
function validatePhysicalReality(data: PhysicalRealityModel): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 使用模型验证函数
  const validation = validatePhysicalRealityModel(data);
  if (!validation.valid) {
    errors.push(`缺少必需字段: ${validation.missingFields.join(', ')}`);
  }

  // 验证国家代码
  if (data.countryCode !== 'IS') {
    warnings.push(`国家代码为 ${data.countryCode}，预期为 IS`);
  }

  // 验证月份
  if (data.month < 1 || data.month > 12) {
    errors.push(`月份 ${data.month} 无效，应在 1-12 之间`);
  }

  // 验证 DEM 证据
  if (!data.demEvidence || data.demEvidence.length === 0) {
    errors.push('DEM 证据不能为空');
  } else {
    for (let i = 0; i < data.demEvidence.length; i++) {
      const evidence = data.demEvidence[i];
      if (!evidence.segmentId) {
        errors.push(`DEM 证据 [${i}] 缺少 segmentId`);
      }
      if (evidence.cumulativeAscent < 0) {
        warnings.push(`DEM 证据 [${i}] 的累计爬升为负数: ${evidence.cumulativeAscent}`);
      }
      if (evidence.fatigueIndex < 0 || evidence.fatigueIndex > 100) {
        errors.push(`DEM 证据 [${i}] 的疲劳指数超出范围: ${evidence.fatigueIndex}`);
      }
    }
  }

  // 验证道路状态
  if (!data.roadStates || data.roadStates.length === 0) {
    warnings.push('道路状态列表为空');
  } else {
    for (let i = 0; i < data.roadStates.length; i++) {
      const road = data.roadStates[i];
      if (!road.roadId) {
        errors.push(`道路状态 [${i}] 缺少 roadId`);
      }
      if (!['OPEN', 'CLOSED', 'SEASONAL', 'RESTRICTED'].includes(road.status)) {
        errors.push(`道路状态 [${i}] 的状态值无效: ${road.status}`);
      }
      if (road.status === 'SEASONAL') {
        if (!road.seasonOpenFrom || !road.seasonOpenTo) {
          warnings.push(`道路 ${road.roadId} 标记为季节性但缺少开放月份`);
        }
      }
    }
  }

  // 验证危险区域
  if (!data.hazardZones || data.hazardZones.length === 0) {
    warnings.push('危险区域列表为空');
  } else {
    for (let i = 0; i < data.hazardZones.length; i++) {
      const hazard = data.hazardZones[i];
      if (!hazard.zoneId) {
        errors.push(`危险区域 [${i}] 缺少 zoneId`);
      }
      if (!['AVALANCHE', 'MUDSLIDE', 'FLOOD', 'ICE', 'VOLCANIC', 'OTHER'].includes(hazard.type)) {
        errors.push(`危险区域 [${i}] 的类型无效: ${hazard.type}`);
      }
      if (!['NONE', 'LOW', 'MEDIUM', 'HIGH'].includes(hazard.level)) {
        errors.push(`危险区域 [${i}] 的级别无效: ${hazard.level}`);
      }
    }
  }

  // 验证渡轮状态
  if (!data.ferryStates || data.ferryStates.length === 0) {
    warnings.push('渡轮状态列表为空');
  } else {
    for (let i = 0; i < data.ferryStates.length; i++) {
      const ferry = data.ferryStates[i];
      if (!ferry.ferryId) {
        errors.push(`渡轮状态 [${i}] 缺少 ferryId`);
      }
      if (!['RUNNING', 'CANCELLED', 'SEASONAL'].includes(ferry.status)) {
        errors.push(`渡轮状态 [${i}] 的状态值无效: ${ferry.status}`);
      }
    }
  }

  // 验证气候季节性
  if (data.climateSeasonality) {
    if (data.climateSeasonality.countryCode !== data.countryCode) {
      warnings.push('气候季节性的国家代码与模型不一致');
    }
    if (data.climateSeasonality.month !== data.month) {
      warnings.push('气候季节性的月份与模型不一致');
    }
    if (data.climateSeasonality.accessibilityScore < 0 || data.climateSeasonality.accessibilityScore > 1) {
      errors.push(`可达性评分超出范围: ${data.climateSeasonality.accessibilityScore}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 生成模板文件
 */
function generateTemplate() {
  const template: PhysicalRealityModel = {
    countryCode: 'IS',
    month: 7, // 7月（夏季）
    demEvidence: [
      {
        segmentId: 'segment-001',
        elevationProfile: [100, 150, 200, 180, 160],
        cumulativeAscent: 100,
        maxSlopePct: 15,
        rollingAscent3Days: 500,
        fatigueIndex: 45,
        violation: 'NONE',
        explanation: '路段海拔变化适中，无违规',
        metadata: {
          distanceM: 5000,
          avgSlopePct: 8,
          elevationRange: {
            min: 100,
            max: 200,
          },
        },
      },
    ],
    roadStates: [
      {
        roadId: 'F208',
        status: 'SEASONAL',
        seasonOpenFrom: 6, // 6月
        seasonOpenTo: 9,   // 9月
        requires4x4: true,
        requiresPermit: false,
        metadata: {
          description: 'F208 高地公路，仅夏季开放',
          source: 'Icelandic Road Administration',
        },
      },
      {
        roadId: 'F35',
        status: 'SEASONAL',
        seasonOpenFrom: 6,
        seasonOpenTo: 9,
        requires4x4: true,
        requiresPermit: false,
      },
    ],
    hazardZones: [
      {
        zoneId: 'hazard-avalanche-001',
        type: 'AVALANCHE',
        level: 'MEDIUM',
        seasonality: {
          highRiskMonths: [12, 1, 2, 3], // 冬季高风险
          lowRiskMonths: [6, 7, 8, 9],   // 夏季低风险
        },
        metadata: {
          description: '北部山区雪崩风险区',
          source: 'Icelandic Meteorological Office',
        },
      },
      {
        zoneId: 'hazard-volcanic-001',
        type: 'VOLCANIC',
        level: 'LOW',
        metadata: {
          description: '活跃火山区域',
        },
      },
    ],
    ferryStates: [
      {
        ferryId: 'ferry-vestmannaeyjar',
        routeId: 'route-landeyjahofn-vestmannaeyjar',
        status: 'RUNNING',
        metadata: {
          description: 'Landeyjahöfn 到 Vestmannaeyjar 渡轮',
          schedule: '全年运行',
        },
      },
    ],
    climateSeasonality: {
      countryCode: 'IS',
      month: 7,
      accessibilityScore: 0.8, // 7月可达性较好
      typicalWeather: {
        windSpeedMps: 8,
        precipitationMmPerHour: 2,
        visibilityMeters: 10000,
        temperatureCelsius: 12,
      },
      riskFactors: ['wind'],
      metadata: {
        description: '7月是冰岛旅游旺季，天气相对稳定',
      },
    },
  };

  const outputDir = join(__dirname, '../data/physical-reality');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = join(outputDir, 'iceland-template.json');
  writeFileSync(outputPath, JSON.stringify(template, null, 2), 'utf-8');
  console.log(`✅ 模板文件已生成: ${outputPath}`);
  console.log('\n📝 请根据实际数据修改模板文件，然后使用 import 命令导入');
}

/**
 * 验证数据文件
 */
async function validateData(filePath: string) {
  console.log(`\n🔍 验证 PhysicalReality 数据: ${filePath}\n`);

  if (!existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const data: PhysicalRealityModel = JSON.parse(fileContent);

    const validation = validatePhysicalReality(data);

    if (validation.valid) {
      console.log('✅ 数据验证通过');
    } else {
      console.log('❌ 数据验证失败');
    }

    if (validation.errors.length > 0) {
      console.log('\n❌ 错误:');
      validation.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    if (validation.warnings.length > 0) {
      console.log('\n⚠️  警告:');
      validation.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }

    // 显示统计信息
    console.log('\n📊 数据统计:');
    console.log(`  - 国家代码: ${data.countryCode}`);
    console.log(`  - 月份: ${data.month}`);
    console.log(`  - DEM 证据数量: ${data.demEvidence?.length || 0}`);
    console.log(`  - 道路状态数量: ${data.roadStates?.length || 0}`);
    console.log(`  - 危险区域数量: ${data.hazardZones?.length || 0}`);
    console.log(`  - 渡轮状态数量: ${data.ferryStates?.length || 0}`);
    console.log(`  - 气候季节性: ${data.climateSeasonality ? '有' : '无'}`);

    return validation.valid;
  } catch (error: any) {
    console.error(`❌ 读取或解析文件失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 导入数据到数据库
 * 
 * 注意：PhysicalReality 数据可以存储在：
 * 1. ReadinessPack 的 packData 中（作为扩展）
 * 2. 或者创建新的存储表
 * 
 * 这里我们将其存储到 ReadinessPack 的 packData 中
 */
async function importData(filePath: string) {
  console.log(`\n📥 导入 PhysicalReality 数据: ${filePath}\n`);

  if (!existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  try {
    // 1. 读取和验证数据
    const fileContent = readFileSync(filePath, 'utf-8');
    const data: PhysicalRealityModel = JSON.parse(fileContent);

    const validation = validatePhysicalReality(data);
    if (!validation.valid) {
      console.error('❌ 数据验证失败，无法导入');
      validation.errors.forEach((error) => {
        console.error(`  - ${error}`);
      });
      process.exit(1);
    }

    if (validation.warnings.length > 0) {
      console.log('⚠️  警告:');
      validation.warnings.forEach((warning) => {
        console.log(`  - ${warning}`);
      });
      console.log('');
    }

    // 2. 查找或创建对应的 ReadinessPack
    const packId = `pack.is.iceland`;
    let pack = await prisma.readinessPack.findUnique({
      where: { packId },
    });

    if (!pack) {
      console.log(`⚠️  ReadinessPack ${packId} 不存在，将创建新记录`);
      
      // 创建基础 Pack 记录
      pack = await prisma.readinessPack.create({
        data: {
          id: require('crypto').randomUUID(),
          packId,
          destinationId: 'iceland',
          displayName: JSON.stringify({ en: 'Iceland', zh: '冰岛' }),
          version: '1.0.0',
          lastReviewedAt: new Date(),
          countryCode: 'IS',
          region: 'Iceland',
          packData: {
            physicalReality: data,
          } as any,
          isActive: true,
          updatedAt: new Date(),
        },
      });
      console.log(`✅ 已创建新的 ReadinessPack: ${packId}`);
    } else {
      // 更新现有 Pack，添加 PhysicalReality 数据
      const packData = (pack.packData as any) || {};
      packData.physicalReality = data;

      pack = await prisma.readinessPack.update({
        where: { packId },
        data: {
          packData: packData as any,
          updatedAt: new Date(),
        },
      });
      console.log(`✅ 已更新 ReadinessPack: ${packId}`);
    }

    // 3. 显示导入结果
    console.log('\n📊 导入统计:');
    console.log(`  - 国家代码: ${data.countryCode}`);
    console.log(`  - 月份: ${data.month}`);
    console.log(`  - DEM 证据: ${data.demEvidence.length} 条`);
    console.log(`  - 道路状态: ${data.roadStates.length} 条`);
    console.log(`  - 危险区域: ${data.hazardZones.length} 条`);
    console.log(`  - 渡轮状态: ${data.ferryStates.length} 条`);
    console.log(`  - 气候季节性: ${data.climateSeasonality ? '已包含' : '未包含'}`);

    console.log('\n✅ 导入完成！');

  } catch (error: any) {
    console.error(`❌ 导入失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 从路线坐标计算 DEM 证据
 * 
 * 输入格式：
 * {
 *   "segmentId": "segment-001",
 *   "coordinates": [[lng1, lat1], [lng2, lat2], ...]  // GeoJSON LineString 格式
 *   // 或
 *   "points": [{ "lat": lat1, "lng": lng1 }, ...]
 * }
 */
async function calculateDemFromRoute(routeFile: string) {
  console.log(`\n🗺️  从路线计算 DEM 证据: ${routeFile}\n`);

  if (!existsSync(routeFile)) {
    console.error(`❌ 文件不存在: ${routeFile}`);
    process.exit(1);
  }

  try {
    const fileContent = readFileSync(routeFile, 'utf-8');
    const routeData = JSON.parse(fileContent);

    // 提取坐标点
    let points: Array<{ lat: number; lng: number }> = [];
    
    if (routeData.coordinates) {
      // GeoJSON LineString 格式: [[lng, lat], ...]
      points = routeData.coordinates.map((coord: number[]) => ({
        lng: coord[0],
        lat: coord[1],
      }));
    } else if (routeData.points) {
      // 自定义格式: [{ lat, lng }, ...]
      points = routeData.points;
    } else {
      console.error('❌ 路线文件格式错误：需要 coordinates 或 points 字段');
      process.exit(1);
    }

    if (points.length < 2) {
      console.error('❌ 路线至少需要2个点');
      process.exit(1);
    }

    console.log(`📍 路线包含 ${points.length} 个点`);
    console.log('⏳ 正在从数据库 DEM 数据批量计算海拔...\n');

    // 1. 批量获取所有点的海拔（使用数据库批量查询）
    const elevations = await batchGetElevationsFromDB(points);
    
    // 检查是否有缺失的海拔数据
    const missingCount = elevations.filter(e => e === null).length;
    if (missingCount > 0) {
      console.warn(`⚠️  有 ${missingCount} 个点无法获取海拔，将使用前一点或0作为后备`);
      // 填充缺失的海拔
      for (let i = 0; i < elevations.length; i++) {
        if (elevations[i] === null) {
          elevations[i] = elevations[i - 1] ?? 0;
        }
      }
    }
    
    console.log(`✅ 已获取 ${points.length - missingCount}/${points.length} 个点的海拔数据\n`);

    // 2. 计算距离、坡度、累计爬升
    let totalDistance = 0;
    let cumulativeAscent = 0;
    const slopes: number[] = [];
    const elevationProfile: number[] = [];

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const elevation = elevations[i] ?? 0; // 处理 null 值
      elevationProfile.push(elevation);

      if (i > 0) {
        const prevPoint = points[i - 1];
        const prevElevation = elevations[i - 1] ?? 0; // 处理 null 值
        const distance = calculateDistance(
          prevPoint.lat,
          prevPoint.lng,
          point.lat,
          point.lng
        );
        totalDistance += distance;

        // 计算坡度
        const elevationChange = elevation - prevElevation;
        if (distance > 0) {
          const slope = (elevationChange / distance) * 100;
          slopes.push(Math.abs(slope));
        }

        // 累计爬升
        if (elevation > prevElevation) {
          cumulativeAscent += elevation - prevElevation;
        }
      }
    }

    const maxSlopePct = slopes.length > 0 ? Math.max(...slopes) : 0;
    const avgSlopePct = slopes.length > 0 ? slopes.reduce((a, b) => a + b, 0) / slopes.length : 0;
    const validElevations = elevations.filter((e): e is number => e !== null);
    const minElevation = validElevations.length > 0 ? Math.min(...validElevations) : 0;
    const maxElevation = validElevations.length > 0 ? Math.max(...validElevations) : 0;

    // 3. 计算疲劳指数（简化公式）
    const ascentFatigue = Math.min(cumulativeAscent / 100, 50);
    const slopeFatigue = maxSlopePct <= 20
      ? maxSlopePct * 0.5
      : 10 + (maxSlopePct - 20) * 1.0;
    const altitudeFatigue = maxElevation > 3000
      ? Math.min((maxElevation - 3000) / 100, 30)
      : 0;
    const fatigueIndex = Math.min(ascentFatigue + slopeFatigue + altitudeFatigue, 100);

    // 4. 判断违规类型（简化规则）
    let violation: 'HARD' | 'SOFT' | 'NONE' = 'NONE';
    let explanation = '';

    if (maxSlopePct > 30) {
      violation = 'HARD';
      explanation = `最大坡度 ${maxSlopePct.toFixed(1)}% 超过硬限制 30%`;
    } else if (maxSlopePct > 20) {
      violation = 'SOFT';
      explanation = `最大坡度 ${maxSlopePct.toFixed(1)}% 超过建议限制 20%`;
    } else if (cumulativeAscent > 1500) {
      violation = 'SOFT';
      explanation = `累计爬升 ${cumulativeAscent.toFixed(0)}m 较高，建议拆分`;
    } else {
      explanation = `累计爬升 ${cumulativeAscent.toFixed(0)}m，最大坡度 ${maxSlopePct.toFixed(1)}%，无违规`;
    }

    // 5. 生成 DEM 证据
    const segmentId = routeData.segmentId || `route-${Date.now()}`;
    const evidence: DemDecisionEvidence = {
      segmentId,
      elevationProfile,
      cumulativeAscent: Math.round(cumulativeAscent),
      maxSlopePct: Math.round(maxSlopePct * 10) / 10,
      rollingAscent3Days: Math.round(cumulativeAscent), // 简化：单段使用累计爬升
      fatigueIndex: Math.round(fatigueIndex * 10) / 10,
      violation,
      explanation,
      metadata: {
        distanceM: Math.round(totalDistance),
        avgSlopePct: Math.round(avgSlopePct * 10) / 10,
        elevationRange: {
          min: Math.round(minElevation),
          max: Math.round(maxElevation),
        },
      },
    };

    // 6. 输出结果
    console.log('✅ DEM 证据计算完成\n');
    console.log('📊 计算结果:');
    console.log(`  - 路段 ID: ${segmentId}`);
    console.log(`  - 总距离: ${(totalDistance / 1000).toFixed(2)} km`);
    console.log(`  - 累计爬升: ${cumulativeAscent.toFixed(0)} m`);
    console.log(`  - 最大坡度: ${maxSlopePct.toFixed(1)} %`);
    console.log(`  - 平均坡度: ${avgSlopePct.toFixed(1)} %`);
    console.log(`  - 海拔范围: ${minElevation.toFixed(0)} - ${maxElevation.toFixed(0)} m`);
    console.log(`  - 疲劳指数: ${fatigueIndex.toFixed(1)} / 100`);
    console.log(`  - 违规类型: ${violation}`);
    console.log(`  - 解释: ${explanation}\n`);

    // 7. 保存结果
    const outputFile = routeFile.replace('.json', '-dem-evidence.json');
    writeFileSync(outputFile, JSON.stringify(evidence, null, 2), 'utf-8');
    console.log(`💾 DEM 证据已保存到: ${outputFile}`);

    return evidence;
  } catch (error: any) {
    console.error(`❌ 计算失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 从数据库批量获取多个点的海拔（高效批量查询）
 * 
 * 使用 PostGIS 的 UNNEST 和 ST_Value 一次性查询多个点
 * 优先尝试批量查询，如果失败则回退到逐个查询
 */
async function batchGetElevationsFromDB(
  points: Array<{ lat: number; lng: number }>
): Promise<Array<number | null>> {
  if (points.length === 0) {
    return [];
  }

  // 尝试从不同的 DEM 表批量查询
  const demTables = ['geo_dem_cities_merged', 'geo_dem_global'];
  
  for (const demTable of demTables) {
    try {
      // 检查表是否存在
      const tableExists = await (prismaService as any).$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${demTable}'
        );
      `) as Array<{ exists: boolean }>;
      
      if (!tableExists[0]?.exists) {
        continue;
      }

      // 构建批量查询 SQL
      // 使用 UNNEST 和数组来批量查询多个点
      const lats = points.map(p => p.lat);
      const lngs = points.map(p => p.lng);
      
      // 对于大量点，分批查询（每批100个点）
      const batchSize = 100;
      const allElevations: Array<number | null> = [];
      
      for (let i = 0; i < points.length; i += batchSize) {
        const batchPoints = points.slice(i, i + batchSize);
        const batchLats = batchPoints.map(p => p.lat);
        const batchLngs = batchPoints.map(p => p.lng);
        
        const query = `
          WITH points AS (
            SELECT 
              unnest(ARRAY[${batchLats.join(',')}]) as lat,
              unnest(ARRAY[${batchLngs.join(',')}]) as lng,
              generate_subscripts(ARRAY[${batchLats.join(',')}], 1) as idx
          )
          SELECT 
            p.idx,
            ST_Value(
              rast, 
              ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)
            )::INTEGER as elevation
          FROM points p
          CROSS JOIN LATERAL (
            SELECT rast
            FROM ${demTable}
            WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))
            LIMIT 1
          ) as dem
          ORDER BY p.idx;
        `;

        const results = await (prismaService as any).$queryRawUnsafe(query) as Array<{
          idx: number;
          elevation: number | null;
        }>;

        // 将结果映射回数组
        const batchElevations: Array<number | null> = new Array(batchPoints.length).fill(null);
        for (const result of results) {
          if (result.idx >= 1 && result.idx <= batchPoints.length) {
            batchElevations[result.idx - 1] = result.elevation !== null ? Math.round(result.elevation) : null;
          }
        }
        
        allElevations.push(...batchElevations);
        
        if (i + batchSize < points.length) {
          process.stdout.write(`\r   已批量查询 ${Math.min(i + batchSize, points.length)}/${points.length} 个点`);
        }
      }

      // 如果至少有一些点查询成功，返回结果
      const successCount = allElevations.filter(e => e !== null).length;
      if (successCount > 0) {
        console.log(`\n  ✅ 从 ${demTable} 成功获取 ${successCount}/${points.length} 个点的海拔`);
        return allElevations;
      }
    } catch (error: any) {
      // 如果查询失败，尝试下一个表
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        continue;
      }
      console.warn(`  ⚠️  从 ${demTable} 批量查询失败: ${error.message}`);
    }
  }

  // 如果所有批量查询都失败，回退到逐个查询
  console.log('  ⚠️  批量查询失败，回退到逐个查询...');
  return await demElevationService.getElevations(points, 'geo_dem_global');
}

/**
 * 计算两点之间的距离（米）- Haversine 公式
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 主函数
 */
async function main() {
  const command = process.argv[2];
  const filePath = process.argv[3];

  try {
    switch (command) {
      case 'generate-template':
        generateTemplate();
        break;

      case 'validate':
        if (!filePath) {
          console.error('❌ 请提供文件路径');
          console.log('使用方法: ts-node scripts/import-iceland-physical-reality.ts validate <file-path>');
          process.exit(1);
        }
        await validateData(filePath);
        break;

      case 'import':
        if (!filePath) {
          console.error('❌ 请提供文件路径');
          console.log('使用方法: ts-node scripts/import-iceland-physical-reality.ts import <file-path>');
          process.exit(1);
        }
        await importData(filePath);
        break;

      case 'calculate-dem':
        if (!filePath) {
          console.error('❌ 请提供路线文件路径');
          console.log('使用方法: ts-node scripts/import-iceland-physical-reality.ts calculate-dem <route-file>');
          process.exit(1);
        }
        await calculateDemFromRoute(filePath);
        break;

      default:
        console.log('使用方法:');
        console.log('  生成模板:');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts generate-template');
        console.log('');
        console.log('  验证数据:');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts validate <file-path>');
        console.log('');
        console.log('  导入数据:');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts import <file-path>');
        console.log('');
        console.log('  从路线计算 DEM 证据:');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts calculate-dem <route-file>');
        console.log('');
        console.log('示例:');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts generate-template');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts validate data/physical-reality/iceland.json');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts import data/physical-reality/iceland.json');
        console.log('    ts-node scripts/import-iceland-physical-reality.ts calculate-dem data/routes/iceland-route.json');
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ 执行失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await prismaService.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main();
}

