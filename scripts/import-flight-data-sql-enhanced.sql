-- 增强版航班数据导入 SQL
-- 包含所有新字段的计算：distanceKm, monthFactor, airlineCount, isWeekend, departureTime, arrivalTime, timeOfDayFactor

-- 步骤 1: 先计算并插入周内因子（如果还没有）
INSERT INTO "DayOfWeekFactor" ("dayOfWeek", factor, "avgPrice", "totalAvgPrice", "sampleCount", "lastUpdated", "updatedAt")
SELECT 
  CASE 
    WHEN EXTRACT(DOW FROM 日期) = 0 THEN 6  -- 周日转换为 6
    ELSE EXTRACT(DOW FROM 日期) - 1          -- 其他天减 1（周一=1 -> 0）
  END as "dayOfWeek",
  AVG("价格元") / (SELECT AVG("价格元") FROM "RawFlightData" WHERE "价格元" > 0 AND "价格元" < 100000) as factor,
  AVG("价格元") as "avgPrice",
  (SELECT AVG("价格元") FROM "RawFlightData" WHERE "价格元" > 0 AND "价格元" < 100000) as "totalAvgPrice",
  COUNT(*) as "sampleCount",
  NOW() as "lastUpdated",
  NOW() as "updatedAt"
FROM "RawFlightData"
WHERE "价格元" > 0 AND "价格元" < 100000
GROUP BY CASE 
  WHEN EXTRACT(DOW FROM 日期) = 0 THEN 6
  ELSE EXTRACT(DOW FROM 日期) - 1
END
ON CONFLICT ("dayOfWeek") DO UPDATE SET
  factor = EXCLUDED.factor,
  "avgPrice" = EXCLUDED."avgPrice",
  "totalAvgPrice" = EXCLUDED."totalAvgPrice",
  "sampleCount" = EXCLUDED."sampleCount",
  "lastUpdated" = EXCLUDED."lastUpdated",
  "updatedAt" = EXCLUDED."updatedAt";

-- 步骤 2: 计算每条航线的全年平均价格（用于计算月度因子）
-- 创建临时视图或使用 CTE
WITH route_yearly_avg AS (
  SELECT 
    CONCAT("出发城市", '->', "到达城市") as route_id,
    AVG("价格元") as yearly_avg_price
  FROM "RawFlightData"
  WHERE "价格元" > 0 AND "价格元" < 100000
  GROUP BY CONCAT("出发城市", '->', "到达城市")
),

-- 步骤 3: 计算时段因子辅助函数（通过起飞时间）
time_slot_factor AS (
  SELECT 
    CONCAT(R."出发城市", '->', R."到达城市") as route_id,
    EXTRACT(MONTH FROM R.日期)::INTEGER as month,
    CASE 
      WHEN EXTRACT(DOW FROM R.日期) = 0 THEN 6
      ELSE EXTRACT(DOW FROM R.日期) - 1
    END as day_of_week,
    CASE 
      WHEN R."起飞时间" IS NOT NULL THEN
        CASE 
          WHEN EXTRACT(HOUR FROM R."起飞时间"::TIME) >= 0 AND EXTRACT(HOUR FROM R."起飞时间"::TIME) < 6 THEN '00-06'
          WHEN EXTRACT(HOUR FROM R."起飞时间"::TIME) >= 6 AND EXTRACT(HOUR FROM R."起飞时间"::TIME) < 12 THEN '06-12'
          WHEN EXTRACT(HOUR FROM R."起飞时间"::TIME) >= 12 AND EXTRACT(HOUR FROM R."起飞时间"::TIME) < 18 THEN '12-18'
          ELSE '18-24'
        END
      ELSE NULL
    END as time_slot,
    AVG(R."价格元") as slot_avg_price,
    (SELECT AVG("价格元") FROM "RawFlightData" WHERE "价格元" > 0 AND "价格元" < 100000) as overall_avg_price
  FROM "RawFlightData" R
  WHERE R."价格元" > 0 AND R."价格元" < 100000
    AND R."起飞时间" IS NOT NULL
  GROUP BY 1, 2, 3, 4
)

