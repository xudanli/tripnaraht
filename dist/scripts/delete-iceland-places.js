#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        dryRun: false,
        confirm: false,
    };
    for (const arg of args) {
        if (arg === '--dry-run') {
            options.dryRun = true;
        }
        else if (arg === '--confirm') {
            options.confirm = true;
        }
    }
    return options;
}
async function main() {
    var _a;
    const options = parseArgs();
    console.log('='.repeat(60));
    console.log('删除冰岛 Place 数据脚本');
    console.log('='.repeat(60));
    console.log(`模式: ${options.dryRun ? '🔍 预览模式（不会实际删除）' : '⚠️  删除模式'}`);
    console.log('');
    try {
        console.log('📊 统计冰岛 Place 数据...');
        const icelandCities = await prisma.$queryRaw `
      SELECT id FROM "City" WHERE "countryCode" = 'IS'
    `;
        const cityIds = icelandCities.map(c => c.id);
        console.log(`  找到 ${cityIds.length} 个冰岛城市`);
        const placesByCity = await prisma.place.count({
            where: {
                cityId: {
                    in: cityIds,
                },
            },
        });
        let placesByMetadataQuery;
        if (cityIds.length > 0) {
            placesByMetadataQuery = client_1.Prisma.sql `
        SELECT COUNT(*) as count
        FROM "Place"
        WHERE metadata->>'countryCode' = 'IS'
          AND ("cityId" IS NULL OR "cityId" NOT IN (${client_1.Prisma.join(cityIds)}))
      `;
        }
        else {
            placesByMetadataQuery = client_1.Prisma.sql `
        SELECT COUNT(*) as count
        FROM "Place"
        WHERE metadata->>'countryCode' = 'IS'
      `;
        }
        const placesByMetadata = await prisma.$queryRaw(placesByMetadataQuery);
        const metadataCount = Number(((_a = placesByMetadata[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        const totalCount = placesByCity + metadataCount;
        console.log(`  通过城市关联的 Place: ${placesByCity}`);
        console.log(`  通过 metadata 关联的 Place: ${metadataCount}`);
        console.log(`  总计: ${totalCount} 条\n`);
        if (totalCount === 0) {
            console.log('✅ 没有找到冰岛的 Place 数据');
            return;
        }
        if (!options.dryRun && !options.confirm) {
            console.log('⚠️  警告：这将删除所有冰岛的 Place 数据！');
            console.log('   如果确认，请使用 --confirm 参数');
            console.log('   或者使用 --dry-run 预览将要删除的数据');
            return;
        }
        if (options.dryRun) {
            console.log('🔍 预览模式：不会实际删除数据');
            console.log(`   将删除 ${totalCount} 条 Place 记录`);
        }
        else {
            console.log('🗑️  开始删除...');
            let deletedByCity = 0;
            if (cityIds.length > 0) {
                const result1 = await prisma.place.deleteMany({
                    where: {
                        cityId: {
                            in: cityIds,
                        },
                    },
                });
                deletedByCity = result1.count;
                console.log(`  ✅ 删除通过城市关联的 Place: ${deletedByCity} 条`);
            }
            let deletedByMetadata = 0;
            if (metadataCount > 0) {
                let deleteMetadataQuery;
                if (cityIds.length > 0) {
                    deleteMetadataQuery = client_1.Prisma.sql `
            DELETE FROM "Place"
            WHERE metadata->>'countryCode' = 'IS'
              AND ("cityId" IS NULL OR "cityId" NOT IN (${client_1.Prisma.join(cityIds)}))
          `;
                }
                else {
                    deleteMetadataQuery = client_1.Prisma.sql `
            DELETE FROM "Place"
            WHERE metadata->>'countryCode' = 'IS'
          `;
                }
                const result2 = await prisma.$executeRaw(deleteMetadataQuery);
                deletedByMetadata = typeof result2 === 'number' ? result2 : 0;
                console.log(`  ✅ 删除通过 metadata 关联的 Place: ${deletedByMetadata} 条`);
            }
            console.log(`\n✅ 删除完成！共删除 ${deletedByCity + deletedByMetadata} 条 Place 记录`);
        }
    }
    catch (error) {
        console.error('\n❌ 删除失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=delete-iceland-places.js.map