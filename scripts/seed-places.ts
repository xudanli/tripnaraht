// scripts/seed-places.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface PlaceData {
    name: string;
    address?: string;
    googlePlaceId: string;
    location: { lat: number; lng: number };
    metadata: any;
    rating?: number;
    category: string;
}

async function seed() {
    console.log('🌱 开始导入数据 (纯中文版)...');

    const dataPath = path.join(process.cwd(), 'places-data.json');
    if (!fs.existsSync(dataPath)) {
        console.error(`❌ 文件不存在: ${dataPath}`);
        process.exit(1);
    }

    const data: PlaceData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    console.log(`📦 读取到 ${data.length} 条数据`);

    // 1. 确保默认城市 (冰岛)
    // 直接查找或创建 Reykjavik
    let defaultCity = await prisma.city.findFirst({
        where: { name: 'Reykjavik', countryCode: 'IS' } 
    });

    if (!defaultCity) {
        defaultCity = await prisma.city.create({
            data: { name: 'Reykjavik', countryCode: 'IS' }
        });
        console.log(`✅ 创建默认城市: Reykjavik`);
    }

    let successCount = 0;
    let skipCount = 0;

    // ============================================
    // 步骤 1: 改进分类映射（使用原始分类 + 扩展关键词）
    // ============================================
    /**
     * 扩充的分类映射表
     * 
     * 策略：
     * 1. 优先使用 metadata.rawCategory（Google 的原始分类）
     * 2. 使用扩展关键词匹配
     * 3. 保存原始分类到 metadata，供前端细分显示
     */
    const categoryMap: Record<string, string> = {
        // 餐厅相关
        'RESTAURANT': 'RESTAURANT',
        '餐厅': 'RESTAURANT',
        '拉面馆': 'RESTAURANT',
        '美食': 'RESTAURANT',
        '咖啡馆': 'RESTAURANT',
        '咖啡': 'RESTAURANT',
        'CAFE': 'RESTAURANT',
        
        // 景点相关
        'ATTRACTION': 'ATTRACTION',
        '景点': 'ATTRACTION',
        '旅游景点': 'ATTRACTION',
        '温泉': 'ATTRACTION',
        '温泉浴场': 'ATTRACTION',
        '瀑布': 'ATTRACTION',
        '公园': 'ATTRACTION',
        '博物馆': 'ATTRACTION',
        '游乐园': 'ATTRACTION',
        'WATERFALL': 'ATTRACTION',
        'GEYSER': 'ATTRACTION',
        'BEACH': 'ATTRACTION',
        
        // 购物相关
        'SHOPPING': 'SHOPPING',
        '购物': 'SHOPPING',
        '超市': 'SHOPPING',
        '便利店': 'SHOPPING',
        'SUPERMARKET': 'SHOPPING',
        'STORE': 'SHOPPING',
        
        // 酒店相关
        'HOTEL': 'HOTEL',
        '酒店': 'HOTEL',
        '宾馆': 'HOTEL',
        '住宿': 'HOTEL',
    };

    for (const item of data) {
        try {
            // 1.1: 优先从 metadata.rawCategory 获取原始分类
            const rawCategory = item.metadata?.rawCategory || item.category || '';
            const rawCategoryStr = rawCategory.toUpperCase();
            
            // 1.2: 尝试从映射表匹配
            let category = 'ATTRACTION'; // 默认值
            
            // 直接匹配
            if (categoryMap[rawCategoryStr]) {
                category = categoryMap[rawCategoryStr];
            } else {
                // 关键词匹配（包含检测）
                for (const [keyword, mappedCategory] of Object.entries(categoryMap)) {
                    if (rawCategoryStr.includes(keyword) || rawCategory.includes(keyword)) {
                        category = mappedCategory;
                        break;
                    }
                }
            }
            
            // 1.3: 确保 metadata 中包含原始分类（用于前端细分显示）
            if (!item.metadata) {
                item.metadata = {};
            }
            if (!item.metadata.rawCategory) {
                item.metadata.rawCategory = rawCategory;
            }

            // ============================================
            // 步骤 2: 空间去重（检查 100 米内是否有相似名称的地点）
            // ============================================
            // 使用 PostGIS 查询附近 100 米内的地点
            const nearbyDuplicates = await prisma.$queryRaw<any[]>`
                SELECT 
                    id, 
                    name,
                    ST_Distance(
                        location, 
                        ST_SetSRID(ST_MakePoint(${item.location.lng}, ${item.location.lat}), 4326)::geography
                    ) as distance_meters
                FROM "Place"
                WHERE 
                    location IS NOT NULL
                    AND ST_DWithin(
                        location, 
                        ST_SetSRID(ST_MakePoint(${item.location.lng}, ${item.location.lat}), 4326)::geography, 
                        100
                    )
            `;

            // 2.1: 名字相似度检查（简单版：包含检测）
            // 例如："Blue Lagoon" 和 "Blue Lagoon Parking" 视为重复
            const isDuplicate = nearbyDuplicates.some((existing: any) => {
                const existingName = existing.name.toLowerCase();
                const currentName = item.name.toLowerCase();
                
                // 如果名字相互包含，视为重复
                return existingName.includes(currentName) || currentName.includes(existingName);
            });

            if (isDuplicate) {
                const duplicateName = nearbyDuplicates[0]?.name || '未知';
                const distance = Math.round(nearbyDuplicates[0]?.distance_meters || 0);
                console.log(`🗑️  跳过疑似重复数据: ${item.name} (附近 ${distance}m 已有: ${duplicateName})`);
                skipCount++;
                continue; // 跳过当前循环，不插入
            }

            // ============================================
            // 步骤 3: 入库 (不处理 nameEN，只存 name)
            // ============================================
            const place = await prisma.place.upsert({
                where: { googlePlaceId: item.googlePlaceId },
                update: {
                    name: item.name,        // 中文名
                    address: item.address,
                    metadata: item.metadata,
                    rating: item.rating,
                    updatedAt: new Date(),
                },
                create: {
                    name: item.name,
                    googlePlaceId: item.googlePlaceId,
                    address: item.address,
                    category: category as any,
                    cityId: defaultCity.id,
                    metadata: item.metadata,
                    rating: item.rating || 0,
                }
            });

            // 3. 更新坐标
            await prisma.$executeRaw`
                UPDATE "Place"
                SET location = ST_SetSRID(ST_MakePoint(${item.location.lng}, ${item.location.lat}), 4326)
                WHERE id = ${place.id}
            `;

            successCount++;
            console.log(`✅ 已导入: ${item.name} [${category}]${rawCategory ? ` (${rawCategory})` : ''}`);

        } catch (error: any) {
            if (error.code === 'P2002') {
                // 唯一约束冲突（googlePlaceId 重复）
                console.log(`⏭️  跳过重复项: ${item.name} (googlePlaceId 已存在)`);
                skipCount++;
            } else {
                console.error(`❌ 导入失败: ${item.name}`, error.message);
            }
        }
    }

    // ============================================
    // 步骤 4: 输出统计信息
    // ============================================
    console.log(`\n📊 导入统计:`);
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ⏭️  跳过: ${skipCount} (重复或去重)`);
    console.log(`   📦 总计: ${data.length}`);
    console.log(`\n🎉 导入完成!`);
}

seed().catch(console.error).finally(() => prisma.$disconnect());