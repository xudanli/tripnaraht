/**
 * 修复路线模板与 POI 的关联
 *
 * 1. 为已有 pois 但缺少 id/uuid 的条目按 nameEN/nameCN 回填地点库 id
 * 2. 从 highlights、requiredNodes 等字段提取 POI 名称并写入 pois 数组
 * 3. 更新 RouteDirection.signaturePois.examples
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { findPlaceByTemplatePoiNames } from '../src/route-directions/utils/template-poi-place-match.util';

const prisma = new PrismaClient();

interface DayPlan {
  day: number;
  title?: string;
  highlights?: string[];
  requiredNodes?: string[];
  activities?: string[];
  overnight?: string;
  pois?: Array<{
    id?: number;
    uuid?: string;
    nameCN: string;
    nameEN?: string;
    category?: string;
    required?: boolean;
    order?: number;
  }>;
  [key: string]: any;
}

/**
 * 通过名称查找 Place（脚本用，与 API 侧 findPlaceByTemplatePoiNames 对齐）
 */
async function findPlaceByName(
  name: string,
  countryCode?: string
): Promise<{ id: number; uuid: string; nameCN: string; nameEN: string | null; category: string } | null> {
  return findPlaceByTemplatePoiNames(prisma, { nameEN: name, nameCN: name }, countryCode);
}

async function backfillPoiIds(
  pois: DayPlan['pois'],
  countryCode: string,
): Promise<{ pois: DayPlan['pois']; matched: number }> {
  if (!pois?.length) return { pois, matched: 0 };

  let matched = 0;
  const updated = await Promise.all(
    pois.map(async poi => {
      if (poi.id || poi.uuid) return poi;
      const place = await findPlaceByTemplatePoiNames(prisma, poi, countryCode);
      if (!place) return poi;
      matched++;
      return {
        ...poi,
        id: place.id,
        uuid: place.uuid,
        nameCN: place.nameCN,
        nameEN: place.nameEN || poi.nameEN,
        category: place.category || poi.category,
      };
    }),
  );
  return { pois: updated, matched };
}

/**
 * 从 dayPlan 中提取 POI 名称和 UUID
 */
function extractPoiNames(dayPlan: DayPlan): { names: string[]; uuids: string[] } {
  const names = new Set<string>();
  const uuids = new Set<string>();

  // 从 highlights 提取
  if (dayPlan.highlights && Array.isArray(dayPlan.highlights)) {
    dayPlan.highlights.forEach(name => {
      if (typeof name === 'string' && name.trim()) {
        names.add(name.trim());
      }
    });
  }

  // 从 activities 提取
  if (dayPlan.activities && Array.isArray(dayPlan.activities)) {
    dayPlan.activities.forEach(name => {
      if (typeof name === 'string' && name.trim()) {
        names.add(name.trim());
      }
    });
  }

  // 从 overnight 提取
  if (dayPlan.overnight && typeof dayPlan.overnight === 'string') {
    names.add(dayPlan.overnight.trim());
  }

  // 从 title 提取（可能包含地点名称）
  if (dayPlan.title && typeof dayPlan.title === 'string') {
    // 尝试从标题中提取地点名称（简单处理）
    const titleParts = dayPlan.title.split(/[→→→-]/);
    titleParts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed && trimmed.length > 1) {
        names.add(trimmed);
      }
    });
  }

  // 从 requiredNodes 提取
  if (dayPlan.requiredNodes && Array.isArray(dayPlan.requiredNodes)) {
    dayPlan.requiredNodes.forEach(node => {
      if (typeof node === 'string') {
        // 判断是 UUID 还是名称
        if (node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          uuids.add(node);
        } else {
          names.add(node.trim());
        }
      }
    });
  }

  return {
    names: Array.from(names),
    uuids: Array.from(uuids),
  };
}

/**
 * 修复单个路线模板
 */
