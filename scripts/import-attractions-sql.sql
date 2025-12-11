-- 导入景点数据到 RawAttractionData 表
-- 使用 PostgreSQL 的 \copy 命令从 CSV 文件导入

-- 字段映射：
-- 景区名称 -> name
-- 等级 -> level
-- 地址 -> address
-- 省级 -> province
-- 相关文件发布时间 -> publishDate
-- 文件网址链接 -> documentUrl
-- 编码地址 -> encodedAddress
-- lng_wgs84 -> lng
-- lat_wgs84 -> lat

\copy "RawAttractionData"(name, level, address, province, "publishDate", "documentUrl", "encodedAddress", lng, lat)
FROM 'downloads/attractions.csv'
WITH (FORMAT csv, DELIMITER ',', HEADER TRUE, ENCODING 'UTF8', NULL '');

-- 注意：
-- 1. CSV 文件应包含表头行
-- 2. 字段名应与 CSV 列名匹配（支持中文字段名）
-- 3. 如果某些字段为空，使用 NULL '' 处理空值
-- 4. 导入后，processed 字段默认为 false，需要运行转换脚本转换为 Place 数据

-- 验证导入结果
SELECT 
  COUNT(*) as total_count,
  COUNT(CASE WHEN processed = false THEN 1 END) as unprocessed_count,
  COUNT(CASE WHEN level = '5A' THEN 1 END) as level_5a_count
FROM "RawAttractionData";
