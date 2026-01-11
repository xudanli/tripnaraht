-- ============================================
-- 冰岛 POI 查询 SQL 语句集合
-- ============================================
-- 数据库表: poi_canonical
-- 冰岛国家代码: IS
-- 冰岛POI总数: 约 12,812 个
-- ============================================

-- ============================================
-- 1. 查询所有冰岛 POI（基础查询）
-- ============================================
SELECT 
    poi_id,
    source,
    source_key,
    name_default,
    name_i18n,
    category,
    lat,
    lng,
    address,
    opening_hours,
    phone,
    website,
    tags_slim,
    region_key,
    region_name,
    altitude_hint,
    created_at,
    updated_at
FROM poi_canonical
WHERE region_key LIKE 'IS%'
   OR region_name ILIKE '%iceland%'
ORDER BY region_key, category, name_default;

-- ============================================
-- 2. 按区域统计冰岛 POI 数量
-- ============================================
SELECT 
    region_key,
    region_name,
    COUNT(*) as poi_count
FROM poi_canonical
WHERE region_key LIKE 'IS%'
   OR region_name ILIKE '%iceland%'
GROUP BY region_key, region_name
ORDER BY poi_count DESC;

-- ============================================
-- 3. 按分类统计冰岛 POI 数量
-- ============================================
SELECT 
    category,
    COUNT(*) as poi_count
FROM poi_canonical
WHERE region_key LIKE 'IS%'
   OR region_name ILIKE '%iceland%'
GROUP BY category
ORDER BY poi_count DESC;

-- ============================================
-- 4. 查询特定区域的 POI（例如：雷克雅未克）
-- ============================================
SELECT 
    poi_id,
    name_default,
    category,
    lat,
    lng,
    address,
    tags_slim
FROM poi_canonical
WHERE region_key = 'IS_REYKJAVIK'
ORDER BY category, name_default;

-- ============================================
-- 5. 查询特定分类的 POI（例如：自然景点）
-- ============================================
SELECT 
    poi_id,
    name_default,
    category,
    lat,
    lng,
    region_key,
    region_name,
    tags_slim
FROM poi_canonical
WHERE (region_key LIKE 'IS%' OR region_name ILIKE '%iceland%')
  AND category = 'ATTRACTION_NATURE'
ORDER BY region_key, name_default;

-- ============================================
-- 6. 查询热门景点分类（自然景点、观景点、温泉等）
-- ============================================
SELECT 
    poi_id,
    name_default,
    name_i18n,
    category,
    lat,
    lng,
    address,
    website,
    tags_slim,
    region_key,
    region_name
FROM poi_canonical
WHERE (region_key LIKE 'IS%' OR region_name ILIKE '%iceland%')
  AND category IN (
      'ATTRACTION_NATURE',  -- 自然景点
      'VIEWPOINT',          -- 观景点
      'SPA_POOL',           -- 温泉/水疗
      'ATTRACTION'          -- 其他景点
  )
ORDER BY category, name_default;

-- ============================================
-- 7. 查询服务设施（加油站、超市、厕所等）
-- ============================================
SELECT 
    poi_id,
    name_default,
    category,
    lat,
    lng,
    address,
    opening_hours,
    phone,
    region_key,
    region_name
FROM poi_canonical
WHERE (region_key LIKE 'IS%' OR region_name ILIKE '%iceland%')
  AND category IN (
      'FUEL',           -- 加油站
      'SUPPLY',         -- 补给点
      'TOILETS',        -- 厕所
      'PARKING',        -- 停车场
      'INFORMATION'     -- 信息中心
  )
ORDER BY category, region_key, name_default;

-- ============================================
-- 8. 查询安全相关 POI（医院、诊所、警察局等）
-- ============================================
SELECT 
    poi_id,
    name_default,
    category,
    lat,
    lng,
    address,
    phone,
    region_key,
    region_name
FROM poi_canonical
WHERE (region_key LIKE 'IS%' OR region_name ILIKE '%iceland%')
  AND category IN (
      'HOSPITAL',       -- 医院
      'SAFETY',         -- 安全设施
      'PHARMACY'        -- 药房
  )
ORDER BY category, region_key, name_default;

-- ============================================
-- 9. 查询交通枢纽（机场、渡轮码头等）
-- ============================================
SELECT 
    poi_id,
    name_default,
    category,
    lat,
    lng,
    address,
    website,
    region_key,
    region_name
FROM poi_canonical
WHERE (region_key LIKE 'IS%' OR region_name ILIKE '%iceland%')
  AND category IN (
      'AIRPORT',            -- 机场
      'FERRY_TERMINAL',     -- 渡轮码头
      'PIER_DOCK',          -- 码头
      'HARBOUR'             -- 港口
  )
