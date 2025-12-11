-- ============================================
-- 航班价格查询 SQL 语句
-- ============================================

-- 1. 查询特定航线、月份、星期几的数据（精确匹配）
-- 参数：成都->深圳，10月，周一(dayOfWeek=0)
SELECT 
  id,
  "routeId",
  "originCity",
  "destinationCity",
  month,
  "dayOfWeek",
  "monthlyBasePrice",
  "dayOfWeekFactor",
  "sampleCount",
  "minPrice",
  "maxPrice",
  "stdDev",
  "distanceKm",
  "monthFactor",
  "airlineCount",
  "isWeekend",
  "departureTime",
  "arrivalTime",
  "timeOfDayFactor",
  "createdAt",
  "updatedAt"
FROM "FlightPriceDetail"
WHERE 
  "routeId" = '成都->深圳'
  AND month = 10
  AND "dayOfWeek" = 0;

-- ============================================
-- 2. 查询该航线该月份的所有数据（查看有哪些星期几的数据）
-- 用于调试：当特定dayOfWeek不存在时，查看有哪些可用的dayOfWeek
SELECT 
  id,
  "routeId",
  month,
  "dayOfWeek",
  CASE 
    WHEN "dayOfWeek" = 0 THEN '周一'
    WHEN "dayOfWeek" = 1 THEN '周二'
    WHEN "dayOfWeek" = 2 THEN '周三'
    WHEN "dayOfWeek" = 3 THEN '周四'
    WHEN "dayOfWeek" = 4 THEN '周五'
    WHEN "dayOfWeek" = 5 THEN '周六'
    WHEN "dayOfWeek" = 6 THEN '周日'
    ELSE '全部'
  END as "dayName",
  "monthlyBasePrice",
  "dayOfWeekFactor",
  "sampleCount",
  "minPrice",
  "maxPrice"
FROM "FlightPriceDetail"
WHERE 
  "routeId" = '成都->深圳'
  AND month = 10
ORDER BY "dayOfWeek" ASC NULLS LAST;

-- ============================================
-- 3. 查询该航线的所有月份数据（查看数据覆盖情况）
SELECT 
  month,
  COUNT(*) as "dayCount",
  SUM("sampleCount") as "totalSamples",
  AVG("monthlyBasePrice") as "avgBasePrice",
  MIN("monthlyBasePrice") as "minBasePrice",
  MAX("monthlyBasePrice") as "maxBasePrice"
FROM "FlightPriceDetail"
WHERE 
  "routeId" = '成都->深圳'
GROUP BY month
ORDER BY month ASC;

-- ============================================
-- 4. 查询该航线所有数据（完整视图）
SELECT 
  id,
  "routeId",
  month,
  "dayOfWeek",
  CASE 
    WHEN "dayOfWeek" = 0 THEN '周一'
    WHEN "dayOfWeek" = 1 THEN '周二'
    WHEN "dayOfWeek" = 2 THEN '周三'
    WHEN "dayOfWeek" = 3 THEN '周四'
    WHEN "dayOfWeek" = 4 THEN '周五'
    WHEN "dayOfWeek" = 5 THEN '周六'
    WHEN "dayOfWeek" = 6 THEN '周日'
    ELSE '全部'
  END as "dayName",
  "monthlyBasePrice",
  "dayOfWeekFactor",
  "sampleCount",
  "minPrice",
  "maxPrice",
  "stdDev",
  "distanceKm",
  "airlineCount",
  "isWeekend",
  "departureTime",
  "arrivalTime"
FROM "FlightPriceDetail"
WHERE 
  "routeId" = '成都->深圳'
ORDER BY month ASC, "dayOfWeek" ASC NULLS LAST;

-- ============================================
-- 5. 统计查询：该航线每个月份有多少个不同的dayOfWeek
SELECT 
  month,
  COUNT(DISTINCT "dayOfWeek") as "uniqueDayOfWeeks",
  ARRAY_AGG(DISTINCT "dayOfWeek" ORDER BY "dayOfWeek") as "availableDayOfWeeks",
  SUM("sampleCount") as "totalSamples"
FROM "FlightPriceDetail"
WHERE 
  "routeId" = '成都->深圳'
GROUP BY month
ORDER BY month ASC;

-- ============================================
-- 6. 查询所有包含"成都"或"深圳"的航线（用于验证routeId格式）
SELECT DISTINCT
  "routeId",
  "originCity",
  "destinationCity",
  COUNT(*) as "recordCount"
FROM "FlightPriceDetail"
WHERE 
  "originCity" LIKE '%成都%' 
  OR "destinationCity" LIKE '%成都%'
  OR "originCity" LIKE '%深圳%'
  OR "destinationCity" LIKE '%深圳%'
GROUP BY "routeId", "originCity", "destinationCity"
ORDER BY "recordCount" DESC;
