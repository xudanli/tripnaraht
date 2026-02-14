-- Backfill Place 表的数据新鲜度字段
-- 用途: 为现有 POI 设置初始 lastVerifiedAt, dataSource, dataFreshness
-- 执行: psql $DATABASE_URL -f scripts/backfill-place-freshness.sql

-- 1. 为所有现有 Place 记录设置默认值
UPDATE "Place"
SET
  "last_verified_at" = CURRENT_TIMESTAMP - INTERVAL '60 days',
  "data_source" =
    CASE
      WHEN "googlePlaceId" IS NOT NULL THEN 'google_places'
      ELSE 'osm'
    END,
  "data_freshness" = 'STALE'
WHERE "last_verified_at" IS NULL;

-- 2. 验证更新
SELECT
  data_freshness,
  data_source,
  COUNT(*) as count
FROM "Place"
GROUP BY data_freshness, data_source
ORDER BY data_freshness, data_source;

-- 3. 显示统计信息
SELECT
  COUNT(*) as total_places,
  COUNT("last_verified_at") as with_verified_at,
  COUNT("data_source") as with_data_source,
  COUNT("data_freshness") as with_freshness
FROM "Place";