ORDER BY category, name_default;

-- ============================================
-- 10. 按地理范围查询（冰岛大致坐标范围）
-- ============================================
-- 冰岛大致范围：
-- 纬度: 63.0°N - 66.5°N
-- 经度: -25.0°W - -13.0°W
SELECT 
    poi_id,
    name_default,
    category,
    lat,
    lng,
    region_key,
    region_name
FROM poi_canonical
WHERE lat BETWEEN 63.0 AND 66.5
  AND lng BETWEEN -25.0 AND -13.0
ORDER BY lat, lng;

-- ============================================
-- 11. 查询特定区域的详细 POI（带标签信息）
-- ============================================
SELECT 
    poi_id,
    name_default,
    name_i18n,
    category,
    lat,
    lng,
    address,
    opening_hours,
    phone,
    website,
    tags_slim,
    region_key,
    region_name,
    altitude_hint
FROM poi_canonical
WHERE region_key = 'IS_GOLDEN_CIRCLE'  -- 可以替换为其他区域
ORDER BY category, name_default;

-- ============================================
-- 12. 搜索特定名称的 POI（支持模糊搜索）
-- ============================================
-- 例如：搜索包含 "waterfall" 或 "瀑布" 的 POI
SELECT 
    poi_id,
    name_default,
    name_i18n,
    category,
    lat,
    lng,
    region_key,
    region_name
FROM poi_canonical
WHERE (region_key LIKE 'IS%' OR region_name ILIKE '%iceland%')
  AND (
      name_default ILIKE '%waterfall%'
      OR name_default ILIKE '%瀑布%'
      OR name_i18n::text ILIKE '%waterfall%'
      OR name_i18n::text ILIKE '%瀑布%'
  )
ORDER BY name_default;

-- ============================================
-- 13. 查询原始 OSM 数据（poi_osm_raw 表）
-- ============================================
SELECT 
    id,
    osm_type,
    osm_id,
    tags,
    region_key,
    region_name,
    created_at
FROM poi_osm_raw
WHERE region_key LIKE 'IS%'
   OR region_name ILIKE '%iceland%'
ORDER BY created_at DESC
LIMIT 100;

-- ============================================
-- 14. 统计各区域 POI 分类分布
-- ============================================
SELECT 
    region_key,
    region_name,
    category,
    COUNT(*) as poi_count
FROM poi_canonical
WHERE region_key LIKE 'IS%'
   OR region_name ILIKE '%iceland%'
GROUP BY region_key, region_name, category
ORDER BY region_key, poi_count DESC;

-- ============================================
-- 15. 查询最近更新的冰岛 POI
-- ============================================
SELECT 
    poi_id,
    name_default,
    category,
    lat,
    lng,
    region_key,
    region_name,
    updated_at
FROM poi_canonical
WHERE (region_key LIKE 'IS%' OR region_name ILIKE '%iceland%')
ORDER BY updated_at DESC
LIMIT 100;

-- ============================================
-- 常用区域键值参考
-- ============================================
-- IS_REYKJAVIK          - 雷克雅未克 (7,737 POI)
-- IS_AKUREYRI           - 阿克雷里 (1,068 POI)
-- IS_EGILSSTADIR        - 埃伊尔斯塔济 (777 POI)
-- IS_GOLDEN_CIRCLE      - 黄金圈 (747 POI)
-- IS_SNAEFELLSNES       - 斯奈山半岛 (544 POI)
-- IS_LANDMANNALAUGAR    - 兰德曼纳劳卡 (485 POI)
-- IS_SOUTH_COAST        - 南岸 (361 POI)
-- IS_THORSMORK          - 索斯莫克 (273 POI)
-- IS_HUSAVIK            - 胡萨维克 (266 POI)
-- IS_HOFN               - 赫本 (249 POI)
-- ============================================

-- ============================================
-- 常用分类参考
-- ============================================
-- PARKING              - 停车场 (6,511)
-- TRANSIT              - 交通设施 (1,475)
-- INFORMATION          - 信息中心 (1,138)
-- ATTRACTION_NATURE    - 自然景点 (720)
-- VIEWPOINT            - 观景点 (634)
-- PIER_DOCK            - 码头 (401)
-- TOILETS              - 厕所 (323)
-- SPA_POOL             - 温泉/水疗 (297)
-- ATTRACTION           - 其他景点 (272)
-- SUPPLY               - 补给点 (221)
-- FUEL                 - 加油站 (216)
-- CAMPING              - 露营地 (213)
-- ============================================
