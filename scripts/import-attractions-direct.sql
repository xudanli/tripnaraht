-- 景点数据直接导入 SQL 语句
-- 适用于 CSV 字段名与数据库字段名匹配的情况

-- 如果 CSV 字段名与数据库字段名完全匹配，可以直接使用：
\copy "RawAttractionData"(name, level, address, province, "publishDate", "documentUrl", "encodedAddress", lng, lat) 
FROM 'downloads/attractions.csv' 
WITH (FORMAT csv, DELIMITER ',', HEADER TRUE, ENCODING 'UTF8', NULL '');

-- 如果 CSV 字段名是中文，需要先创建临时视图或使用导入脚本
-- CSV 字段：景区名称,等级,地址,省级,相关文件发布时间,文件网址链接,编码地址,lng_wgs84,lat_wgs84
-- 数据库字段：name, level, address, province, publishDate, documentUrl, encodedAddress, lng, lat

-- 方法：使用临时表导入，然后映射字段
CREATE TEMP TABLE temp_attractions (
  景区名称 TEXT,
  等级 TEXT,
  地址 TEXT,
  省级 TEXT,
  相关文件发布时间 TEXT,
  文件网址链接 TEXT,
  编码地址 TEXT,
  lng_wgs84 TEXT,
  lat_wgs84 TEXT
);

\copy temp_attractions FROM 'downloads/attractions.csv' 
WITH (FORMAT csv, DELIMITER ',', HEADER TRUE, ENCODING 'UTF8', NULL '');

-- 插入到正式表，映射字段
INSERT INTO "RawAttractionData" (name, level, address, province, "publishDate", "documentUrl", "encodedAddress", lng, lat, "importedAt", processed)
SELECT 
  景区名称 as name,
  等级 as level,
  地址 as address,
  省级 as province,
  相关文件发布时间 as "publishDate",
  文件网址链接 as "documentUrl",
  编码地址 as "encodedAddress",
  CASE 
    WHEN lng_wgs84 ~ '^[0-9]+\.?[0-9]*$' THEN lng_wgs84::FLOAT
    ELSE NULL
  END as lng,
  CASE 
    WHEN lat_wgs84 ~ '^[0-9]+\.?[0-9]*$' THEN lat_wgs84::FLOAT
    ELSE NULL
  END as lat,
  NOW() as "importedAt",
  false as processed
FROM temp_attractions
WHERE 景区名称 IS NOT NULL AND 景区名称 != '';

-- 清理临时表
DROP TABLE temp_attractions;

-- 显示导入统计
SELECT 
  COUNT(*) as total_imported,
  COUNT(CASE WHEN level IS NOT NULL THEN 1 END) as with_level,
  COUNT(CASE WHEN lng IS NOT NULL AND lat IS NOT NULL THEN 1 END) as with_coordinates
FROM "RawAttractionData"
WHERE "importedAt" > NOW() - INTERVAL '1 minute';
