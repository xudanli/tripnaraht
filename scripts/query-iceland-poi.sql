-- ============================================
-- 冰岛 POI 数据查询 SQL
-- ============================================

-- 1. 基础查询：查看所有冰岛 POI（带坐标）
SELECT 
  p.id,
  p.uuid,
  p."nameCN",
  p."nameEN",
  p.category,
  p.address,
  ST_Y(p.location::geometry) as lat,
  ST_X(p.location::geometry) as lng,
  p.rating,
  p."createdAt",
  p."updatedAt",
  c.name as city_name,
  c."countryCode"
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
ORDER BY p.id
LIMIT 100;

-- 2. 统计查询：按分桶统计（清洗后的数据）
SELECT 
  COALESCE(p.metadata->>'cleaning_audit'->>'bucket', 'UNKNOWN') as bucket,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
GROUP BY bucket
ORDER BY 
  CASE bucket
    WHEN 'EXECUTABLE' THEN 1
    WHEN 'DISPLAY_ONLY' THEN 2
    WHEN 'DROP' THEN 3
    ELSE 4
  END;

-- 3. 详细查询：查看清洗后的数据（包含清洗信息）
SELECT 
  p.id,
  p."nameCN",
  p."nameEN",
  p.category,
  ST_Y(p.location::geometry) as lat,
  ST_X(p.location::geometry) as lng,
  p.metadata->>'cleaning_audit'->>'bucket' as bucket,
  p.metadata->>'cleaning_audit'->>'issues' as issues,
  p.metadata->>'cleaning_audit'->>'cleaned_at' as cleaned_at,
  p.metadata->>'normalized_tags' as normalized_tags,
  p.metadata->>'skip_vector_index' as skip_vector_index,
  CASE 
    WHEN p.embedding IS NOT NULL THEN 'YES'
    ELSE 'NO'
  END as has_embedding
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
ORDER BY p.id
LIMIT 100;

-- 4. 按 category 统计
SELECT 
  p.category,
  COUNT(*) as count,
  COUNT(CASE WHEN p.metadata->>'cleaning_audit'->>'bucket' = 'EXECUTABLE' THEN 1 END) as executable_count,
  COUNT(CASE WHEN p.metadata->>'cleaning_audit'->>'bucket' = 'DISPLAY_ONLY' THEN 1 END) as display_only_count,
  COUNT(CASE WHEN p.metadata->>'cleaning_audit'->>'bucket' = 'DROP' THEN 1 END) as drop_count
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
GROUP BY p.category
ORDER BY count DESC;

-- 5. 查看有问题的数据（DROP 或缺少关键信息）
SELECT 
  p.id,
  p."nameCN",
  p."nameEN",
  p.category,
  CASE 
    WHEN p.location IS NULL THEN '缺少 location'
    WHEN ST_Y(p.location::geometry) IS NULL THEN 'location 无效'
    ELSE 'OK'
  END as location_status,
  CASE 
    WHEN p."nameCN" IS NULL OR p."nameCN" = '' THEN '缺少 nameCN'
    ELSE 'OK'
  END as name_status,
  CASE 
    WHEN p.embedding IS NULL THEN '缺少 embedding'
    WHEN p.metadata->>'skip_vector_index' = 'true' THEN 'embedding 无效'
    ELSE 'OK'
  END as embedding_status,
  p.metadata->>'cleaning_audit'->>'bucket' as bucket,
  p.metadata->>'cleaning_audit'->>'issues' as issues
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
  AND (
    p.metadata->>'cleaning_audit'->>'bucket' = 'DROP'
    OR p.location IS NULL
    OR (p."nameCN" IS NULL OR p."nameCN" = '')
  )
ORDER BY p.id;

-- 6. 查看 EXECUTABLE 数据（可用于路线决策）
SELECT 
  p.id,
  p."nameCN",
  p."nameEN",
  p.category,
  ST_Y(p.location::geometry) as lat,
  ST_X(p.location::geometry) as lng,
  p.address,
  p.rating,
  p.metadata->>'normalized_tags' as normalized_tags
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
  AND p.metadata->>'cleaning_audit'->>'bucket' = 'EXECUTABLE'
ORDER BY p.rating DESC NULLS LAST, p.id
LIMIT 100;

-- 7. 查看 DISPLAY_ONLY 数据（可展示但不可执行）
SELECT 
  p.id,
  p."nameCN",
  p."nameEN",
  p.category,
  ST_Y(p.location::geometry) as lat,
  ST_X(p.location::geometry) as lng,
  p.metadata->>'cleaning_audit'->>'issues' as issues,
  CASE 
    WHEN p.embedding IS NULL THEN '缺少 embedding'
    WHEN p.metadata->>'skip_vector_index' = 'true' THEN 'embedding 无效'
    ELSE '其他'
  END as reason
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
  AND p.metadata->>'cleaning_audit'->>'bucket' = 'DISPLAY_ONLY'
ORDER BY p.id
LIMIT 100;

-- 8. 统计 embedding 状态
SELECT 
  CASE 
    WHEN p.embedding IS NULL THEN '无 embedding'
    WHEN p.metadata->>'skip_vector_index' = 'true' THEN 'embedding 无效'
    ELSE 'embedding 有效'
  END as embedding_status,
  COUNT(*) as count
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
GROUP BY embedding_status
ORDER BY count DESC;

-- 9. 查看清洗时间分布
SELECT 
  DATE(p.metadata->>'cleaning_audit'->>'cleaned_at') as cleaned_date,
  COUNT(*) as count
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
  AND p.metadata->>'cleaning_audit' IS NOT NULL
GROUP BY cleaned_date
ORDER BY cleaned_date DESC;

-- 10. 导出为 JSON 格式（用于分析）
SELECT 
  json_agg(
    json_build_object(
      'id', p.id,
      'nameCN', p."nameCN",
      'nameEN', p."nameEN",
      'category', p.category,
      'lat', ST_Y(p.location::geometry),
      'lng', ST_X(p.location::geometry),
      'bucket', p.metadata->>'cleaning_audit'->>'bucket',
      'issues', p.metadata->>'cleaning_audit'->>'issues',
      'normalized_tags', p.metadata->>'normalized_tags',
      'has_embedding', CASE WHEN p.embedding IS NOT NULL THEN true ELSE false END
    )
  ) as places
FROM "Place" p
INNER JOIN "City" c ON p."cityId" = c.id
WHERE c."countryCode" = 'IS'
LIMIT 1000;
