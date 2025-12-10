-- 验证火车站数据转换结果

-- 1. 查看转换后的火车站总数
SELECT 
  COUNT(*) as total_stations,
  COUNT(CASE WHEN "cityId" IS NOT NULL THEN 1 END) as with_city,
  COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as with_location,
  COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as with_address
FROM "Place"
WHERE category = 'TRANSIT_HUB';

-- 2. 查看原始数据统计
SELECT 
  COUNT(*) as total_raw,
  COUNT(CASE WHEN processed = true THEN 1 END) as processed,
  COUNT(CASE WHEN processed = false THEN 1 END) as pending,
  COUNT(CASE WHEN "wgs84Lng" IS NOT NULL AND "wgs84Lat" IS NOT NULL THEN 1 END) as with_coords
FROM "RawTrainStationData";

-- 3. 查看转换后的示例数据（带城市信息）
SELECT 
  p.id,
  p.name,
  p.address,
  c.name as city_name,
  p.metadata->>'railwayBureau' as railway_bureau,
  p.metadata->>'nature' as nature,
  p.metadata->>'province' as province,
  ST_X(location::geometry) as longitude,
  ST_Y(location::geometry) as latitude
FROM "Place" p
LEFT JOIN "City" c ON p."cityId" = c.id
WHERE p.category = 'TRANSIT_HUB'
ORDER BY p.id
LIMIT 20;

-- 4. 查看没有城市信息的火车站
SELECT 
  COUNT(*) as stations_without_city
FROM "Place"
WHERE category = 'TRANSIT_HUB' 
  AND "cityId" IS NULL;

-- 5. 查看没有地理位置的火车站
SELECT 
  COUNT(*) as stations_without_location
FROM "Place"
WHERE category = 'TRANSIT_HUB' 
  AND location IS NULL;

-- 6. 按省份统计火车站数量
SELECT 
  p.metadata->>'province' as province,
  COUNT(*) as station_count
FROM "Place" p
WHERE p.category = 'TRANSIT_HUB'
  AND p.metadata->>'province' IS NOT NULL
GROUP BY p.metadata->>'province'
ORDER BY station_count DESC
LIMIT 20;

-- 7. 按城市统计火车站数量
SELECT 
  c.name as city_name,
  COUNT(*) as station_count
FROM "Place" p
LEFT JOIN "City" c ON p."cityId" = c.id
WHERE p.category = 'TRANSIT_HUB'
  AND c.name IS NOT NULL
GROUP BY c.name
ORDER BY station_count DESC
LIMIT 20;
