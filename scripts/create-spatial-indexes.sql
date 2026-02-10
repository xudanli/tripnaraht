-- 创建空间索引以优化查询性能
-- 执行: psql "$DATABASE_URL" -f scripts/create-spatial-indexes.sql

-- 1. Place 表空间索引
CREATE INDEX IF NOT EXISTS idx_place_location_gist 
ON "Place" USING GIST (location);

-- 2. Hazard Zones 空间索引
CREATE INDEX IF NOT EXISTS idx_hazard_zones_geom_gist 
ON hazard_zones USING GIST (geom);

-- 3. 地理特征表索引
CREATE INDEX IF NOT EXISTS idx_geo_rivers_line_geom_gist 
ON geo_rivers_line USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_geo_coastlines_geom_gist 
ON geo_coastlines USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_geo_mountains_standard_geom_gist 
ON geo_mountains_standard USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_geo_roads_geom_gist 
ON geo_roads USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_geo_ports_geom_gist 
ON geo_ports USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_geo_railways_geom_gist 
ON geo_railways USING GIST (geom);

-- 4. DEM 栅格表索引（如果使用 raster2pgsql -I 应该已创建，但检查一下）
-- 注意：栅格索引需要使用 ST_ConvexHull
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'geo_dem_iceland_20m' 
    AND indexname = 'idx_geo_dem_iceland_20m_rast_gist'
  ) THEN
    CREATE INDEX idx_geo_dem_iceland_20m_rast_gist 
    ON geo_dem_iceland_20m USING GIST (ST_ConvexHull(rast));
  END IF;
END $$;

-- 5. City 表空间索引
CREATE INDEX IF NOT EXISTS idx_city_location_gist 
ON "City" USING GIST (location);

-- 6. 国家代码 + 空间索引组合（用于常见查询模式）
CREATE INDEX IF NOT EXISTS idx_place_country_location 
ON "Place" (country_code, location) 
WHERE location IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hazard_zones_country_geom 
ON hazard_zones (country_code, geom) 
WHERE geom IS NOT NULL;

-- 7. 更新统计信息
ANALYZE "Place";
ANALYZE hazard_zones;
ANALYZE geo_rivers_line;
ANALYZE geo_coastlines;
ANALYZE geo_mountains_standard;
ANALYZE geo_roads;
ANALYZE geo_ports;
ANALYZE geo_railways;
ANALYZE geo_dem_iceland_20m;

-- 8. 显示创建的索引
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN (
  'Place', 
  'hazard_zones', 
  'geo_rivers_line', 
  'geo_coastlines',
  'geo_mountains_standard',
  'geo_roads',
  'geo_ports',
  'geo_railways',
  'geo_dem_iceland_20m',
  'City'
)
AND indexdef LIKE '%gist%'
ORDER BY tablename, indexname;
