import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync'; // 需要 npm install csv-parse

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 开始导入 Overture 数据...');
    
    // 1. 读取 CSV
    const csvPath = path.join(process.cwd(), 'overture_japan_data.csv');
    const fileContent = fs.readFileSync(csvPath);
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });
    
    console.log(`📦 读取到 ${records.length} 条数据，准备入库...`);

    // 2. 确保有默认城市 (或者你需要写逻辑根据坐标反查城市)
    const defaultCity = await prisma.city.findFirstOrThrow({
        where: { countryCode: 'JP' } // 假设先塞进"日本通用"或特定城市
    });

    let count = 0;
    for (const row of records) {
        // 3. 数据映射
        // Overture 的 category 需要映射到我们的 Enum
        let category = 'ATTRACTION';
        if (row.category === 'hotel' || row.category === 'hostel') category = 'HOTEL';
        
        // 4. 构造 Metadata (把品牌、电话放进去)
        const metadata = {
            brand: row.brand_name || null,
            phone: row.phone || null,
            website: row.website || null,
            source: 'OVERTURE' // 标记来源，方便以后区分
        };

        try {
            const place = await prisma.place.create({
                data: {
                    name: row.name,
                    googlePlaceId: `ov_${row.id}`, // Overture ID 前加个前缀防冲突
                    address: row.address,
                    category: category as any,
                    cityId: defaultCity.id,
                    metadata: metadata,
                    rating: 0, // Overture 没有评分数据
                }
            });

            // 5. 更新 PostGIS 坐标
            await prisma.$executeRaw`
                UPDATE "Place"
                SET location = ST_SetSRID(ST_MakePoint(${parseFloat(row.lng)}, ${parseFloat(row.lat)}), 4326)
                WHERE id = ${place.id}
            `;
            
            count++;
            if (count % 100 === 0) console.log(`已导入 ${count} 条...`);
        } catch (e) {
            // console.log('跳过重复或错误数据');
        }
    }
    
    console.log('🎉 完成！');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

