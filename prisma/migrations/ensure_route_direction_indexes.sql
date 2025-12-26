-- 确保 RouteDirection 相关索引存在
-- 用于性能优化：避免慢查询尖峰

-- 1. 为 RouteDirection.corridorGeom 创建 GiST 索引（如果不存在）
-- 用于加速空间查询（ST_DWithin）
CREATE INDEX IF NOT EXISTS route_direction_corridor_geom_gist_idx 
  ON "RouteDirection" USING GIST (corridorGeom);

-- 2. 确认 Place.location 的 GiST 索引存在（应该已经有了，但确保一下）
CREATE INDEX IF NOT EXISTS place_location_gist_idx 
  ON "Place" USING GIST (location);

-- 3. 为 RouteDirection 的常用查询字段创建复合索引
CREATE INDEX IF NOT EXISTS route_direction_country_active_idx 
  ON "RouteDirection" (countryCode, isActive) 
  WHERE isActive = true;

-- 4. 为 RouteDirection 的 tags 创建 GIN 索引（应该已经有了，但确保一下）
CREATE INDEX IF NOT EXISTS route_direction_tags_gin_idx 
  ON "RouteDirection" USING GIN (tags);

-- 5. 为 RouteDirection 的 seasonality JSONB 字段创建 GIN 索引（用于月份查询）
CREATE INDEX IF NOT EXISTS route_direction_seasonality_gin_idx 
  ON "RouteDirection" USING GIN (seasonality);

-- 注释说明
COMMENT ON INDEX route_direction_corridor_geom_gist_idx IS 
  'RouteDirection 走廊几何的 GiST 索引，用于加速 ST_DWithin 空间查询';
COMMENT ON INDEX place_location_gist_idx IS 
  'Place 位置的 GiST 索引，用于加速地理位置查询';
COMMENT ON INDEX route_direction_country_active_idx IS 
  'RouteDirection 国家+激活状态的复合索引，用于快速筛选激活的路线方向';

