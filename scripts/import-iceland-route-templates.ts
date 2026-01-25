/**
 * 导入冰岛路线模板到 RouteTemplate 表
 * 从 docs/iceland/routes/*.json 读取 day_by_day_itinerary 数据
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

interface DayPlan {
  day: number;
  route: string;
  distance_km: number;
  driving_time_hours: number;
  highlights: string[];
  overnight: string;
  key_activities?: string[];
  notes?: string;
}

interface ItineraryData {
  pace?: string;
  daily_driving?: string;
  suitable_for?: string;
  days: DayPlan[];
}

async function importRouteTemplates() {
  console.log('============================================================');
  console.log('导入冰岛路线模板到RouteTemplate表');
  console.log('============================================================\n');

  const routesDir = path.join(process.cwd(), 'docs/iceland/routes');
  
  if (!fs.existsSync(routesDir)) {
    console.error('❌ 路线目录不存在:', routesDir);
    return;
  }

  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.json'));
  console.log(`📖 扫描路线目录: ${routesDir}`);
  console.log(`  找到 ${files.length} 个路线文件\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const filepath = path.join(routesDir, file);
    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    
    console.log(`\n📍 处理: ${file}`);

    // 获取路线名称 - 支持多种格式
    const routeName = content.route_basic_info?.name || 
                      content.route?.route_name || 
                      content.route?.route_overview?.name ||
                      content.route_overview?.name;
    
    // 查找对应的 RouteDirection - 精确匹配
    const direction = await prisma.routeDirection.findFirst({
      where: {
        countryCode: 'IS',
        OR: [
          { name: routeName || '' },
          { nameCN: routeName || '' },
          { name: { contains: routeName || '' } },
          { nameCN: { contains: routeName || '' } },
        ]
      }
    });

    if (!direction) {
      console.log(`  ⚠️  未找到对应的RouteDirection: ${routeName}`);
      skipped++;
      continue;
    }

    console.log(`  ✅ 关联RouteDirection: ${direction.nameCN || direction.name} (ID: ${direction.id})`);

    // 获取行程数据 - 支持多种格式
    let itineraries: Record<string, any> = {};
    
    // 格式1: day_by_day_itinerary (ring-road-full)
    if (content.day_by_day_itinerary) {
      itineraries = content.day_by_day_itinerary;
    }
    // 格式2: route.day_by_day_itinerary (golden-circle, ring-road-south, snaefellsnes)
    else if (content.route?.day_by_day_itinerary) {
      itineraries = content.route.day_by_day_itinerary;
    }
    // 格式3: suggested_itinerary_Xdays (highlands, westfjords)
    else if (content.suggested_itinerary_5days) {
      itineraries = { '5_day_itinerary': content.suggested_itinerary_5days };
    }
    // 格式4: alternative_itinerary_askja (highlands)
    else if (content.alternative_itinerary_askja) {
      itineraries = { '3_day_itinerary': content.alternative_itinerary_askja };
    }
    // 格式5: route.itinerary 单一行程
    else if (content.route?.itinerary) {
      const days = content.route.itinerary.days?.length || 1;
      itineraries = { [`${days}_day_itinerary`]: content.route.itinerary };
    }
    // 格式6: 从 route.key_stops 生成单日行程 (golden-circle 等)
    else if (content.route?.key_stops && content.route?.duration_days) {
      const durationDays = content.route.duration_days;
      const keyStops = content.route.key_stops;
      itineraries = {
        [`${durationDays}_day_itinerary`]: {
          pace: content.route.rhythm_pattern || 'moderate',
          suitable_for: Array.isArray(content.route.route_characteristics) 
            ? content.route.route_characteristics.join(', ') 
            : (content.route.route_characteristics || '一日游'),
          days: [{
            day: 1,
            route: `${content.route.start_point?.name || '雷克雅未克'} → ${content.route.end_point?.name || '雷克雅未克'}`,
            distance_km: content.route.total_distance_km || 0,
            driving_time_hours: 3,
            highlights: keyStops.slice(0, 5).map((s: any) => s.name),
            overnight: content.route.end_point?.name || '雷克雅未克',
            key_activities: keyStops.slice(0, 3).map((s: any) => s.highlights?.[0] || s.name),
            notes: `途经 ${keyStops.length} 个景点`,
          }]
        }
      };
    }
    
    if (Object.keys(itineraries).length === 0) {
      console.log(`  ⚠️  无行程数据`);
      skipped++;
      continue;
    }

    // 处理每个行程版本（7天、10天、14天等）
    for (const [key, itinerary] of Object.entries(itineraries)) {
      const itin = itinerary as ItineraryData;
      
      // 解析天数
      const daysMatch = key.match(/(\d+)_day/);
      const durationDays = daysMatch ? parseInt(daysMatch[1]) : itin.days?.length || 0;
      
      if (durationDays === 0 || !itin.days) {
        continue;
      }

      const templateName = `${routeName} - ${durationDays}天行程`;
      const templateNameEN = `${content.route_basic_info?.name_en || routeName} - ${durationDays} Days`;

      // 检查是否已存在
      const existing = await prisma.routeTemplate.findFirst({
        where: {
          routeDirectionId: direction.id,
          durationDays: durationDays,
        }
      });

      // 构建 dayPlans JSON
      const dayPlans = itin.days.map((day: DayPlan) => ({
        day: day.day,
        title: day.route,
        distanceKm: day.distance_km,
        drivingHours: day.driving_time_hours,
        highlights: day.highlights || [],
        overnight: day.overnight,
        activities: day.key_activities || [],
        notes: day.notes || null,
      }));

      const templateData = {
        routeDirectionId: direction.id,
        durationDays,
        name: templateName,
        nameCN: templateName,
        nameEN: templateNameEN,
        dayPlans: dayPlans,
        defaultPacePreference: itin.pace || null,
        metadata: {
          dailyDriving: itin.daily_driving,
          suitableFor: itin.suitable_for,
          sourceFile: file,
          importedAt: new Date().toISOString(),
        },
      };

      if (existing) {
        await prisma.routeTemplate.update({
          where: { id: existing.id },
          data: templateData,
        });
        console.log(`    ♻️  更新模板: ${templateName} (ID: ${existing.id})`);
        updated++;
      } else {
        const newTemplate = await prisma.routeTemplate.create({
          data: {
            uuid: uuidv4(),
            ...templateData,
          },
        });
        console.log(`    ✨ 创建模板: ${templateName} (ID: ${newTemplate.id})`);
        created++;
      }
    }
  }

  console.log('\n============================================================');
  console.log('📊 导入统计:');
  console.log(`  新增: ${created} 个`);
  console.log(`  更新: ${updated} 个`);
  console.log(`  跳过: ${skipped} 个`);
  console.log('============================================================\n');

  // 验证
  const totalTemplates = await prisma.routeTemplate.count({
    where: {
      routeDirection: { countryCode: 'IS' }
    }
  });
  console.log(`🔍 验证: 冰岛路线模板总数: ${totalTemplates}\n`);

  await prisma.$disconnect();
  console.log('✅ 导入完成！');
}

importRouteTemplates().catch(console.error);
