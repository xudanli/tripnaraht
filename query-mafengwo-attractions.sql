-- ============================================
-- 马蜂窝景点数据查询SQL语句
-- ============================================

-- 1. 查询所有马蜂窝来源的北京景点（基本信息）
SELECT 
  id,
  name,
  nameEN,
  address,
  rating,
  "cityId",
  metadata->>'source' as source,
  metadata->>'sourceUrl' as source_url,
  metadata->>'description' as description,
  metadata->>'phone' as phone,
  metadata->>'website' as website,
  metadata->>'openingHours' as opening_hours,
  metadata->>'ticketPrice' as ticket_price,
  metadata->>'city' as city,
  "createdAt",
  "updatedAt"
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
  AND (metadata->>'city' = '北京' OR address LIKE '%北京%')
ORDER BY name;

-- 2. 查询所有马蜂窝来源的景点（按城市分组）
SELECT 
  metadata->>'city' as city,
  COUNT(*) as count,
  AVG(rating) as avg_rating,
  MIN("createdAt") as first_created,
  MAX("updatedAt") as last_updated
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
GROUP BY metadata->>'city'
ORDER BY count DESC;

-- 3. 查询最近创建的30个马蜂窝景点
SELECT 
  id,
  name,
  address,
  rating,
  metadata->>'sourceUrl' as source_url,
  metadata->>'city' as city,
  "createdAt"
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
ORDER BY "createdAt" DESC
LIMIT 30;

-- 4. 查询有完整数据的景点（有地址、评分、描述、联系方式）
SELECT 
  id,
  name,
  address,
  rating,
  metadata->>'description' as description,
  metadata->>'phone' as phone,
  metadata->>'website' as website,
  metadata->>'openingHours' as opening_hours,
  metadata->>'ticketPrice' as ticket_price
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
  AND address IS NOT NULL
  AND address != ''
  AND rating IS NOT NULL
  AND metadata->>'description' IS NOT NULL
  AND (
    metadata->>'phone' IS NOT NULL 
    OR metadata->>'website' IS NOT NULL 
    OR metadata->>'openingHours' IS NOT NULL
  )
ORDER BY rating DESC, name;

-- 5. 查询北京的主要景点（按评分排序）
SELECT 
  id,
  name,
  address,
  rating,
  metadata->>'sourceUrl' as source_url,
  metadata->>'description' as description,
  metadata->>'openingHours' as opening_hours,
  metadata->>'ticketPrice' as ticket_price
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
  AND (metadata->>'city' = '北京' OR address LIKE '%北京%')
  AND rating IS NOT NULL
ORDER BY rating DESC, name
LIMIT 20;

-- 6. 统计信息查询
SELECT 
  COUNT(*) as total_count,
  COUNT(DISTINCT metadata->>'city') as city_count,
  AVG(rating) as avg_rating,
  COUNT(CASE WHEN address IS NOT NULL AND address != '' THEN 1 END) as with_address,
  COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as with_rating,
  COUNT(CASE WHEN metadata->>'description' IS NOT NULL THEN 1 END) as with_description,
  COUNT(CASE WHEN metadata->>'phone' IS NOT NULL THEN 1 END) as with_phone,
  COUNT(CASE WHEN metadata->>'website' IS NOT NULL THEN 1 END) as with_website,
  COUNT(CASE WHEN metadata->>'openingHours' IS NOT NULL THEN 1 END) as with_opening_hours,
  MIN("createdAt") as first_created,
  MAX("updatedAt") as last_updated
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo';

-- 7. 查询特定景点（例如：故宫、天安门等）
SELECT 
  id,
  name,
  nameEN,
  address,
  rating,
  metadata->>'sourceUrl' as source_url,
  metadata->>'description' as description,
  metadata->>'phone' as phone,
  metadata->>'website' as website,
  metadata->>'openingHours' as opening_hours,
  metadata->>'ticketPrice' as ticket_price,
  metadata->>'tags' as tags,
  metadata->>'images' as images,
  "createdAt",
  "updatedAt"
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
  AND name IN (
    '故宫', '天安门', '长城', '天坛', '颐和园', '圆明园',
    '北海公园', '什刹海', '恭王府', '雍和宫', '景山公园',
    '明十三陵', '鸟巢', '水立方', '798艺术区', '南锣鼓巷',
    '王府井', '前门大街', '香山公园', '北京动物园', '北京植物园',
    '天安门广场', '国家博物馆', '国家大剧院', '钟鼓楼',
    '孔庙和国子监', '地坛公园', '朝阳公园', '玉渊潭公园', '紫竹院公园'
  )
ORDER BY name;

-- 8. 查询有坐标信息的景点
SELECT 
  id,
  name,
  address,
  rating,
  ST_X(location::geometry) as longitude,
  ST_Y(location::geometry) as latitude,
  metadata->>'sourceUrl' as source_url
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
  AND location IS NOT NULL
ORDER BY name;

