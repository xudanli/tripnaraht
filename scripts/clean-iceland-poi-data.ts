/**
 * 冰岛 POI 数据清洗脚本
 * 
 * 用途：
 * - 对 place 表中的 20,000+ 冰岛 POI 进行清洗与分桶
 * - EXECUTABLE：可用于路线决策
 * - DISPLAY_ONLY：可展示不可执行
 * - DROP：应剔除（或软删除）
 * 
 * 使用方法：
 *   tsx scripts/clean-iceland-poi-data.ts [--dry-run] [--batch-size=500] [--limit=1000]
 * 
 * 或使用 npm script：
 *   npm run script:clean-iceland-poi
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';

const prisma = new PrismaClient();

// 配置
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_LIMIT = 10000; // 默认处理前 10000 条，避免一次性处理过多

// 数据分桶类型
type PlaceBucket = 'EXECUTABLE' | 'DISPLAY_ONLY' | 'DROP';

// PlaceCategory 映射（从外部来源映射到内部枚举）
const CATEGORY_MAPPING: Record<string, PlaceCategory> = {
  'attraction': PlaceCategory.ATTRACTION,
  'restaurant': PlaceCategory.RESTAURANT,
  'cafe': PlaceCategory.RESTAURANT,
  'food': PlaceCategory.RESTAURANT,
  'shopping': PlaceCategory.SHOPPING,
  'shop': PlaceCategory.SHOPPING,
  'hotel': PlaceCategory.HOTEL,
  'accommodation': PlaceCategory.HOTEL,
  'transit': PlaceCategory.TRANSIT_HUB,
  'transport': PlaceCategory.TRANSIT_HUB,
  'airport': PlaceCategory.TRANSIT_HUB,
  'station': PlaceCategory.TRANSIT_HUB,
};

// 清洗结果接口
interface CleaningResult {
  placeId: number;
  uuid: string;
  nameCN: string;
  bucket: PlaceBucket;
  issues: string[];
  changes: {
    category?: { from: string; to: PlaceCategory };
    location?: { fixed: boolean; reason?: string };
    metadata?: { normalized_tags?: string[]; skip_vector_index?: boolean };
    timestamps?: { createdAt?: Date; updatedAt?: Date };
  };
}

// 批次处理结果
interface BatchResult {
  batchNum: number;
  total: number;
  processed: number;
  executable: number;
  displayOnly: number;
  drop: number;
  errors: Array<{ placeId: number; error: string }>;
  rollbackSQL: string;
}

/**
 * 从 PostGIS geography 提取经纬度
 * 注意：如果查询结果中已经包含 lat/lng 字段，直接使用它们
 */
function extractLocation(location: any, lat?: number, lng?: number): { lat: number; lng: number } | null {
  // 优先使用查询结果中的 lat/lng（从 ST_Y/ST_X 提取）
  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    return { lat, lng };
  }

  if (!location) return null;

  // 如果是字符串格式 (POINT(lng lat))
  if (typeof location === 'string') {
    const match = location.match(/POINT\(([^)]+)\)/);
    if (match) {
      const [lngStr, latStr] = match[1].split(/\s+/).map(parseFloat);
      if (!isNaN(latStr) && !isNaN(lngStr)) {
        return { lat: latStr, lng: lngStr };
      }
    }
  }

  // 如果是对象格式
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

/**
 * 验证 location 是否有效（在冰岛范围内）
 */
function isValidIcelandLocation(lat: number, lng: number): boolean {
  // 冰岛大致范围：纬度 63.4°N - 66.5°N，经度 -24.5°W - -13.5°W
  return lat >= 63.4 && lat <= 66.5 && lng >= -24.5 && lng <= -13.5;
}

/**
 * 统一 category 到内部枚举
 */
function normalizeCategory(category: string | PlaceCategory): PlaceCategory {
  if (typeof category === 'string') {
    const normalized = category.toLowerCase().trim();
    return CATEGORY_MAPPING[normalized] || PlaceCategory.ATTRACTION; // 默认 ATTRACTION
  }
  return category;
}

/**
 * 从 metadata.type 拆分去重为 normalized_tags
 */
