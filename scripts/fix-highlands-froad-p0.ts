#!/usr/bin/env npx tsx
/**
 * 修复内陆高地F路 RouteDirection - P0项
 * 
 * 1. 添加philosophy字段到metadata
 * 2. 添加corridorGeom（基于RouteTemplate的POI位置生成简化几何）
 */

import { PrismaClient } from '@prisma/client';
import { RoutePhilosophy } from '../src/trips/decision/models/route-philosophy.model';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const HIGHLANDS_FROAD_UUID = '8afd4b2e-7dd1-4837-8169-d3efed748138';

// 冰岛高地F路哲学（基于ICELAND_HIGHLANDS_PHILOSOPHY，但调整为5天版本）
const HIGHLANDS_FROAD_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '从文明进入高地，再回到人间',
  mustVisitTags: ['高地荒原', '温泉', '火山'],
  nonNegotiableRules: [
    '必须有一晚住高地 hut 或营地',
    '必须经过至少一个 F-road 路段',
    '必须从 Ring Road 进入高地，再回到 Ring Road',
    '必须使用四驱SUV（法律要求）',
  ],
  flexibleParts: [
    '具体 F-road 选择（F26 / F35 / F208 / F225 / F910）',
    '中间停留点（POI 可替换）',
    '天数（5-7 天范围内）',
  ],
  durationFlexibility: {
    minDays: 5,
    maxDays: 7,
    preferredDays: 5,
  },
  metadata: {
    routeType: 'F-road',
    difficulty: 'extreme',
    riskLevel: 'high',
  },
};