-- 9. 查询缺失数据的景点（需要补充信息）
SELECT 
  id,
  name,
  address,
  rating,
  CASE 
    WHEN address IS NULL OR address = '' THEN '缺少地址'
    WHEN rating IS NULL THEN '缺少评分'
    WHEN metadata->>'description' IS NULL THEN '缺少描述'
    WHEN metadata->>'phone' IS NULL AND metadata->>'website' IS NULL THEN '缺少联系方式'
    ELSE '数据完整'
  END as missing_info,
  metadata->>'sourceUrl' as source_url
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
  AND (
    address IS NULL 
    OR address = '' 
    OR rating IS NULL 
    OR metadata->>'description' IS NULL
    OR (metadata->>'phone' IS NULL AND metadata->>'website' IS NULL)
  )
ORDER BY name;

-- 10. 按评分区间统计
SELECT 
  CASE 
    WHEN rating >= 4.5 THEN '4.5-5.0'
    WHEN rating >= 4.0 THEN '4.0-4.5'
    WHEN rating >= 3.5 THEN '3.5-4.0'
    WHEN rating >= 3.0 THEN '3.0-3.5'
    WHEN rating IS NOT NULL THEN '3.0以下'
    ELSE '无评分'
  END as rating_range,
  COUNT(*) as count
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
GROUP BY 
  CASE 
    WHEN rating >= 4.5 THEN '4.5-5.0'
    WHEN rating >= 4.0 THEN '4.0-4.5'
    WHEN rating >= 3.5 THEN '3.5-4.0'
    WHEN rating >= 3.0 THEN '3.0-3.5'
    WHEN rating IS NOT NULL THEN '3.0以下'
    ELSE '无评分'
  END
ORDER BY rating_range DESC;

-- 11. 查询景点的详细信息（电话、开放时间、门票、交通等）
SELECT 
  id,
  name,
  address,
  rating,
  metadata->>'phone' as phone,
  metadata->>'openingHours' as opening_hours,
  metadata->>'ticketPrice' as ticket_price,
  metadata->>'visitDuration' as visit_duration,
  metadata->>'transportation' as transportation,
  metadata->>'description' as description,
  metadata->>'detailedDescription' as detailed_description,
  metadata->>'nearbyAttractions' as nearby_attractions,
  metadata->>'nearbyTransport' as nearby_transport,
  metadata->>'sourceUrl' as source_url,
  "updatedAt"
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
  AND name IN ('故宫', '天安门', '长城', '天坛', '颐和园', '圆明园')
ORDER BY name;

-- 12. 查询有完整详细信息的景点
SELECT 
  id,
  name,
  address,
  rating,
  CASE 
    WHEN metadata->>'phone' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_phone,
  CASE 
    WHEN metadata->>'openingHours' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_opening_hours,
  CASE 
    WHEN metadata->>'ticketPrice' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_ticket_price,
  CASE 
    WHEN metadata->>'transportation' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_transportation,
  CASE 
    WHEN metadata->>'detailedDescription' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_detailed_description,
  CASE 
    WHEN metadata->>'visitDuration' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_visit_duration
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
ORDER BY name;

-- 13. 查询特定景点的完整信息（例如：故宫）
SELECT 
  id,
  name,
  nameEN,
  address,
  rating,
  metadata->>'phone' as phone,
  metadata->>'website' as website,
  metadata->>'openingHours' as opening_hours,
  metadata->>'ticketPrice' as ticket_price,
  metadata->>'visitDuration' as visit_duration,
  metadata->>'transportation' as transportation,
  metadata->>'description' as description,
  metadata->>'detailedDescription' as detailed_description,
  metadata->>'nearbyAttractions' as nearby_attractions,
  metadata->>'nearbyTransport' as nearby_transport,
  metadata->>'tags' as tags,
  metadata->>'images' as images,
  metadata->>'sourceUrl' as source_url,
  "createdAt",
  "updatedAt"
FROM "Place"
WHERE category = 'ATTRACTION'
  AND name = '故宫'
  AND metadata->>'source' = 'mafengwo';

-- 14. 统计各字段的完整性
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN metadata->>'phone' IS NOT NULL THEN 1 END) as with_phone,
  COUNT(CASE WHEN metadata->>'openingHours' IS NOT NULL THEN 1 END) as with_opening_hours,
  COUNT(CASE WHEN metadata->>'ticketPrice' IS NOT NULL THEN 1 END) as with_ticket_price,
  COUNT(CASE WHEN metadata->>'transportation' IS NOT NULL THEN 1 END) as with_transportation,
  COUNT(CASE WHEN metadata->>'detailedDescription' IS NOT NULL THEN 1 END) as with_detailed_description,
  COUNT(CASE WHEN metadata->>'visitDuration' IS NOT NULL THEN 1 END) as with_visit_duration,
  COUNT(CASE WHEN metadata->>'nearbyAttractions' IS NOT NULL THEN 1 END) as with_nearby_attractions,
  COUNT(CASE WHEN metadata->>'nearbyTransport' IS NOT NULL THEN 1 END) as with_nearby_transport
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo';
