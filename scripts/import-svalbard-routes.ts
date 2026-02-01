#!/usr/bin/env tsx
/**
 * 导入斯瓦尔巴路线数据到RouteDirection表
 * 数据源：docs/svalbard/routes/*.json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface RouteData {
  metadata: {
    version: string;
    last_updated: string;
    credibility_score: number;
  };
  route: {
    route_id: string;
    route_name: string;
    route_name_en: string;
    route_type: string;
    duration_days: number;
    duration_hours?: number;
    total_distance_km: number;
    difficulty_level: string;
    best_seasons: string[];
    avoid_seasons?: string[];
    risk_level: string;
    polar_bear_risk?: string; // 斯瓦尔巴特有
    guide_required?: string;
    weapon_required?: string;
    rhythm_pattern: string;
    start_point: {
      name: string;
      name_en: string;
      coordinates: [number, number];
      elevation_m: number;
    };
    end_point: {
      name: string;
      name_en: string;
      coordinates: [number, number];
      elevation_m: number;
    };
    key_stops: Array<{
      stop_id: string;
      name: string;
      name_en: string;
      type: string;
      coordinates: [number, number];
      recommended_time_minutes: number;
      highlights: string[];
      accessibility?: any;
      fees?: any;
    }>;
    decision_factors?: any;
    seasonal_considerations?: any;
    safety?: any;
    tips?: any;
    cost_estimate?: any;
    user_feedback?: any;
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入斯瓦尔巴路线数据到RouteDirection表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 扫描所有路线文件
    const routesDir = path.join(process.cwd(), 'docs/svalbard/routes');
    console.log(`📖 扫描路线目录: ${routesDir}`);

    if (!fs.existsSync(routesDir)) {
      throw new Error(`路线目录不存在: ${routesDir}`);
    }

    const routeFiles = fs.readdirSync(routesDir).filter(file => file.endsWith('.json'));
    console.log(`  找到 ${routeFiles.length} 个路线文件\n`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    // 2. 导入每个路线
    for (const routeFile of routeFiles) {
      try {
        const filePath = path.join(routesDir, routeFile);
        console.log(`📍 处理: ${routeFile}`);

        const rawData = fs.readFileSync(filePath, 'utf-8');
        const routeData: RouteData = JSON.parse(rawData);

        const route = routeData.route;

        if (!route) {
          console.log(`  ⚠️  跳过: 无法识别的路线格式\n`);
          skipped++;
          continue;
        }

        const nameEN = route.route_name_en || 'Unknown Route';
        const nameCN = route.route_name || '未命名路线';
        const routeId = route.route_id || 'unknown';

        // 检查是否已存在
        const existingRoute = await prisma.routeDirection.findFirst({
          where: {
            countryCode: 'SJ',
            OR: [
              { nameEN: nameEN },
              { metadata: { path: ['route_id'], equals: routeId } },
            ],
          },
        });

        // 提取signature POIs（关键景点）
        const keyStops = route.key_stops || [];
        const signaturePois = {
          count: keyStops.length,
          examples: keyStops.map((stop) => ({
            name: stop.name,
            name_en: stop.name_en,
            coordinates: stop.coordinates,
            highlights: stop.highlights || [],
            recommended_time_minutes: stop.recommended_time_minutes,
          })),
        };

        // 构建seasonality信息
        const seasonality = {
          best_seasons: route.best_seasons || [],
          avoid_seasons: route.avoid_seasons || [],
          seasonal_considerations: route.seasonal_considerations || {},
        };

        // 构建constraints信息
        const constraints = {
          difficulty_level: route.difficulty_level || 'moderate',
          duration_days: route.duration_days || 1,
          duration_hours: route.duration_hours || route.duration_days * 8,
          total_distance_km: route.total_distance_km || 0,
          guide_required: route.guide_required,
          weapon_required: route.weapon_required,
        };

        // 构建risk profile（包含斯瓦尔巴特有的polar_bear_risk）
        const riskProfile = {
          risk_level: route.risk_level || 'medium',
          polar_bear_risk: route.polar_bear_risk, // 斯瓦尔巴特有
          safety: route.safety || {},
          tips: route.tips || {},
        };

        // 构建行程骨架
        const itinerarySkeleton = {
          start_point: route.start_point || {},
          end_point: route.end_point || {},
          key_stops: keyStops,
          route_type: route.route_type || 'guided',
          rhythm_pattern: route.rhythm_pattern || 'moderate',
        };

        // 构建metadata
        const metadata = {
          route_id: routeId,
          version: routeData.metadata.version,
          last_updated: routeData.metadata.last_updated,
          credibility_score: routeData.metadata.credibility_score,
          decision_factors: route.decision_factors,
          cost_estimate: route.cost_estimate,
          user_feedback: route.user_feedback,
        };

        // 提取regions和entryHubs
        const startPointName = route.start_point?.name_en || route.start_point?.name || 'Longyearbyen';
        const regions = [startPointName];
        const entryHubs = [startPointName];

        // 构建描述
        const totalKm = constraints.total_distance_km;
        const durationDays = constraints.duration_days;
        const durationHours = constraints.duration_hours || durationDays * 8;
        const description = `${nameCN}是斯瓦尔巴的${constraints.difficulty_level === 'extreme' ? '极限' : '经典'}路线，全程${totalKm}公里，适合${durationDays}天（约${durationHours}小时）行程。${route.polar_bear_risk ? `北极熊风险等级：${route.polar_bear_risk}。` : ''}`;

        // 构建路线数据
        const routeDirectionData = {
          countryCode: 'SJ',
          name: nameCN,
          nameCN: nameCN,
          nameEN: nameEN,
          description: description,
          tags: [
            itinerarySkeleton.route_type,
            constraints.difficulty_level,
            riskProfile.risk_level,
            ...(route.polar_bear_risk ? [`polar_bear_risk_${route.polar_bear_risk}`] : []),
          ],
          regions: regions,
          entryHubs: entryHubs,
          seasonality: seasonality as any,
          constraints: constraints as any,
          riskProfile: riskProfile as any,
          signaturePois: signaturePois as any,
          itinerarySkeleton: itinerarySkeleton as any,
          metadata: metadata as any,
          isActive: true,
          status: 'active',
          version: routeData.metadata.version,
          rolloutPercent: 100,
          updatedAt: new Date(),
        };

        if (existingRoute) {
          // 更新现有路线
          await prisma.routeDirection.update({
            where: { id: existingRoute.id },
            data: routeDirectionData,
          });
          updated++;
          console.log(`  ♻️  更新: ${route.route_name} (ID: ${existingRoute.id})`);
        } else {
          // 创建新路线
          const created = await prisma.routeDirection.create({
            data: {
              ...routeDirectionData,
              uuid: uuidv4(),
              createdAt: new Date(),
            },
          });
          imported++;
          console.log(`  ✅ 导入: ${route.route_name} (ID: ${created.id})`);
        }

        console.log('');

      } catch (error) {
        console.error(`  ❌ 处理失败: ${routeFile}`, error);
        skipped++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 导入统计:');
    console.log(`  新增: ${imported} 条`);
    console.log(`  更新: ${updated} 条`);
    console.log(`  跳过: ${skipped} 条`);
    console.log(`  总计: ${routeFiles.length} 条`);
    console.log('='.repeat(60));
    console.log('');

    // 3. 验证导入结果
    console.log('🔍 验证导入结果...');
    const totalRoutes = await prisma.routeDirection.count({
      where: { countryCode: 'SJ' },
    });
    console.log(`  斯瓦尔巴路线总数: ${totalRoutes}`);
    console.log('');

    console.log('✅ 导入完成！');

  } catch (error) {
    console.error('❌ 错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
