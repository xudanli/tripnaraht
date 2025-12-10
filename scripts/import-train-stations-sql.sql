-- 导入火车站数据 SQL 脚本
-- 使用 PostgreSQL \copy 命令批量导入 CSV 数据
-- 
-- CSV 文件格式要求：
-- 站名,车站地址,铁路局,类别,性质,省,市,WGS84_Lng,WGS84_Lat
--
-- 注意：
-- 1. CSV 文件必须是 UTF-8 编码
-- 2. 字段顺序必须与下面的列映射一致
-- 3. 如果某些字段为空，使用 NULL 或空字符串

-- 示例：导入 train_stations.csv
\copy "RawTrainStationData"(name, address, "railwayBureau", category, nature, province, city, "wgs84Lng", "wgs84Lat") 
FROM 'scripts/train_stations.csv' 
WITH (FORMAT csv, DELIMITER ',', HEADER TRUE, ENCODING 'UTF8', NULL '');

-- 验证导入结果
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN "wgs84Lng" IS NOT NULL AND "wgs84Lat" IS NOT NULL THEN 1 END) as with_coords,
  COUNT(CASE WHEN province IS NOT NULL THEN 1 END) as with_province,
  COUNT(CASE WHEN city IS NOT NULL THEN 1 END) as with_city
FROM "RawTrainStationData";

-- 查看示例数据
SELECT 
  name,
  address,
  "railwayBureau",
  nature,
  province,
  city,
  "wgs84Lng",
  "wgs84Lat"
FROM "RawTrainStationData"
LIMIT 10;

