"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const westfjordsPois = [
    {
        name_zh: "丁坚地瀑布",
        name_en: "Dynjandi Waterfall",
        category: "Nature",
        coordinates: { latitude: 65.7328, longitude: -23.1998 },
        description: "西峡湾最著名的扇形瀑布，由七个小瀑布组成。"
    },
    {
        name_zh: "拉特拉尔角观鸟悬崖",
        name_en: "Látrabjarg",
        category: "Wildlife",
        coordinates: { latitude: 65.5017, longitude: -24.5317 },
        description: "欧洲最高的飞鸟悬崖，夏季是海鹦 (Puffin) 的聚集地。"
    },
    {
        name_zh: "红沙滩",
        name_en: "Rauðasandur Beach",
        category: "Nature",
        coordinates: { latitude: 65.4452, longitude: -23.9069 },
        description: "罕见的粉红色/金色沙滩，随光线变换颜色。"
    },
    {
        name_zh: "伊萨菲厄泽",
        name_en: "Ísafjörður",
        category: "Town",
        coordinates: { latitude: 66.0747, longitude: -23.1349 },
        description: "西峡湾行政中心，拥有极具风情的古老建筑和港口。"
    },
    {
        name_zh: "冰岛巫术博物馆",
        name_en: "The Museum of Icelandic Sorcery and Witchcraft",
        category: "Culture",
        coordinates: { latitude: 65.7107, longitude: -21.6833 },
        description: "位于侯尔马维克，展示当地诡异且迷人的民俗巫术历史。"
    },
    {
        name_zh: "Hellulaug 天然温泉",
        name_en: "Hellulaug Hot Spring",
        category: "HotSpring",
        coordinates: { latitude: 65.5772, longitude: -23.1589 },
        description: "隐藏在峡湾边缘的天然地热泉，适合一边泡澡一边看海。"
    },
    {
        name_zh: "豪斯川迪尔自然保护区",
        name_en: "Hornstrandir Nature Reserve",
        category: "Wilderness",
        coordinates: { latitude: 66.4167, longitude: -22.5000 },
        description: "冰岛最原始的荒野，无公路直通，是寻找北极狐的天堂。"
    },
    {
        name_zh: "Garðar BA 64 沉船",
        name_en: "Garðar BA 64 Shipwreck",
        category: "Landmark",
        coordinates: { latitude: 65.5167, longitude: -23.8366 },
        description: "冰岛最古老的钢制沉船，著名的摄影打卡地点。"
    },
    {
        name_zh: "博拉山观景台",
        name_en: "Bolafjall Viewpoint",
        category: "Nature",
        coordinates: { latitude: 66.1738, longitude: -23.2754 },
        description: "拥有悬空步道，天气好时可远眺至格陵兰岛的冰川。"
    }
];
async function importPois() {
    console.log('🚀 开始导入冰岛西峡湾 POI...\n');
    let imported = 0;
    let skipped = 0;
    for (const poi of westfjordsPois) {
        const sourceKey = `westfjords_${poi.name_en.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        try {
            const existing = await prisma.poi_canonical.findFirst({
                where: {
                    source: 'MANUAL',
                    source_key: sourceKey,
                },
            });
            if (existing) {
                console.log(`⏭️  跳过（已存在）: ${poi.name_zh} (${poi.name_en})`);
                skipped++;
                continue;
            }
            await prisma.poi_canonical.create({
                data: {
                    source: 'MANUAL',
                    source_key: sourceKey,
                    name_default: poi.name_en,
                    name_i18n: {
                        zh: poi.name_zh,
                        en: poi.name_en,
                    },
                    category: poi.category,
                    lat: poi.coordinates.latitude,
                    lng: poi.coordinates.longitude,
                    tags_slim: {
                        description_zh: poi.description,
                        region: 'Westfjords',
                        country: 'Iceland',
                    },
                    region_key: 'IS_WESTFJORDS',
                    region_name: 'Westfjords, Iceland',
                },
            });
            console.log(`✅ 导入成功: ${poi.name_zh} (${poi.name_en})`);
            imported++;
        }
        catch (error) {
            console.error(`❌ 导入失败: ${poi.name_zh} - ${error.message}`);
        }
    }
    console.log('\n📊 导入完成:');
    console.log(`   ✅ 成功: ${imported}`);
    console.log(`   ⏭️  跳过: ${skipped}`);
    console.log(`   📍 总计: ${westfjordsPois.length}`);
}
importPois()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=import-iceland-westfjords-pois.js.map