async function main() {
  log('='.repeat(80), 'cyan');
  log('修复内陆高地F路 RouteDirection - P0项', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 1. 获取当前RouteDirection
    log('步骤 1: 获取RouteDirection数据...', 'cyan');
    const rd = await prisma.routeDirection.findFirst({
      where: { uuid: HIGHLANDS_FROAD_UUID },
      include: { RouteTemplate: true },
    });

    if (!rd) {
      log(`❌ RouteDirection不存在: ${HIGHLANDS_FROAD_UUID}`, 'red');
      process.exit(1);
    }

    log(`✅ 找到RouteDirection: ${rd.nameCN} (ID: ${rd.id})`, 'green');
    console.log('');

    // 2. 准备更新数据
    log('步骤 2: 准备更新数据...', 'cyan');
    
    // 2.1 更新metadata，添加philosophy
    const currentMetadata = (rd.metadata as any) || {};
    const updatedMetadata = {
      ...currentMetadata,
      philosophy: HIGHLANDS_FROAD_PHILOSOPHY,
    };

    log('  ✅ Philosophy数据已准备', 'green');
    log(`    核心陈述: ${HIGHLANDS_FROAD_PHILOSOPHY.coreStatement}`, 'green');
    log(`    不可协商规则: ${HIGHLANDS_FROAD_PHILOSOPHY.nonNegotiableRules.length}条`, 'green');
    console.log('');

    // 2.2 生成corridorGeom（基于RouteTemplate的POI位置）
    log('步骤 3: 生成corridorGeom...', 'cyan');
    
    let corridorGeomWKT: string | null = null;
    
    if (rd.RouteTemplate && rd.RouteTemplate.length > 0) {
      const template = rd.RouteTemplate[0];
      const dayPlans = template.dayPlans as any;
      
      if (dayPlans && Array.isArray(dayPlans)) {
        // 提取所有POI的位置
        const pois = dayPlans.flatMap((day: any) => day.pois || []);
        
        // 查询POI的地理位置
        const poiIds = pois
          .map((p: any) => p.id)
          .filter((id: any) => id && typeof id === 'number');
        
        if (poiIds.length > 0) {
          log(`  找到 ${poiIds.length} 个POI，查询位置信息...`, 'yellow');
          
          // 查询POI的location字段（PostGIS geography）
          const poiLocations = await prisma.$queryRawUnsafe(`
            SELECT 
              id,
              ST_AsText(location) as location_wkt,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id IN (${poiIds.join(',')})
              AND location IS NOT NULL
            ORDER BY id;
          `) as Array<{ id: number; location_wkt: string; lat: number; lng: number }>;
          
          if (poiLocations.length >= 2) {
            // 生成LINESTRING几何（按POI顺序）
            const coordinates = poiLocations
              .map(p => `${p.lng} ${p.lat}`)
              .join(', ');
            
            corridorGeomWKT = `LINESTRING(${coordinates})`;
            log(`  ✅ 生成corridorGeom: ${poiLocations.length}个点`, 'green');
            log(`     WKT: LINESTRING(...${poiLocations.length} points...)`, 'green');
          } else {
            log(`  ⚠️  POI位置数据不足（${poiLocations.length}/${poiIds.length}），使用关键F路坐标`, 'yellow');
            
            // 使用关键F路的已知坐标（冰岛高地F路的关键点）
            // Landmannalaugar: -19.0614, 63.9833
            // Þórsmörk: -19.5000, 63.6833
            // Sprengisandur中心: -18.5000, 64.5000
            // Askja: -16.7833, 65.0333
            // Mývatn: -17.0000, 65.6000
            const keyPoints = [
              [-19.0614, 63.9833], // Landmannalaugar
              [-19.5000, 63.6833], // Þórsmörk
              [-18.5000, 64.5000], // Sprengisandur中心
              [-16.7833, 65.0333], // Askja
              [-17.0000, 65.6000], // Mývatn
            ];
            
            const coordinates = keyPoints.map(p => `${p[0]} ${p[1]}`).join(', ');
            corridorGeomWKT = `LINESTRING(${coordinates})`;
            log(`  ✅ 使用关键F路坐标生成corridorGeom: ${keyPoints.length}个点`, 'green');
          }
        } else {
          log(`  ⚠️  无法从RouteTemplate提取POI ID，使用关键F路坐标`, 'yellow');
          
          // 使用关键F路的已知坐标
          const keyPoints = [
            [-19.0614, 63.9833], // Landmannalaugar
            [-19.5000, 63.6833], // Þórsmörk
            [-18.5000, 64.5000], // Sprengisandur中心
            [-16.7833, 65.0333], // Askja
            [-17.0000, 65.6000], // Mývatn
          ];
          
          const coordinates = keyPoints.map(p => `${p[0]} ${p[1]}`).join(', ');
          corridorGeomWKT = `LINESTRING(${coordinates})`;
          log(`  ✅ 使用关键F路坐标生成corridorGeom: ${keyPoints.length}个点`, 'green');
        }
      }
    }
    
    if (!corridorGeomWKT) {
      log(`  ⚠️  无法生成corridorGeom，将跳过此更新`, 'yellow');
    }
    
    console.log('');

    // 3. 执行更新
    log('步骤 4: 执行数据库更新...', 'cyan');
    
    const updateData: any = {
      metadata: updatedMetadata,
      updatedAt: new Date(),
    };
    
    // 如果有corridorGeom，添加到更新数据
    if (corridorGeomWKT) {
      // 使用PostGIS函数设置corridorGeom
      await prisma.$executeRawUnsafe(`
        UPDATE "RouteDirection"
        SET 
          "corridorGeom" = ST_SetSRID(ST_GeomFromText($1), 4326)::geography,
          "metadata" = $2::jsonb,
          "updatedAt" = NOW()
        WHERE "uuid" = $3;
      `, corridorGeomWKT, JSON.stringify(updatedMetadata), HIGHLANDS_FROAD_UUID);
      
      log(`  ✅ 已更新corridorGeom和metadata`, 'green');
    } else {
      // 只更新metadata
      await prisma.routeDirection.update({
        where: { id: rd.id },
        data: {
          metadata: updatedMetadata,
          updatedAt: new Date(),
        },
      });
      
      log(`  ✅ 已更新metadata`, 'green');
    }
    
    console.log('');

    // 4. 验证更新结果
    log('步骤 5: 验证更新结果...', 'cyan');
    const updatedRd = await prisma.routeDirection.findFirst({
      where: { uuid: HIGHLANDS_FROAD_UUID },
    });
    
    if (updatedRd) {
      const metadata = updatedRd.metadata as any;
      const hasPhilosophy = metadata?.philosophy;
      const hasCorridorGeom = (updatedRd as any).corridorGeom !== null;
      
      log(`  ✅ RouteDirection更新成功`, 'green');
      log(`    Philosophy: ${hasPhilosophy ? '✅ 已添加' : '❌ 缺失'}`, hasPhilosophy ? 'green' : 'red');
      log(`    CorridorGeom: ${hasCorridorGeom ? '✅ 已添加' : '❌ 缺失'}`, hasCorridorGeom ? 'green' : 'red');
      
      if (hasPhilosophy) {
        log(`    核心陈述: ${metadata.philosophy.coreStatement}`, 'green');
      }
      
      if (hasCorridorGeom) {
        // 查询corridorGeom的WKT
        const geomResult = await prisma.$queryRawUnsafe(`
          SELECT ST_AsText("corridorGeom"::geometry) as geom_wkt
          FROM "RouteDirection"
          WHERE "uuid" = $1;
        `, HIGHLANDS_FROAD_UUID) as Array<{ geom_wkt: string }>;
        
        if (geomResult.length > 0 && geomResult[0].geom_wkt) {
          const pointCount = (geomResult[0].geom_wkt.match(/LINESTRING/)?.[0] ? 
            geomResult[0].geom_wkt.split(',').length : 0);
          log(`    几何类型: LINESTRING (${pointCount} points)`, 'green');
        }
      }
    }
    
    console.log('');
    log('='.repeat(80), 'cyan');
    log('修复完成！', 'bright');
    log('='.repeat(80), 'cyan');
    log('', 'reset');
    log('📝 下一步:', 'cyan');
    log('  1. 运行验证脚本确认修复结果', 'yellow');
    log('  2. 测试世界模型构建是否正常使用corridorGeom', 'yellow');
    log('  3. 验证philosophy字段是否被AI决策系统正确读取', 'yellow');

  } catch (error: any) {
    log(`❌ 修复失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
