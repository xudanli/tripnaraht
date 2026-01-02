// scripts/enrich-route-templates-with-poi.ts
// 为路线模板添加 requiredNodes（POI 关联）
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * 根据主题关键词匹配 POI
 * 这是一个示例实现，实际使用时需要根据具体的 POI 数据调整
 */
async function findPOIsByTheme(
  countryCode: string,
  theme: string,
  limit: number = 3
): Promise<Array<{ id: number; uuid: string; nameCN: string; nameEN?: string }>> {
  const themeLower = (theme || '').toLowerCase();
  
  // 根据主题关键词构建查询条件
  let categoryFilter = '';
  let nameFilter = '';
  
  // 冰岛主题匹配
  if (countryCode === 'IS') {
    if (themeLower.includes('黄金圈') || themeLower.includes('geysir') || themeLower.includes('gullfoss')) {
      nameFilter = `AND (p."nameCN" ILIKE '%黄金圈%' OR p."nameCN" ILIKE '%间歇泉%' OR p."nameCN" ILIKE '%黄金瀑布%' OR p."nameEN" ILIKE '%Geysir%' OR p."nameEN" ILIKE '%Gullfoss%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('蓝湖') || themeLower.includes('blue lagoon')) {
      nameFilter = `AND (p."nameCN" ILIKE '%蓝湖%' OR p."nameEN" ILIKE '%Blue Lagoon%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('瀑布') || themeLower.includes('waterfall')) {
      nameFilter = `AND (p."nameCN" ILIKE '%瀑布%' OR p."nameEN" ILIKE '%Waterfall%' OR p."nameEN" ILIKE '%Foss%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('黑沙滩') || themeLower.includes('black sand')) {
      nameFilter = `AND (p."nameCN" ILIKE '%黑沙滩%' OR p."nameEN" ILIKE '%Black Sand%' OR p."nameEN" ILIKE '%Reynisfjara%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('冰川') || themeLower.includes('glacier')) {
      nameFilter = `AND (p."nameCN" ILIKE '%冰川%' OR p."nameEN" ILIKE '%Glacier%' OR p."nameEN" ILIKE '%Jökulsárlón%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('冰湖') || themeLower.includes('ice lagoon')) {
      nameFilter = `AND (p."nameCN" ILIKE '%冰湖%' OR p."nameEN" ILIKE '%Jökulsárlón%' OR p."nameEN" ILIKE '%Ice Lagoon%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('温泉') || themeLower.includes('hot spring') || themeLower.includes('geothermal')) {
      nameFilter = `AND (p."nameCN" ILIKE '%温泉%' OR p."nameEN" ILIKE '%Hot Spring%' OR p."nameEN" ILIKE '%Geothermal%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('雷克雅未克') || themeLower.includes('reykjavik')) {
      nameFilter = `AND (p."nameCN" ILIKE '%雷克雅未克%' OR p."nameEN" ILIKE '%Reykjavik%')`;
      categoryFilter = '';
    }
  }
  
  // 瑞士主题匹配
  if (countryCode === 'CH') {
    if (themeLower.includes('少女峰') || themeLower.includes('jungfrau')) {
      nameFilter = `AND (p."nameCN" ILIKE '%少女峰%' OR p."nameEN" ILIKE '%Jungfrau%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('马特洪峰') || themeLower.includes('matterhorn')) {
      nameFilter = `AND (p."nameCN" ILIKE '%马特洪峰%' OR p."nameEN" ILIKE '%Matterhorn%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('采尔马特') || themeLower.includes('zermatt')) {
      nameFilter = `AND (p."nameCN" ILIKE '%采尔马特%' OR p."nameEN" ILIKE '%Zermatt%')`;
      categoryFilter = '';
    } else if (themeLower.includes('因特拉肯') || themeLower.includes('interlaken')) {
      nameFilter = `AND (p."nameCN" ILIKE '%因特拉肯%' OR p."nameEN" ILIKE '%Interlaken%')`;
      categoryFilter = '';
    } else if (themeLower.includes('冰川快车') || themeLower.includes('glacier express')) {
      nameFilter = `AND (p."nameCN" ILIKE '%冰川快车%' OR p."nameEN" ILIKE '%Glacier Express%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('圣莫里茨') || themeLower.includes('st. moritz')) {
      nameFilter = `AND (p."nameCN" ILIKE '%圣莫里茨%' OR p."nameEN" ILIKE '%St. Moritz%' OR p."nameEN" ILIKE '%St Moritz%')`;
      categoryFilter = '';
    } else if (themeLower.includes('卢塞恩') || themeLower.includes('lucerne')) {
      nameFilter = `AND (p."nameCN" ILIKE '%卢塞恩%' OR p."nameEN" ILIKE '%Lucerne%')`;
      categoryFilter = '';
    } else if (themeLower.includes('苏黎世') || themeLower.includes('zurich')) {
      nameFilter = `AND (p."nameCN" ILIKE '%苏黎世%' OR p."nameEN" ILIKE '%Zurich%')`;
      categoryFilter = '';
    }
  }
  
  // 挪威主题匹配
  if (countryCode === 'NO') {
    if (themeLower.includes('峡湾') || themeLower.includes('fjord')) {
      nameFilter = `AND (p."nameCN" ILIKE '%峡湾%' OR p."nameEN" ILIKE '%Fjord%' OR p."nameEN" ILIKE '%Geiranger%' OR p."nameEN" ILIKE '%Sogne%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('布道台') || themeLower.includes('pulpit rock') || themeLower.includes('preikestolen')) {
      nameFilter = `AND (p."nameCN" ILIKE '%布道台%' OR p."nameEN" ILIKE '%Pulpit Rock%' OR p."nameEN" ILIKE '%Preikestolen%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('奇迹石') || themeLower.includes('kjerag')) {
      nameFilter = `AND (p."nameCN" ILIKE '%奇迹石%' OR p."nameEN" ILIKE '%Kjerag%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('卑尔根') || themeLower.includes('bergen')) {
      nameFilter = `AND (p."nameCN" ILIKE '%卑尔根%' OR p."nameEN" ILIKE '%Bergen%')`;
      categoryFilter = '';
    } else if (themeLower.includes('特罗姆瑟') || themeLower.includes('tromso')) {
      nameFilter = `AND (p."nameCN" ILIKE '%特罗姆瑟%' OR p."nameEN" ILIKE '%Tromso%')`;
      categoryFilter = '';
    } else if (themeLower.includes('罗弗敦') || themeLower.includes('lofoten')) {
      nameFilter = `AND (p."nameCN" ILIKE '%罗弗敦%' OR p."nameEN" ILIKE '%Lofoten%')`;
      categoryFilter = '';
    }
  }
  
  // 秘鲁主题匹配
  if (countryCode === 'PE') {
    if (themeLower.includes('马丘比丘') || themeLower.includes('machu picchu')) {
      nameFilter = `AND (p."nameCN" ILIKE '%马丘比丘%' OR p."nameEN" ILIKE '%Machu Picchu%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('库斯科') || themeLower.includes('cusco')) {
      nameFilter = `AND (p."nameCN" ILIKE '%库斯科%' OR p."nameEN" ILIKE '%Cusco%')`;
      categoryFilter = '';
    } else if (themeLower.includes('圣谷') || themeLower.includes('sacred valley')) {
      nameFilter = `AND (p."nameCN" ILIKE '%圣谷%' OR p."nameEN" ILIKE '%Sacred Valley%' OR p."nameEN" ILIKE '%Valle Sagrado%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    } else if (themeLower.includes('印加') || themeLower.includes('inca')) {
      nameFilter = `AND (p."nameCN" ILIKE '%印加%' OR p."nameEN" ILIKE '%Inca%')`;
      categoryFilter = 'AND p.category = \'ATTRACTION\'';
    }
  }
  
  // 如果没有匹配到特定关键词，返回空数组
  if (!nameFilter && !categoryFilter) {
    return [];
  }
  
  try {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      uuid: string;
      nameCN: string;
      nameEN: string | null;
    }>>`
      SELECT 
        p.id,
        p.uuid,
        p."nameCN",
        p."nameEN"
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        ${nameFilter ? Prisma.sql([nameFilter]) : Prisma.sql``}
        ${categoryFilter ? Prisma.sql([categoryFilter]) : Prisma.sql``}
      ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      LIMIT ${limit}
    `;
    
    return places.map(p => ({
      id: p.id,
      uuid: p.uuid,
      nameCN: p.nameCN,
      nameEN: p.nameEN || undefined,
    }));
  } catch (error) {
    // 如果查询失败（可能因为表不存在或没有数据），返回空数组
    return [];
  }
}

/**
 * 为路线模板添加 requiredNodes
 */
async function enrichRouteTemplates() {
  try {
    console.log('开始为路线模板添加 POI 关联...\n');
    
    // 查询所有激活的模板
    const templates = await prisma.routeTemplate.findMany({
      where: { isActive: true },
      include: {
        routeDirection: {
          select: {
            countryCode: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    
    console.log(`找到 ${templates.length} 个激活的模板\n`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const template of templates) {
      const dayPlans = template.dayPlans as any[];
      const countryCode = template.routeDirection.countryCode;
      let hasChanges = false;
      const updatedDayPlans = [];
      
      console.log(`处理模板 ID ${template.id}: ${template.nameCN || template.nameEN}`);
      
      for (const dayPlan of dayPlans) {
        const updatedPlan = { ...dayPlan };
        
        // 如果已经有 requiredNodes，跳过
        if (dayPlan.requiredNodes && dayPlan.requiredNodes.length > 0) {
          console.log(`  第${dayPlan.day}天: 已有 requiredNodes，跳过`);
          updatedDayPlans.push(updatedPlan);
          continue;
        }
        
        // 根据主题查找 POI
        const theme = dayPlan.theme || '';
        if (!theme) {
          console.log(`  第${dayPlan.day}天: 无主题，跳过`);
          updatedDayPlans.push(updatedPlan);
          continue;
        }
        
        const pois = await findPOIsByTheme(countryCode, theme, 2);
        
        if (pois.length > 0) {
          // 使用 POI 的 UUID 或名称作为 requiredNodes
          updatedPlan.requiredNodes = pois.map(poi => poi.uuid || poi.nameCN || poi.nameEN).filter(Boolean);
          hasChanges = true;
          console.log(`  第${dayPlan.day}天 (${theme}): 找到 ${pois.length} 个 POI`);
          pois.forEach(poi => {
            console.log(`    - ${poi.nameCN || poi.nameEN} (UUID: ${poi.uuid?.substring(0, 8)}...)`);
          });
        } else {
          console.log(`  第${dayPlan.day}天 (${theme}): 未找到匹配的 POI`);
        }
        
        updatedDayPlans.push(updatedPlan);
      }
      
      if (hasChanges) {
        // 更新模板
        await prisma.routeTemplate.update({
          where: { id: template.id },
          data: {
            dayPlans: updatedDayPlans as any,
            updatedAt: new Date(),
          },
        });
        updatedCount++;
        console.log(`✅ 模板 ID ${template.id} 已更新\n`);
      } else {
        skippedCount++;
        console.log(`⏭️  模板 ID ${template.id} 无需更新\n`);
      }
    }
    
    console.log('\n=== 完成 ===');
    console.log(`更新: ${updatedCount} 个模板`);
    console.log(`跳过: ${skippedCount} 个模板`);
    console.log(`总计: ${templates.length} 个模板`);
    
  } catch (error: any) {
    console.error('处理失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
enrichRouteTemplates();