-- 步骤 4: 插入/更新 FlightPriceDetail（包含所有新字段）
INSERT INTO "FlightPriceDetail" (
  "routeId", "originCity", "destinationCity", 
  "originAirport", "originAirportLongitude", "originAirportLatitude",
  "destinationAirport", "destinationAirportLongitude", "destinationAirportLatitude",
  month, "dayOfWeek",
  "monthlyBasePrice", "dayOfWeekFactor", 
  "distanceKm", "monthFactor", "airlineCount", "isWeekend",
  "departureTime", "arrivalTime", "timeOfDayFactor",
  "sampleCount", "minPrice", "maxPrice", "stdDev",
  "createdAt", "updatedAt"
)
SELECT 
  CONCAT(R."出发城市", '->', R."到达城市") as "routeId",
  R."出发城市" as "originCity",
  R."到达城市" as "destinationCity",
  
  -- 机场信息（取第一个非空值）
  MAX(R."起飞机场") FILTER (WHERE R."起飞机场" IS NOT NULL) as "originAirport",
  MAX(R."起飞机场x") FILTER (WHERE R."起飞机场x" IS NOT NULL) as "originAirportLongitude",
  MAX(R."起飞机场y") FILTER (WHERE R."起飞机场y" IS NOT NULL) as "originAirportLatitude",
  MAX(R."降落机场") FILTER (WHERE R."降落机场" IS NOT NULL) as "destinationAirport",
  MAX(R."降落机场x") FILTER (WHERE R."降落机场x" IS NOT NULL) as "destinationAirportLongitude",
  MAX(R."降落机场y") FILTER (WHERE R."降落机场y" IS NOT NULL) as "destinationAirportLatitude",
  
  -- 时间和价格统计
  EXTRACT(MONTH FROM R.日期)::INTEGER as month,
  CASE 
    WHEN EXTRACT(DOW FROM R.日期) = 0 THEN 6  
    ELSE EXTRACT(DOW FROM R.日期) - 1          
  END as "dayOfWeek",
  
  AVG(R."价格元") as "monthlyBasePrice",
  DOWF.factor as "dayOfWeekFactor",
  
  -- 新字段 1: distanceKm (里程平均值)
  AVG(R."里程公里") FILTER (WHERE R."里程公里" IS NOT NULL AND R."里程公里" > 0) as "distanceKm",
  
  -- 新字段 2: monthFactor (月度基准价与全年平均价格的比值)
  CASE 
    WHEN RYA.yearly_avg_price > 0 THEN AVG(R."价格元") / RYA.yearly_avg_price
    ELSE NULL
  END as "monthFactor",
  
  -- 新字段 3: airlineCount (唯一航空公司数量)
  COUNT(DISTINCT R."航空公司") FILTER (WHERE R."航空公司" IS NOT NULL AND R."航空公司" != '') as "airlineCount",
  
  -- 新字段 4: isWeekend (是否周末: 5=周六, 6=周日)
  CASE 
    WHEN EXTRACT(DOW FROM R.日期) = 0 THEN true  -- 周日
    WHEN EXTRACT(DOW FROM R.日期) = 6 THEN true  -- 周六
    ELSE false
  END as "isWeekend",
  
  -- 新字段 5: departureTime (最常见的起飞时间)
  MODE() WITHIN GROUP (ORDER BY R."起飞时间") FILTER (WHERE R."起飞时间" IS NOT NULL) as "departureTime",
  
  -- 新字段 6: arrivalTime (最常见的降落时间)
  MODE() WITHIN GROUP (ORDER BY R."降落时间") FILTER (WHERE R."降落时间" IS NOT NULL) as "arrivalTime",
  
  -- 新字段 7: timeOfDayFactor (时段因子)
  CASE 
    WHEN TSF.slot_avg_price IS NOT NULL AND TSF.overall_avg_price > 0 
    THEN TSF.slot_avg_price / TSF.overall_avg_price
    ELSE NULL
  END as "timeOfDayFactor",
  
  -- 统计信息
  COUNT(*) as "sampleCount",
  MIN(R."价格元") as "minPrice",
  MAX(R."价格元") as "maxPrice",
  STDDEV(R."价格元") as "stdDev",
  
  NOW() as "createdAt", 
  NOW() as "updatedAt"

