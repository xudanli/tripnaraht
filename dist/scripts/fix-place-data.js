"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const CATEGORY_TAGS = {
    'Attractions & Nature': ['景点', '自然景观'],
    'Waterfalls': ['瀑布', '自然景观'],
    'Geysers & Hot Springs': ['温泉', '地热'],
    'Glaciers': ['冰川', '自然奇观'],
    'Museums': ['博物馆', '文化'],
    'Beaches': ['海滩', '自然景观'],
    'Mountains': ['山峰', '徒步'],
    'Caves': ['洞穴', '探险'],
    'Churches': ['教堂', '历史建筑'],
    'Restaurants': ['餐厅', '美食'],
    'Cafes': ['咖啡厅', '休闲'],
    'Hotels': ['酒店', '住宿'],
    'Hostels': ['青旅', '住宿'],
    'Camping': ['露营', '户外'],
    'Supermarkets': ['超市', '购物'],
    'Gas Stations': ['加油站', '服务'],
};
const TOURISM_TAGS = {
    'attraction': ['景点'],
    'viewpoint': ['观景点', '拍照'],
    'museum': ['博物馆', '文化'],
    'hotel': ['酒店', '住宿'],
    'hostel': ['青旅', '住宿'],
    'camp_site': ['露营', '户外'],
    'information': ['游客中心', '信息'],
    'waterfall': ['瀑布', '自然景观'],
};
function parseOsmHours(osmHours) {
    const result = { text: osmHours };
    if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(osmHours)) {
        result.weekday = osmHours;
        result.weekend = osmHours;
        return result;
    }
    const allDaysMatch = osmHours.match(/Mo-Su\s+(\d{2}:\d{2}-\d{2}:\d{2})/i);
    if (allDaysMatch) {
        result.weekday = allDaysMatch[1];
        result.weekend = allDaysMatch[1];
        return result;
    }
    const weekdayMatch = osmHours.match(/Mo-Fr\s+(\d{2}:\d{2}-\d{2}:\d{2})/i);
    const weekendMatch = osmHours.match(/Sa-Su\s+(\d{2}:\d{2}-\d{2}:\d{2})/i);
    if (weekdayMatch)
        result.weekday = weekdayMatch[1];
    if (weekendMatch)
        result.weekend = weekendMatch[1];
    return result;
}
function generateTags(metadata) {
    var _a, _b, _c;
    const tags = [];
    if (metadata.profile && CATEGORY_TAGS[metadata.profile]) {
        tags.push(...CATEGORY_TAGS[metadata.profile]);
    }
    const tourism = (_a = metadata.rawTags) === null || _a === void 0 ? void 0 : _a.tourism;
    if (tourism && TOURISM_TAGS[tourism]) {
        tags.push(...TOURISM_TAGS[tourism]);
    }
    if (((_b = metadata.rawTags) === null || _b === void 0 ? void 0 : _b.waterway) === 'waterfall') {
        tags.push('瀑布', '自然景观');
    }
    const natural = (_c = metadata.rawTags) === null || _c === void 0 ? void 0 : _c.natural;
    if (natural) {
        const naturalTags = {
            'glacier': ['冰川', '自然奇观'],
            'hot_spring': ['温泉', '地热'],
            'geyser': ['间歇泉', '地热'],
            'beach': ['海滩', '自然景观'],
            'cave_entrance': ['洞穴', '探险'],
            'peak': ['山峰', '徒步'],
        };
        if (naturalTags[natural])
            tags.push(...naturalTags[natural]);
    }
    return [...new Set(tags)];
}
function generateAddress(metadata, nameEN) {
    const rawTags = metadata.rawTags || {};
    if (rawTags['addr:full'])
        return rawTags['addr:full'];
    const parts = [];
    if (rawTags['addr:street'])
        parts.push(rawTags['addr:street']);
    if (rawTags['addr:city'])
        parts.push(rawTags['addr:city']);
    if (rawTags['addr:postcode'])
        parts.push(rawTags['addr:postcode']);
    if (parts.length > 0)
        return parts.join(', ');
    const region = metadata.regionKey || rawTags.region;
    if (region) {
        const regionNames = {
            'IS_REYKJAVIK': 'Reykjavík, Iceland',
            'IS_GOLDEN_CIRCLE': 'Golden Circle, South Iceland',
            'IS_SOUTH_COAST': 'South Coast, Iceland',
            'IS_EAST': 'East Iceland',
            'IS_NORTH': 'North Iceland',
            'IS_WEST': 'West Iceland',
            'IS_WESTFJORDS': 'Westfjords, Iceland',
            'IS_HIGHLANDS': 'Highlands, Iceland',
            'IS_HOFN': 'Höfn, South Iceland',
        };
        if (regionNames[region]) {
            return nameEN ? `${nameEN}, ${regionNames[region]}` : regionNames[region];
        }
    }
    if (metadata.countryCode === 'IS')
        return 'Iceland';
    return '';
}
async function fixPlaceData() {
    console.log('🔧 开始修复 Place 数据...\n');
    const beforeStats = await prisma.$queryRaw `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN address IS NULL OR address = '' THEN 1 ELSE 0 END) as no_addr,
      SUM(CASE WHEN metadata->>'openingHours' IS NULL THEN 1 ELSE 0 END) as no_hours,
      SUM(CASE WHEN metadata->>'tags' IS NULL THEN 1 ELSE 0 END) as no_tags
    FROM "Place"
    WHERE metadata->>'countryCode' = 'IS'
  `;
    console.log('📊 修复前 (冰岛):', beforeStats[0]);
    const places = await prisma.$queryRaw `
    SELECT id, "nameCN", "nameEN", address, rating, metadata
    FROM "Place"
    WHERE metadata->>'countryCode' = 'IS'
    ORDER BY id
  `;
    console.log(`\n📍 找到 ${places.length} 个冰岛地点需要处理\n`);
    let updated = 0;
    let errors = 0;
    for (const place of places) {
        try {
            const metadata = place.metadata || {};
            const rawTags = metadata.rawTags || {};
            const updates = {};
            let metadataUpdates = {};
            if (!place.address || place.address === '') {
                const newAddress = generateAddress(metadata, place.nameEN);
                if (newAddress) {
                    updates.address = newAddress;
                }
            }
            if (!place.rating || place.rating === 0) {
                if (metadata.profile === 'Attractions & Nature' || rawTags.tourism === 'attraction') {
                    updates.rating = 4.0;
                }
                else if (rawTags.tourism === 'hotel' || rawTags.tourism === 'hostel') {
                    updates.rating = 3.8;
                }
                else {
                    updates.rating = 3.5;
                }
            }
            if (!metadata.openingHours && rawTags.opening_hours) {
                metadataUpdates.openingHours = parseOsmHours(rawTags.opening_hours);
            }
            if (!metadata.phone && rawTags.phone) {
                metadataUpdates.phone = rawTags.phone;
            }
            if (!metadata.website && rawTags.website) {
                metadataUpdates.website = rawTags.website;
            }
            if (!metadata.tags) {
                const tags = generateTags(metadata);
                if (tags.length > 0) {
                    metadataUpdates.tags = tags;
                }
            }
            if (Object.keys(updates).length > 0 || Object.keys(metadataUpdates).length > 0) {
                const newMetadata = { ...metadata, ...metadataUpdates };
                await prisma.$executeRaw `
          UPDATE "Place" 
          SET 
            address = COALESCE(${updates.address || null}, address),
            rating = COALESCE(${updates.rating || null}, rating),
            metadata = ${newMetadata}::jsonb,
            "updatedAt" = NOW()
          WHERE id = ${place.id}
        `;
                updated++;
                if (updated % 100 === 0) {
                    console.log(`✅ 已更新 ${updated} 条记录...`);
                }
            }
        }
        catch (err) {
            errors++;
            console.error(`❌ 更新 ${place.id} (${place.nameCN}) 失败:`, err);
        }
    }
    console.log(`\n🎉 修复完成！`);
    console.log(`   更新: ${updated} 条`);
    console.log(`   错误: ${errors} 条`);
    const afterStats = await prisma.$queryRaw `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN address IS NULL OR address = '' THEN 1 ELSE 0 END) as no_addr,
      SUM(CASE WHEN metadata->>'openingHours' IS NULL THEN 1 ELSE 0 END) as no_hours,
      SUM(CASE WHEN metadata->>'tags' IS NULL THEN 1 ELSE 0 END) as no_tags
    FROM "Place"
    WHERE metadata->>'countryCode' = 'IS'
  `;
    console.log('\n📊 修复后 (冰岛):', afterStats[0]);
}
fixPlaceData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=fix-place-data.js.map