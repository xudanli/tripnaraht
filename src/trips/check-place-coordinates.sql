-- 检查 Place 坐标数据的 SQL 查询
-- Place ID: 381122 (Víti Crater Lake)

-- 方法1: 检查 PostGIS location 字段
SELECT 
  id, 
  "nameEN", 
  "nameCN",
  ST_Y(location::geometry) as lat,
  ST_X(location::geometry) as lng,
  location IS NOT NULL as has_location
FROM "Place" 
WHERE id = 381122;

-- 方法2: 检查 metadata 中的坐标
SELECT 
  id, 
  "nameEN", 
  "nameCN",
  metadata->>'lat' as metadata_lat,
  metadata->>'lng' as metadata_lng,
  metadata->'location'->>'lat' as location_lat,
  metadata->'location'->>'lng' as location_lng,
  metadata->'coordinates' as coordinates,
  metadata
FROM "Place" 
WHERE id = 381122;

-- 方法3: 综合查询（推荐）
SELECT 
  id, 
  "nameEN", 
  "nameCN",
  -- PostGIS location 字段
  ST_Y(location::geometry) as postgis_lat,
  ST_X(location::geometry) as postgis_lng,
  location IS NOT NULL as has_postgis_location,
  -- metadata 中的坐标
  metadata->>'lat' as metadata_lat,
  metadata->>'lng' as metadata_lng,
  metadata->'location'->>'lat' as metadata_location_lat,
  metadata->'location'->>'lng' as metadata_location_lng,
  metadata->'coordinates' as metadata_coordinates
FROM "Place" 
WHERE id = 381122;

-- 方法4: 更新坐标（如果需要）
-- Víti Crater Lake 的坐标: 65.0333, -16.7500
-- 
-- 选项A: 更新 PostGIS location 字段
-- UPDATE "Place"
-- SET location = ST_SetSRID(ST_MakePoint(-16.7500, 65.0333), 4326)
-- WHERE id = 381122;
--
-- 选项B: 更新 metadata 字段
-- UPDATE "Place"
-- SET metadata = jsonb_set(
--   jsonb_set(
--     COALESCE(metadata, '{}'::jsonb),
--     '{lat}',
--     '65.0333'::jsonb
--   ),
--   '{lng}',
--   '-16.7500'::jsonb
-- )
-- WHERE id = 381122;