FROM "RawFlightData" R
JOIN "DayOfWeekFactor" DOWF ON DOWF."dayOfWeek" = (
  CASE 
    WHEN EXTRACT(DOW FROM R.日期) = 0 THEN 6  
    ELSE EXTRACT(DOW FROM R.日期) - 1          
  END
)
LEFT JOIN route_yearly_avg RYA ON RYA.route_id = CONCAT(R."出发城市", '->', R."到达城市")
LEFT JOIN time_slot_factor TSF ON 
  TSF.route_id = CONCAT(R."出发城市", '->', R."到达城市")
  AND TSF.month = EXTRACT(MONTH FROM R.日期)::INTEGER
  AND TSF.day_of_week = (
    CASE 
      WHEN EXTRACT(DOW FROM R.日期) = 0 THEN 6  
      ELSE EXTRACT(DOW FROM R.日期) - 1          
    END
  )

WHERE R."价格元" > 0 AND R."价格元" < 100000

GROUP BY 
  1, 2, 3, 10, 11, DOWF.factor, RYA.yearly_avg_price, TSF.slot_avg_price, TSF.overall_avg_price

ON CONFLICT ("routeId", month, "dayOfWeek") DO UPDATE SET
  "monthlyBasePrice" = EXCLUDED."monthlyBasePrice",
  "dayOfWeekFactor" = EXCLUDED."dayOfWeekFactor",
  "distanceKm" = COALESCE(EXCLUDED."distanceKm", "FlightPriceDetail"."distanceKm"),
  "monthFactor" = COALESCE(EXCLUDED."monthFactor", "FlightPriceDetail"."monthFactor"),
  "airlineCount" = COALESCE(EXCLUDED."airlineCount", "FlightPriceDetail"."airlineCount"),
  "isWeekend" = COALESCE(EXCLUDED."isWeekend", "FlightPriceDetail"."isWeekend"),
  "departureTime" = COALESCE(EXCLUDED."departureTime", "FlightPriceDetail"."departureTime"),
  "arrivalTime" = COALESCE(EXCLUDED."arrivalTime", "FlightPriceDetail"."arrivalTime"),
  "timeOfDayFactor" = COALESCE(EXCLUDED."timeOfDayFactor", "FlightPriceDetail"."timeOfDayFactor"),
  "sampleCount" = EXCLUDED."sampleCount",
  "minPrice" = EXCLUDED."minPrice",
  "maxPrice" = EXCLUDED."maxPrice",
  "stdDev" = EXCLUDED."stdDev",
  "updatedAt" = NOW(),
  "originAirport" = COALESCE(EXCLUDED."originAirport", "FlightPriceDetail"."originAirport"),
  "originAirportLongitude" = COALESCE(EXCLUDED."originAirportLongitude", "FlightPriceDetail"."originAirportLongitude"),
  "originAirportLatitude" = COALESCE(EXCLUDED."originAirportLatitude", "FlightPriceDetail"."originAirportLatitude"),
  "destinationAirport" = COALESCE(EXCLUDED."destinationAirport", "FlightPriceDetail"."destinationAirport"),
  "destinationAirportLongitude" = COALESCE(EXCLUDED."destinationAirportLongitude", "FlightPriceDetail"."destinationAirportLongitude"),
  "destinationAirportLatitude" = COALESCE(EXCLUDED."destinationAirportLatitude", "FlightPriceDetail"."destinationAirportLatitude");