async function fixRouteTemplate(templateId: number, countryCode: string): Promise<{
  updated: boolean;
  poisAdded: number;
  poisMatched: number;
}> {
  const template = await prisma.routeTemplate.findUnique({
    where: { id: templateId },
    include: {
      routeDirection: {
        select: {
          id: true,
          countryCode: true,
          signaturePois: true,
        },
      },
    },
  });

  if (!template) {
    return { updated: false, poisAdded: 0, poisMatched: 0 };
  }

  const dayPlans = template.dayPlans as DayPlan[] | null;
  if (!dayPlans || !Array.isArray(dayPlans)) {
    return { updated: false, poisAdded: 0, poisMatched: 0 };
  }

  let totalPoisAdded = 0;
  let totalPoisMatched = 0;
  const signaturePoiIds = new Set<number>();

  // 处理每个 dayPlan
  const updatedDayPlans = await Promise.all(
    dayPlans.map(async (dayPlan) => {
      // 已有 pois：回填缺失的地点库 id
      if (dayPlan.pois && Array.isArray(dayPlan.pois) && dayPlan.pois.length > 0) {
        const { pois: backfilledPois, matched } = await backfillPoiIds(dayPlan.pois, countryCode);
        totalPoisMatched += matched;
        for (const poi of backfilledPois ?? []) {
          if (poi.id) signaturePoiIds.add(poi.id);
        }
        if (matched > 0) {
          totalPoisAdded += matched;
          return { ...dayPlan, pois: backfilledPois };
        }
        return dayPlan;
      }

      // 提取 POI 名称和 UUID
      const { names: poiNames, uuids: poiUuids } = extractPoiNames(dayPlan);
      if (poiNames.length === 0 && poiUuids.length === 0) {
        return dayPlan;
      }

      // 查找匹配的 Place
      const pois: Array<{
        id: number;
        uuid: string;
        nameCN: string;
        nameEN?: string;
        category?: string;
        required?: boolean;
        order?: number;
      }> = [];
      const foundPlaceIds = new Set<number>();

      // 先通过 UUID 查找
      if (poiUuids.length > 0) {
        const placesByUuid = await prisma.place.findMany({
          where: {
            uuid: { in: poiUuids },
            ...(countryCode ? {
              City: {
                countryCode: countryCode,
              },
            } : {}),
          },
          select: {
            id: true,
            uuid: true,
            nameCN: true,
            nameEN: true,
            category: true,
          },
        });

        for (const place of placesByUuid) {
          if (!foundPlaceIds.has(place.id)) {
            pois.push({
              id: place.id,
              uuid: place.uuid,
              nameCN: place.nameCN,
              nameEN: place.nameEN || undefined,
              category: place.category,
              required: true, // UUID 匹配的通常是 required
              order: pois.length + 1,
            });
            signaturePoiIds.add(place.id);
            foundPlaceIds.add(place.id);
            totalPoisMatched++;
          }
        }
      }

      // 再通过名称查找
      for (let i = 0; i < poiNames.length; i++) {
        const name = poiNames[i];
        const place = await findPlaceByName(name, countryCode);

        if (place && !foundPlaceIds.has(place.id)) {
          pois.push({
            id: place.id,
            uuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            category: place.category,
            required: dayPlan.requiredNodes?.includes(place.uuid) || false,
            order: pois.length + 1,
          });
          signaturePoiIds.add(place.id);
          foundPlaceIds.add(place.id);
          totalPoisMatched++;
        }
      }

      totalPoisAdded += pois.length;

      // 更新 dayPlan，添加 pois 数组
      return {
        ...dayPlan,
        pois: pois.length > 0 ? pois : undefined,
      };
    })
  );

  // 有回填或新增 POI 时保存
  if (totalPoisAdded > 0 || totalPoisMatched > 0) {
    await prisma.routeTemplate.update({
      where: { id: templateId },
      data: {
        dayPlans: updatedDayPlans as any,
      },
    });
  }

  // 更新 RouteDirection 的 signaturePois.examples
  if (signaturePoiIds.size > 0) {
    const currentSigPois = (template.routeDirection.signaturePois as any) || {};
    const existingExamples = currentSigPois.examples || [];
    const newExamples = Array.from(signaturePoiIds);

    // 合并现有的 examples（去重）
    const allExamples = Array.from(new Set([...existingExamples, ...newExamples]));

    await prisma.routeDirection.update({
      where: { id: template.routeDirectionId },
      data: {
        signaturePois: {
          ...currentSigPois,
          examples: allExamples,
        } as any,
      },
    });
  }

  return {
    updated: totalPoisAdded > 0 || totalPoisMatched > 0,
    poisAdded: totalPoisAdded,
    poisMatched: totalPoisMatched,
  };
}

/**
 * 主函数
 */
async function fixAllRouteTemplates() {
  console.log('============================================================');
  console.log('修复路线模板与 POI 的关联');
  console.log('============================================================\n');

  // 获取所有路线模板
  const templates = await prisma.routeTemplate.findMany({
    include: {
      routeDirection: {
        select: {
          id: true,
          countryCode: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });

  console.log(`📊 找到 ${templates.length} 个路线模板\n`);

  let totalUpdated = 0;
  let totalPoisAdded = 0;
  let totalPoisMatched = 0;

  for (const template of templates) {
    const countryCode = template.routeDirection.countryCode || 'IS';
    
    console.log(`处理模板: ${template.nameCN || template.name} (ID: ${template.id})`);
    console.log(`  国家: ${countryCode}`);

    const result = await fixRouteTemplate(template.id, countryCode);

    if (result.updated) {
      totalUpdated++;
      totalPoisAdded += result.poisAdded;
      totalPoisMatched += result.poisMatched;
      console.log(`  ✅ 已更新: 添加 ${result.poisAdded} 个 POI (匹配 ${result.poisMatched} 个)`);
    } else {
      console.log(`  ⏭️  跳过: 无 POI 可添加`);
    }
    console.log('');
  }

  console.log('\n============================================================');
  console.log('📊 修复统计');
  console.log('============================================================');
  console.log(`总模板数: ${templates.length}`);
  console.log(`已更新模板: ${totalUpdated}`);
  console.log(`总添加 POI: ${totalPoisAdded}`);
  console.log(`总匹配 POI: ${totalPoisMatched}`);
  console.log('============================================================\n');

  await prisma.$disconnect();
}

fixAllRouteTemplates().catch(console.error);
