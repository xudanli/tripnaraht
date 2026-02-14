"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_LIMIT = 10000;
const CATEGORY_MAPPING = {
    'attraction': client_1.PlaceCategory.ATTRACTION,
    'restaurant': client_1.PlaceCategory.RESTAURANT,
    'cafe': client_1.PlaceCategory.RESTAURANT,
    'food': client_1.PlaceCategory.RESTAURANT,
    'shopping': client_1.PlaceCategory.SHOPPING,
    'shop': client_1.PlaceCategory.SHOPPING,
    'hotel': client_1.PlaceCategory.HOTEL,
    'accommodation': client_1.PlaceCategory.HOTEL,
    'transit': client_1.PlaceCategory.TRANSIT_HUB,
    'transport': client_1.PlaceCategory.TRANSIT_HUB,
    'airport': client_1.PlaceCategory.TRANSIT_HUB,
    'station': client_1.PlaceCategory.TRANSIT_HUB,
};
function extractLocation(location, lat, lng) {
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
    }
    if (!location)
        return null;
    if (typeof location === 'string') {
        const match = location.match(/POINT\(([^)]+)\)/);
        if (match) {
            const [lngStr, latStr] = match[1].split(/\s+/).map(parseFloat);
            if (!isNaN(latStr) && !isNaN(lngStr)) {
                return { lat: latStr, lng: lngStr };
            }
        }
    }
    if (typeof location === 'object') {
        if (location.coordinates && Array.isArray(location.coordinates)) {
            const [lngVal, latVal] = location.coordinates;
            if (!isNaN(latVal) && !isNaN(lngVal)) {
                return { lat: latVal, lng: lngVal };
            }
        }
        if (location.lat && location.lng) {
            const latVal = typeof location.lat === 'number' ? location.lat : parseFloat(location.lat);
            const lngVal = typeof location.lng === 'number' ? location.lng : parseFloat(location.lng);
            if (!isNaN(latVal) && !isNaN(lngVal)) {
                return { lat: latVal, lng: lngVal };
            }
        }
    }
    return null;
}
function isValidIcelandLocation(lat, lng) {
    return lat >= 63.4 && lat <= 66.5 && lng >= -24.5 && lng <= -13.5;
}
function normalizeCategory(category) {
    if (typeof category === 'string') {
        const normalized = category.toLowerCase().trim();
        return CATEGORY_MAPPING[normalized] || client_1.PlaceCategory.ATTRACTION;
    }
    return category;
}
function extractNormalizedTags(metadata) {
    if (!metadata)
        return [];
    const tags = new Set();
    if (metadata.type) {
        if (Array.isArray(metadata.type)) {
            metadata.type.forEach((t) => {
                if (typeof t === 'string')
                    tags.add(t.toLowerCase().trim());
            });
        }
        else if (typeof metadata.type === 'string') {
            metadata.type.split(',').forEach((t) => {
                const trimmed = t.trim().toLowerCase();
                if (trimmed)
                    tags.add(trimmed);
            });
        }
    }
    if (metadata.tags && Array.isArray(metadata.tags)) {
        metadata.tags.forEach((t) => {
            if (typeof t === 'string')
                tags.add(t.toLowerCase().trim());
        });
    }
    return Array.from(tags);
}
function validateEmbedding(embedding) {
    if (!embedding) {
        return { valid: false };
    }
    let embeddingArray = [];
    if (typeof embedding === 'string') {
        const match = embedding.match(/\[(.*?)\]/);
        if (match) {
            embeddingArray = match[1].split(',').map(v => parseFloat(v.trim()));
        }
    }
    else if (Array.isArray(embedding)) {
        embeddingArray = embedding;
    }
    if (embeddingArray.length === 0) {
        return { valid: false };
    }
    const dimension = embeddingArray.length;
    const hasNaN = embeddingArray.some(v => isNaN(v));
    const hasInf = embeddingArray.some(v => !isFinite(v));
    return {
        valid: !hasNaN && !hasInf && dimension > 0,
        dimension,
        hasNaN,
        hasInf,
    };
}
function fixTimestamps(metadata) {
    const result = {};
    if (metadata === null || metadata === void 0 ? void 0 : metadata.lastEnrichedAt) {
        try {
            const date = new Date(metadata.lastEnrichedAt);
            if (!isNaN(date.getTime())) {
                result.updatedAt = date;
            }
        }
        catch (e) {
        }
    }
    if (metadata === null || metadata === void 0 ? void 0 : metadata.publishDate) {
        try {
            const date = new Date(metadata.publishDate);
            if (!isNaN(date.getTime())) {
                result.createdAt = date;
            }
        }
        catch (e) {
        }
    }
    return result;
}
function determineBucket(place, locationValid, embeddingValid, hasValidCategory, hasName) {
    if (!hasName || !locationValid) {
        return 'DROP';
    }
    if (!embeddingValid || !hasValidCategory) {
        return 'DISPLAY_ONLY';
    }
    return 'EXECUTABLE';
}
async function cleanPlace(place) {
    const result = {
        placeId: place.id,
        uuid: place.uuid,
        nameCN: place.nameCN || '',
        bucket: 'DROP',
        issues: [],
        changes: {},
    };
    const location = extractLocation(place.location, place.lat, place.lng);
    const locationValid = location && isValidIcelandLocation(location.lat, location.lng);
    if (!location) {
        result.issues.push('location 缺失或无法解析');
    }
    else if (!locationValid) {
        result.issues.push(`location 超出冰岛范围: (${location.lat}, ${location.lng})`);
    }
    const originalCategory = place.category;
    const normalizedCategory = normalizeCategory(originalCategory);
    if (originalCategory !== normalizedCategory) {
        result.changes.category = {
            from: originalCategory,
            to: normalizedCategory,
        };
        result.issues.push(`category 需要映射: ${originalCategory} -> ${normalizedCategory}`);
    }
    const metadata = place.metadata || {};
    const normalizedTags = extractNormalizedTags(metadata);
    if (normalizedTags.length > 0) {
        result.changes.metadata = {
            ...result.changes.metadata,
            normalized_tags: normalizedTags,
        };
    }
    const timestampFixes = fixTimestamps(metadata);
    if (timestampFixes.createdAt || timestampFixes.updatedAt) {
        result.changes.timestamps = timestampFixes;
    }
    const embeddingValidation = validateEmbedding(place.embedding);
    if (!embeddingValidation.valid) {
        result.changes.metadata = {
            ...result.changes.metadata,
            skip_vector_index: true,
        };
        if (embeddingValidation.hasNaN) {
            result.issues.push('embedding 包含 NaN');
        }
        if (embeddingValidation.hasInf) {
            result.issues.push('embedding 包含 Inf');
        }
        if (!embeddingValidation.dimension || embeddingValidation.dimension === 0) {
            result.issues.push('embedding 维度无效');
        }
    }
    const hasName = !!(place.nameCN || place.nameEN);
    result.bucket = determineBucket(place, locationValid || false, embeddingValidation.valid, !!normalizedCategory, hasName);
    return result;
}
function generateRollbackSQL(result, originalData) {
    const updates = [];
    if (result.changes.category) {
        updates.push(`category = '${originalData.category}'::"PlaceCategory"`);
    }
    if (result.changes.metadata) {
        updates.push(`metadata = metadata - 'cleaning_audit'`);
        if (result.changes.metadata.normalized_tags) {
            updates.push(`metadata = metadata - 'normalized_tags'`);
        }
        if (result.changes.metadata.skip_vector_index !== undefined) {
            updates.push(`metadata = metadata - 'skip_vector_index'`);
        }
    }
    if (result.changes.timestamps) {
        if (result.changes.timestamps.createdAt) {
            updates.push(`"createdAt" = '${originalData.createdAt.toISOString()}'::timestamp`);
        }
        if (result.changes.timestamps.updatedAt) {
            updates.push(`"updatedAt" = '${originalData.updatedAt.toISOString()}'::timestamp`);
        }
    }
    if (updates.length === 0) {
        return '';
    }
    return `UPDATE "Place" SET ${updates.join(', ')} WHERE id = ${result.placeId};`;
}
async function processBatch(places, batchNum, isDryRun) {
    const result = {
        batchNum,
        total: places.length,
        processed: 0,
        executable: 0,
        displayOnly: 0,
        drop: 0,
        errors: [],
        rollbackSQL: '',
    };
    const cleaningResults = [];
    const rollbackSQLs = [];
    console.log(`\n=== 批次 ${batchNum}：处理 ${places.length} 个 Place ===`);
    for (const place of places) {
        try {
            const cleaningResult = await cleanPlace(place);
            cleaningResults.push(cleaningResult);
            if (cleaningResult.bucket === 'EXECUTABLE') {
                result.executable++;
            }
            else if (cleaningResult.bucket === 'DISPLAY_ONLY') {
                result.displayOnly++;
            }
            else {
                result.drop++;
            }
            result.processed++;
        }
        catch (error) {
            result.errors.push({
                placeId: place.id,
                error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
            });
        }
    }
    for (const cleaningResult of cleaningResults) {
        const originalPlace = places.find(p => p.id === cleaningResult.placeId);
        if (originalPlace) {
            const rollbackSQL = generateRollbackSQL(cleaningResult, originalPlace);
            if (rollbackSQL) {
                rollbackSQLs.push(rollbackSQL);
            }
        }
    }
    result.rollbackSQL = rollbackSQLs.join('\n');
    if (!isDryRun && cleaningResults.length > 0) {
        try {
            await prisma.$transaction(async (tx) => {
                var _a, _b;
                for (const cleaningResult of cleaningResults) {
                    const originalPlace = places.find(p => p.id === cleaningResult.placeId);
                    if (!originalPlace)
                        continue;
                    const updateData = {
                        updatedAt: new Date(),
                    };
                    if (cleaningResult.changes.category) {
                        updateData.category = cleaningResult.changes.category.to;
                    }
                    const currentMetadata = originalPlace.metadata || {};
                    const newMetadata = { ...currentMetadata };
                    if ((_a = cleaningResult.changes.metadata) === null || _a === void 0 ? void 0 : _a.normalized_tags) {
                        newMetadata.normalized_tags = cleaningResult.changes.metadata.normalized_tags;
                    }
                    if (((_b = cleaningResult.changes.metadata) === null || _b === void 0 ? void 0 : _b.skip_vector_index) !== undefined) {
                        newMetadata.skip_vector_index = cleaningResult.changes.metadata.skip_vector_index;
                    }
                    newMetadata.cleaning_audit = {
                        cleaned_at: new Date().toISOString(),
                        bucket: cleaningResult.bucket,
                        issues: cleaningResult.issues,
                    };
                    updateData.metadata = newMetadata;
                    if (cleaningResult.changes.timestamps) {
                        if (cleaningResult.changes.timestamps.createdAt) {
                            updateData.createdAt = cleaningResult.changes.timestamps.createdAt;
                        }
                        if (cleaningResult.changes.timestamps.updatedAt) {
                            updateData.updatedAt = cleaningResult.changes.timestamps.updatedAt;
                        }
                    }
                    await tx.place.update({
                        where: { id: cleaningResult.placeId },
                        data: updateData,
                    });
                }
            });
            console.log(`✓ 批次 ${batchNum} 更新完成`);
        }
        catch (error) {
            console.error(`✗ 批次 ${batchNum} 更新失败:`, error.message);
            result.errors.push({
                placeId: 0,
                error: `事务失败: ${error.message}`,
            });
        }
    }
    else {
        console.log(`[DRY-RUN] 批次 ${batchNum} 跳过实际更新`);
        const hasChanges = cleaningResults.some(r => r.changes.category ||
            r.changes.metadata ||
            r.changes.timestamps);
        if (hasChanges) {
            console.log(`  [预览] 将更新 ${cleaningResults.filter(r => r.changes.category || r.changes.metadata || r.changes.timestamps).length} 个 Place`);
        }
    }
    return result;
}
async function verifyBatch(batchNum, placeIds) {
    var _a;
    const places = await prisma.$queryRaw `
    SELECT id, metadata
    FROM "Place"
    WHERE id = ANY(${placeIds}::int[])
  `;
    let executable = 0;
    let displayOnly = 0;
    let drop = 0;
    for (const place of places) {
        const audit = (_a = place.metadata) === null || _a === void 0 ? void 0 : _a.cleaning_audit;
        if (audit) {
            if (audit.bucket === 'EXECUTABLE')
                executable++;
            else if (audit.bucket === 'DISPLAY_ONLY')
                displayOnly++;
            else
                drop++;
        }
    }
    return {
        verified: places.length,
        executable,
        displayOnly,
        drop,
    };
}
async function main() {
    var _a;
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    const batchSize = batchSizeArg
        ? parseInt(batchSizeArg.split('=')[1], 10)
        : DEFAULT_BATCH_SIZE;
    const limit = limitArg
        ? parseInt(limitArg.split('=')[1], 10)
        : DEFAULT_LIMIT;
    console.log('=== 冰岛 POI 数据清洗脚本 ===\n');
    console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
    console.log(`批次大小: ${batchSize}`);
    console.log(`处理限制: ${limit}\n`);
    try {
        console.log('查询冰岛所有 Place...');
        const totalCount = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
    `;
        console.log(`  冰岛 Place 总数: ${((_a = totalCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
        const icelandPlacesRaw = await prisma.$queryRaw `
      SELECT 
        p.id,
        p.uuid,
        p."nameCN",
        p."nameEN",
        p.category,
        CASE 
          WHEN p.location IS NOT NULL THEN p.location::text
          ELSE NULL
        END as location,
        p.address,
        p.metadata,
        CASE 
          WHEN p.embedding IS NOT NULL THEN p.embedding::text
          ELSE NULL
        END as embedding,
        p."createdAt",
        p."updatedAt",
        CASE 
          WHEN p.location IS NOT NULL THEN ST_Y(p.location::geometry)
          ELSE NULL
        END as lat,
        CASE 
          WHEN p.location IS NOT NULL THEN ST_X(p.location::geometry)
          ELSE NULL
        END as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
      ORDER BY p.id
      LIMIT ${limit}
    `;
        const icelandPlaces = icelandPlacesRaw.map(p => ({
            ...p,
            lat: p.lat !== null ? Number(p.lat) : null,
            lng: p.lng !== null ? Number(p.lng) : null,
        }));
        console.log(`✓ 找到 ${icelandPlaces.length} 个需要清洗的 Place\n`);
        if (icelandPlaces.length === 0) {
            console.log('没有需要清洗的 Place。');
            return;
        }
        const allResults = [];
        const totalBatches = Math.ceil(icelandPlaces.length / batchSize);
        for (let i = 0; i < icelandPlaces.length; i += batchSize) {
            const batch = icelandPlaces.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const batchResult = await processBatch(batch, batchNum, isDryRun);
            allResults.push(batchResult);
            if (!isDryRun) {
                const placeIds = batch.map(p => p.id);
                const verification = await verifyBatch(batchNum, placeIds);
                console.log(`  复核: EXECUTABLE=${verification.executable}, DISPLAY_ONLY=${verification.displayOnly}, DROP=${verification.drop}`);
            }
            if (i + batchSize < icelandPlaces.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        console.log('\n=== 清洗完成 ===');
        const totalProcessed = allResults.reduce((sum, r) => sum + r.processed, 0);
        const totalExecutable = allResults.reduce((sum, r) => sum + r.executable, 0);
        const totalDisplayOnly = allResults.reduce((sum, r) => sum + r.displayOnly, 0);
        const totalDrop = allResults.reduce((sum, r) => sum + r.drop, 0);
        const totalErrors = allResults.reduce((sum, r) => sum + r.errors.length, 0);
        console.log(`总计处理: ${totalProcessed}`);
        console.log(`EXECUTABLE: ${totalExecutable} (${(totalExecutable / totalProcessed * 100).toFixed(1)}%)`);
        console.log(`DISPLAY_ONLY: ${totalDisplayOnly} (${(totalDisplayOnly / totalProcessed * 100).toFixed(1)}%)`);
        console.log(`DROP: ${totalDrop} (${(totalDrop / totalProcessed * 100).toFixed(1)}%)`);
        console.log(`错误: ${totalErrors}`);
        if (totalErrors > 0) {
            console.log('\n错误详情（前 10 个）:');
            const allErrors = allResults.flatMap(r => r.errors);
            allErrors.slice(0, 10).forEach(err => {
                console.log(`  - Place ${err.placeId}: ${err.error}`);
            });
            if (allErrors.length > 10) {
                console.log(`  ... 还有 ${allErrors.length - 10} 个错误`);
            }
        }
    }
    catch (error) {
        console.error('\n❌ 脚本执行失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
if (require.main === module) {
    main().catch(error => {
        console.error('未处理的错误:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=clean-iceland-poi-data.js.map