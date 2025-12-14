// scripts/update-potala-palace.ts

/**
 * 更新布达拉宫的 physicalMetadata
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const physicalMetadata = {
  has_elevator: false,
  seated_ratio: 0,
  terrain_type: "HILLY",
  intensity_factor: 1.5,
  base_fatigue_score: 5,
  wheelchair_accessible: false,
  estimated_duration_min: 90
};

async function main() {
  console.log('🔍 查找布达拉宫...\n');
  
  // 查找布达拉宫
  const places = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: string;
  }>>`
    SELECT id, "nameCN", "nameEN", category
    FROM "Place"
    WHERE "nameCN" ILIKE '%布达拉%' 
       OR "nameEN" ILIKE '%potala%'
    LIMIT 10
  `;
  
  if (places.length === 0) {
    console.log('❌ 未找到布达拉宫记录');
    console.log('💡 提示：如果需要创建新记录，请提供更多信息（名称、地址、坐标等）');
    return;
  }
  
  console.log(`📊 找到 ${places.length} 条记录:\n`);
  
  for (const place of places) {
    const name = place.nameCN || place.nameEN || `ID: ${place.id}`;
    console.log(`正在更新: ${name} (ID: ${place.id})`);
    
    try {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          physicalMetadata: physicalMetadata as any,
          updatedAt: new Date(),
        } as any,
      });
      
      console.log(`  ✅ 已更新 physicalMetadata`);
    } catch (error: any) {
      console.error(`  ❌ 更新失败: ${error?.message || String(error)}`);
    }
  }
  
  console.log(`\n✅ 更新完成！`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

