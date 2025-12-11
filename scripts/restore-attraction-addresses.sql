-- 恢复景点地址字段
-- 如果修复脚本导致地址数据变差，可以使用这个 SQL 来恢复
-- 注意：这个 SQL 假设 encodedAddress 字段包含正确的地址信息

-- 方法 1: 如果 encodedAddress 字段包含完整地址，从中提取
-- 更新 address 字段，从 encodedAddress 中提取（移除省份重复和景点名称）

UPDATE "RawAttractionData"
SET address = TRIM(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      "encodedAddress",
      '^' || COALESCE(province, '') || COALESCE(province, ''),
      COALESCE(province, '')
    ),
    '(景区|公园|博物馆|景点|遗址|度假村|温泉|山庄|古镇|古城|纪念馆|故居|陵园|塔|寺|庙|观|庵).*$',
    ''
  )
)
WHERE 
  "encodedAddress" IS NOT NULL 
  AND "encodedAddress" != ''
  AND (
    address = province
    OR (address LIKE '%市' AND address NOT LIKE '%区%' AND address NOT LIKE '%县%' AND address NOT LIKE '%镇%' AND address NOT LIKE '%路%' AND address NOT LIKE '%街%' AND address NOT LIKE '%号%')
    OR address IS NULL
    OR LENGTH(address) < 10
  )
  AND LENGTH("encodedAddress") > LENGTH(COALESCE(address, ''));

-- 验证恢复结果
SELECT 
  COUNT(*) as total_fixed,
  COUNT(CASE WHEN address = province THEN 1 END) as still_province,
  COUNT(CASE WHEN address LIKE '%市' AND address NOT LIKE '%区%' AND address NOT LIKE '%县%' AND address NOT LIKE '%镇%' THEN 1 END) as still_city_only
FROM "RawAttractionData"
WHERE 
  address = province
  OR (address LIKE '%市' AND address NOT LIKE '%区%' AND address NOT LIKE '%县%' AND address NOT LIKE '%镇%');