function extractNormalizedTags(metadata: any): string[] {
  if (!metadata) return [];

  const tags: Set<string> = new Set();

  // 从 metadata.type 提取
  if (metadata.type) {
    if (Array.isArray(metadata.type)) {
      metadata.type.forEach((t: any) => {
        if (typeof t === 'string') tags.add(t.toLowerCase().trim());
      });
    } else if (typeof metadata.type === 'string') {
      // 可能是逗号分隔的字符串
      metadata.type.split(',').forEach((t: string) => {
        const trimmed = t.trim().toLowerCase();
        if (trimmed) tags.add(trimmed);
      });
    }
  }

  // 从 metadata.tags 提取（如果存在）
  if (metadata.tags && Array.isArray(metadata.tags)) {
    metadata.tags.forEach((t: any) => {
      if (typeof t === 'string') tags.add(t.toLowerCase().trim());
    });
  }

  return Array.from(tags);
}

/**
 * 校验 embedding 维度与 NaN/Inf
 */
function validateEmbedding(embedding: any): { valid: boolean; dimension?: number; hasNaN?: boolean; hasInf?: boolean } {
  if (!embedding) {
    return { valid: false };
  }

  let embeddingArray: number[] = [];

  // 尝试解析 embedding
  if (typeof embedding === 'string') {
    // 可能是 '[1,2,3]' 格式
    const match = embedding.match(/\[(.*?)\]/);
    if (match) {
      embeddingArray = match[1].split(',').map(v => parseFloat(v.trim()));
    }
  } else if (Array.isArray(embedding)) {
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

/**
 * 修复 createdAt/updatedAt（从 metadata 中提取）
 */
function fixTimestamps(metadata: any): { createdAt?: Date; updatedAt?: Date } {
  const result: { createdAt?: Date; updatedAt?: Date } = {};

  if (metadata?.lastEnrichedAt) {
    try {
      const date = new Date(metadata.lastEnrichedAt);
      if (!isNaN(date.getTime())) {
        result.updatedAt = date;
      }
    } catch (e) {
      // 忽略解析错误
    }
  }

  if (metadata?.publishDate) {
    try {
      const date = new Date(metadata.publishDate);
      if (!isNaN(date.getTime())) {
        result.createdAt = date;
      }
    } catch (e) {
      // 忽略解析错误
    }
  }

  return result;
}

/**
 * 判断 Place 应该分到哪个桶
 */
function determineBucket(
  place: any,
  locationValid: boolean,
  embeddingValid: boolean,
  hasValidCategory: boolean,
  hasName: boolean
): PlaceBucket {
  // DROP 条件：严重数据质量问题
  if (!hasName || !locationValid) {
    return 'DROP';
  }

  // DISPLAY_ONLY 条件：可以展示但不可用于路线决策
  if (!embeddingValid || !hasValidCategory) {
    return 'DISPLAY_ONLY';
  }

  // EXECUTABLE：数据质量良好，可用于路线决策
  return 'EXECUTABLE';
}

/**
 * 清洗单个 Place
 */
async function cleanPlace(place: any): Promise<CleaningResult> {
  const result: CleaningResult = {
    placeId: place.id,
    uuid: place.uuid,
    nameCN: place.nameCN || '',
    bucket: 'DROP',
    issues: [],
    changes: {},
  };

  // 1. 解析/校验 location（使用查询结果中的 lat/lng）
  const location = extractLocation(place.location, place.lat, place.lng);
  const locationValid = location && isValidIcelandLocation(location.lat, location.lng);
  
  if (!location) {
    result.issues.push('location 缺失或无法解析');
  } else if (!locationValid) {
    result.issues.push(`location 超出冰岛范围: (${location.lat}, ${location.lng})`);
  }

  // 2. 统一 category
  const originalCategory = place.category;
  const normalizedCategory = normalizeCategory(originalCategory);
  if (originalCategory !== normalizedCategory) {
    result.changes.category = {
      from: originalCategory,
      to: normalizedCategory,
    };
    result.issues.push(`category 需要映射: ${originalCategory} -> ${normalizedCategory}`);
  }

  // 3. metadata.type 拆分去重为 normalized_tags
  const metadata = place.metadata || {};
  const normalizedTags = extractNormalizedTags(metadata);
  if (normalizedTags.length > 0) {
    result.changes.metadata = {
      ...result.changes.metadata,
      normalized_tags: normalizedTags,
    };
  }

  // 4. 修复 createdAt/updatedAt
  const timestampFixes = fixTimestamps(metadata);
  if (timestampFixes.createdAt || timestampFixes.updatedAt) {
    result.changes.timestamps = timestampFixes;
  }

  // 5. embedding 校验
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

  // 6. 判断分桶
  const hasName = !!(place.nameCN || place.nameEN);
  result.bucket = determineBucket(
    place,
    locationValid || false,
    embeddingValidation.valid,
    !!normalizedCategory,
    hasName
  );

  return result;
}

/**
 * 生成回滚 SQL（用于记录和手动回滚）
 */
function generateRollbackSQL(result: CleaningResult, originalData: any): string {
  const updates: string[] = [];

  // 回滚 category
  if (result.changes.category) {
    updates.push(`category = '${originalData.category}'::"PlaceCategory"`);
  }

  // 回滚 metadata（移除 cleaning_audit 和相关字段）
  if (result.changes.metadata) {
    updates.push(`metadata = metadata - 'cleaning_audit'`);
    if (result.changes.metadata.normalized_tags) {
      updates.push(`metadata = metadata - 'normalized_tags'`);
    }
    if (result.changes.metadata.skip_vector_index !== undefined) {
      updates.push(`metadata = metadata - 'skip_vector_index'`);
    }
  }

  // 回滚 timestamps
  if (result.changes.timestamps) {
    if (result.changes.timestamps.createdAt) {
      updates.push(`"createdAt" = '${originalData.createdAt.toISOString()}'::timestamp`);
    }
    if (result.changes.timestamps.updatedAt) {
      updates.push(`"updatedAt" = '${originalData.updatedAt.toISOString()}'::timestamp`);
    }
  }

  if (updates.length === 0) {
    return ''; // 无需回滚
  }

  return `UPDATE "Place" SET ${updates.join(', ')} WHERE id = ${result.placeId};`;
}

/**
 * 批量处理 Place 清洗
 */
async function processBatch(
  places: any[],
  batchNum: number,
  isDryRun: boolean
): Promise<BatchResult> {
  const result: BatchResult = {
    batchNum,
    total: places.length,
    processed: 0,
    executable: 0,
    displayOnly: 0,
    drop: 0,
    errors: [],
    rollbackSQL: '',
  };

  const cleaningResults: CleaningResult[] = [];
  const rollbackSQLs: string[] = [];

  console.log(`\n=== 批次 ${batchNum}：处理 ${places.length} 个 Place ===`);

  // 清洗每个 Place
  for (const place of places) {
    try {
      const cleaningResult = await cleanPlace(place);
      cleaningResults.push(cleaningResult);

      // 统计分桶
      if (cleaningResult.bucket === 'EXECUTABLE') {
        result.executable++;
      } else if (cleaningResult.bucket === 'DISPLAY_ONLY') {
        result.displayOnly++;
      } else {
        result.drop++;
      }

      result.processed++;
    } catch (error: any) {
      result.errors.push({
        placeId: place.id,
        error: error?.message || String(error),
      });
    }
  }

  // 生成回滚 SQL（用于记录）
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

  // 执行更新（如果不是 dry-run）
  if (!isDryRun && cleaningResults.length > 0) {
    // 在事务中执行更新
    try {
      await prisma.$transaction(async (tx) => {
        for (const cleaningResult of cleaningResults) {
          const originalPlace = places.find(p => p.id === cleaningResult.placeId);
          if (!originalPlace) continue;

          // 构建更新对象
          const updateData: any = {
            updatedAt: new Date(),
          };

          // 更新 category
          if (cleaningResult.changes.category) {
            updateData.category = cleaningResult.changes.category.to;
          }

          // 更新 metadata（合并而不是替换）
          const currentMetadata = originalPlace.metadata || {};
          const newMetadata = { ...currentMetadata };
          
          if (cleaningResult.changes.metadata?.normalized_tags) {
            newMetadata.normalized_tags = cleaningResult.changes.metadata.normalized_tags;
          }
          if (cleaningResult.changes.metadata?.skip_vector_index !== undefined) {
            newMetadata.skip_vector_index = cleaningResult.changes.metadata.skip_vector_index;
          }

          // 添加 audit
          newMetadata.cleaning_audit = {
            cleaned_at: new Date().toISOString(),
            bucket: cleaningResult.bucket,
            issues: cleaningResult.issues,
          };

          updateData.metadata = newMetadata;

          // 更新 timestamps
          if (cleaningResult.changes.timestamps) {
            if (cleaningResult.changes.timestamps.createdAt) {
              updateData.createdAt = cleaningResult.changes.timestamps.createdAt;
            }
            if (cleaningResult.changes.timestamps.updatedAt) {
              updateData.updatedAt = cleaningResult.changes.timestamps.updatedAt;
            }
          }

          // 执行更新
          await tx.place.update({
            where: { id: cleaningResult.placeId },
            data: updateData,
          });
        }
      });

      console.log(`✓ 批次 ${batchNum} 更新完成`);
    } catch (error: any) {
      console.error(`✗ 批次 ${batchNum} 更新失败:`, error.message);
      result.errors.push({
        placeId: 0,
        error: `事务失败: ${error.message}`,
      });
    }
  } else {
    console.log(`[DRY-RUN] 批次 ${batchNum} 跳过实际更新`);
    // 在 dry-run 模式下，输出将要执行的更新摘要
    const hasChanges = cleaningResults.some(r => 
      r.changes.category || 
      r.changes.metadata || 
      r.changes.timestamps
    );
    if (hasChanges) {
      console.log(`  [预览] 将更新 ${cleaningResults.filter(r => 
        r.changes.category || r.changes.metadata || r.changes.timestamps
      ).length} 个 Place`);
    }
  }

  return result;
}

/**
 * 复核执行结果
 */
async function verifyBatch(batchNum: number, placeIds: number[]): Promise<{
  verified: number;
  executable: number;
  displayOnly: number;
  drop: number;
}> {
  const places = await prisma.$queryRaw<Array<{
    id: number;
    metadata: any;
  }>>`
    SELECT id, metadata
    FROM "Place"
    WHERE id = ANY(${placeIds}::int[])
  `;

  let executable = 0;
  let displayOnly = 0;
  let drop = 0;

  for (const place of places) {
    const audit = place.metadata?.cleaning_audit;
    if (audit) {
      if (audit.bucket === 'EXECUTABLE') executable++;
      else if (audit.bucket === 'DISPLAY_ONLY') displayOnly++;
      else drop++;
    }
  }

  return {
    verified: places.length,
    executable,
    displayOnly,
    drop,
  };
}

/**
 * 主函数
 */
async function main() {
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
    // 1. 查询冰岛所有 Place
    console.log('查询冰岛所有 Place...');
    
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
    `;
    console.log(`  冰岛 Place 总数: ${totalCount[0]?.count || 0}`);

    // 查询需要清洗的 Place（使用 SQL 提取 location 坐标）
    // 注意：将 location 转换为 text 以避免 Prisma 反序列化问题
    const icelandPlacesRaw = await prisma.$queryRaw<Array<{
      id: number;
      uuid: string;
      nameCN: string;
      nameEN: string | null;
      category: PlaceCategory;
      location: string | null;
      address: string | null;
      metadata: any;
      embedding: string | null;
      createdAt: Date;
      updatedAt: Date;
      lat: number | null;
      lng: number | null;
    }>>`
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

    // 转换 lat/lng 从 bigint 到 number（PostgreSQL 可能返回 bigint）
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

    // 2. 分批处理
    const allResults: BatchResult[] = [];
    const totalBatches = Math.ceil(icelandPlaces.length / batchSize);

    for (let i = 0; i < icelandPlaces.length; i += batchSize) {
      const batch = icelandPlaces.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      const batchResult = await processBatch(batch, batchNum, isDryRun);
      allResults.push(batchResult);

      // 复核结果
      if (!isDryRun) {
        const placeIds = batch.map(p => p.id);
        const verification = await verifyBatch(batchNum, placeIds);
        console.log(`  复核: EXECUTABLE=${verification.executable}, DISPLAY_ONLY=${verification.displayOnly}, DROP=${verification.drop}`);
      }

      // 批次间延迟
      if (i + batchSize < icelandPlaces.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 3. 生成最终报告
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

  } catch (error: any) {
    console.error('\n❌ 脚本执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

export { main };
